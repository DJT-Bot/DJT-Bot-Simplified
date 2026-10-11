const { Client, GatewayIntentBits, Events, ActivityType, MessageFlags, PermissionFlagsBits, MessageContent, ReadMessageHistory } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
require('dotenv').config();
const { getGuildHistory, saveGuildHistory, getAngerLevel, saveAngerLevel } = require('./memory');

const TARGET_SERVER_ID = ''; 
const PROMPT_INSTRUCTIONS = `
`;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const parser = new Parser({
    headers: { 'User-Agent': 'DJT-Bot-Simple/1.0 (by krispenwah)' }
});

const FEED_URL = '';
const DATA_PATH = path.join(__dirname, 'data', 'redditfeed.json');

function sanitizeText(text) {
    return text
        .split('\n')
        .filter(line => !/\[(?:Prompt|History|Recent)\s*,/i.test(line))
        .join('\n')
        .trim();
}

async function checkRedditFeed() {
    try {
        const rawData = fs.readFileSync(DATA_PATH, 'utf8');
        const data = JSON.parse(rawData);
        const lastSeen = new Date(data.lastSeen);
        
        const feed = await parser.parseURL(FEED_URL);
        const latestPost = feed.items[0];
        const postDate = new Date(latestPost.isoDate);

        if (postDate > lastSeen) {
            const channel = await client.channels.fetch(process.env.CHANNEL_ID);
            if (channel) {
                channel.send(`New post from: **${latestPost.title}**\n${latestPost.link}`);
            }
            data.lastSeen = latestPost.isoDate;
            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Error checking Reddit feed:', err);
    }
}

client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    
    client.user.setPresence({
        activities: [{ name: 'Playing in the White house', type: ActivityType.Playing }],
        status: 'idle',
    });

    checkRedditFeed();
    setInterval(checkRedditFeed, 1800000);
});

// Global safety net — add near the top of the file, before client.login
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'about') {
        await interaction.reply({ 
            content: 'A simplified revision of the DJT Discord bot. Revised by [Krispy](https://guns.lol/krispenwah) and Zanzort. Source code available on [GitHub](https://github.com/DJT-Bot/DJT-Bot-Simplified).',
            flags: [MessageFlags.SuppressEmbeds] 
        });
    }

    if (interaction.commandName === 'uptime') {
        const seconds = Math.floor(process.uptime());
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        await interaction.reply(`I've been playing golf for: ${h}h ${m}m ${s}s`);
    }

    if (interaction.commandName === 'ask') {
        try {
            await interaction.deferReply();
        } catch (err) {
            try {
                await interaction.reply({
                    content: 'Donald Trump had an aneurysm, try again in a bit!',
                    flags: [MessageFlags.Ephemeral],
                });
            } catch (fallbackErr) {
                console.error('Fallback to /ask has failed: ', fallbackErr);
            }
            return;
        }

        const prompt = interaction.options.getString('prompt');

        const usePrivate = (interaction.options.getBoolean('private') ?? false) || !interaction.guildId;
        const memoryKey = interaction.guildId
            ? (usePrivate ? `${interaction.guildId}-user-${interaction.user.id}` : interaction.guildId)
            : `dm-${interaction.user.id}`;

        try {
            let history = await getGuildHistory(memoryKey);
            let contents = [...history];
            
            const displayName = interaction.member?.displayName ?? interaction.user.username;
            
                // --- anger system ---
            const ANGER_MAX = 10;
            const ANGER_DECAY_MS = 3 * 60 * 1000;

            let angerState = await getAngerLevel(memoryKey) ?? { level: 0, lastAsk: 0 };

            const now = Date.now();
            if (angerState.lastAsk && now - angerState.lastAsk > ANGER_DECAY_MS) {
                // cool down a bit if it's been a while since the last ask
                angerState.level = Math.max(0, angerState.level - 5);
            }

            let increment;
            if (angerState.level < 2) {
                increment = 0.25;
            } else if (angerState.level < 4) {
                increment = 0.225;
            } else if (angerState.level < 6) {
                increment = 0.2;
            } else if (angerState.level < 8) {
                increment = 0.175;
            } else {
                increment = 0.15;
            }

            angerState.level = Math.min(ANGER_MAX, angerState.level + increment);
            angerState.lastAsk = now;
            await saveAngerLevel(memoryKey, angerState);

            const angerLevel = angerState.level;

            // describe the anger tier in words so the model has something concrete to play off
            const angerDescriptor =
                angerLevel <= 2 ? '' :
                angerLevel <= 4 ? '' :
                angerLevel <= 6 ? '' :
                angerLevel <= 8 ? '' :
                `
                `;

            const angerInstruction = `\n\n
            [Current anger level: ${angerLevel}/${ANGER_MAX} — ${angerDescriptor}. 
            `;

            // first, get the actual prompt, this is the first thing he gets
            contents.push({
                role: 'user',
                parts: [{ text: `[Prompt, treat this as if you are directly being asked a question.] ${displayName} asks: ${prompt}` }]
            });

            // lastly, get the history of any recorded conversations you had with him
            history.push({
                role: 'user',
                parts: [{ text: `[History, for awareness only.] ${interaction.user.username} asked: ${prompt}` }]
            });
            
            // then, get the context of the conversation
            if (!usePrivate) {
                const fetched = await interaction.channel.messages.fetch({ limit: 15 });
                const recentmessages = Array.from(fetched.values());
 
                const contextLines = recentmessages
                    .filter(m => m.content && m.content.trim().length > 0)
                    .map(m => `${m.member?.displayName ?? m.author.username}: ${m.content}`)
                    .join('\n');
 
                if (contextLines) {
                    contents.push({
                        role: 'user',
                        parts: [{
                            text: `[Recent channel context, for awareness only.] \n${contextLines}`
                        }]
                    });
                }
            }

            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
                contents: contents,
                config: {
                    systemInstruction: PROMPT_INSTRUCTIONS + angerInstruction,
                    safetySettings: [
                        {
                            category: 'HARM_CATEGORY_HARASSMENT',
                            threshold: 'BLOCK_NONE',
                        },
                        {
                            category: 'HARM_CATEGORY_HATE_SPEECH',
                            threshold: 'BLOCK_NONE',
                        },
                        {
                            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                            threshold: 'BLOCK_NONE',
                        },
                        {
                            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                            threshold: 'BLOCK_NONE',
                        }
                    ],
                },
            });

            const responseText = sanitizeText(response.text);

            history.push({
                role: 'model',
                parts: [{ text: responseText }]
            });
            await saveGuildHistory(memoryKey, history);

            const promptBlock = sanitizeText(prompt)
                .split('\n')
                .map(line => `> ${line}`)
                .join('\n');

            const finalMessage = `${promptBlock}\n\n${responseText}`;

            if (finalMessage.length > 2000) {
                await interaction.editReply(promptBlock.length > 2000 ? promptBlock.substring(0, 1999) : promptBlock);
                await interaction.followUp(responseText.length > 2000 ? responseText.substring(0, 1999) : responseText);
            } else {
                await interaction.editReply(finalMessage);
            }
        } catch (err) {
            console.error('Gemini API Error:', err);
            await interaction.editReply('Trump is pissed right now, his shit bag has popped. Shit is everywhere. This is all your fault.');
        }
    }

    if (interaction.commandName === 'setanger') {
        const level = interaction.options.getNumber('level');
        const setGuild = interaction.options.getBoolean('guild') ?? false;

        if (!setGuild) {
            const memoryKey = interaction.guildId
                ? `${interaction.guildId}-user-${interaction.user.id}`
                : `dm-${interaction.user.id}`;
            try {
                await saveAngerLevel(memoryKey, { level, lastAsk: Date.now() });
                await interaction.reply({
                    content: `Donalds anger has been set to ${level}/10.`,
                    flags: [MessageFlags.Ephemeral],
                });
            } catch (err) {
                console.error('Set anger error:', err);
                await interaction.reply({
                    content: 'Something went wrong setting Donalds anger level',
                    flags: [MessageFlags.Ephemeral],
                });
            }
            return;
        }

        if (!interaction.inGuild()) {
            return interaction.reply({
                content: 'Guild anger level can only be set from within a guild!',
                flags: [MessageFlags.Ephemeral],
            });
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
        if (!isAdmin) {
            return interaction.reply({
                content: `Only server admins can set this server's anger level`,
                flags: [MessageFlags.Ephemeral],
            });
        }

        try {
            await saveAngerLevel(interaction.guildId, { level, lastAsk: Date.now() });
            await interaction.reply({ content: `Server anger level set to ${level}/10.` });
        } catch (err) {
            console.error('Set anger error:', err);
            await interaction.reply({
                content: 'Something went wrong setting the server anger level',
                flags: [MessageFlags.Ephemeral],
            });
        }
    }

    if (interaction.commandName === 'checkanger') {
        const checkGuild = interaction.options.getBoolean('guild') ?? false;

        const memoryKey = checkGuild
            ? interaction.guildId
            : (interaction.guildId
                ? `${interaction.guildId}-user-${interaction.user.id}`
                : `dm-${interaction.user.id}`);

        if (checkGuild && !interaction.inGuild()) {
            return interaction.reply({
                content: 'Server anger level can only be checked from within a guild!',
                flags: [MessageFlags.Ephemeral],
            });
        }

        try {
            const angerState = await getAngerLevel(memoryKey);
            const level = angerState.level ?? 0;

            let angerDescriptor =
                level <= 2 ? '' :
                level <= 4 ? '' :
                level <= 6 ? '' :
                level <= 8 ? '' :
                `
                `;
            
                angerDescriptor = angerDescriptor
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .join(' ')
                    .replace(/\*+/g, '')
                    .trim();

            await interaction.reply({
                content: `**${checkGuild ? 'Server' : 'Your'} anger level:** ${level.toFixed(2)}/10\n${angerDescriptor}`,
                flags: [MessageFlags.Ephemeral],
            });
        } catch (err) {
            console.error('Check anger error:', err);
            await interaction.reply({
                content: 'Something went wrong checking the anger level',
                flags: [MessageFlags.Ephemeral],
            });
        }
    }

    if (interaction.commandName === 'clearmemory') {
        const clearGuild = interaction.options.getBoolean('guild') ?? false;

        // Default: clear the invoking user's own memory (works in guild or DM)
        if (!clearGuild) {
            const memoryKey = interaction.guildId
                ? `${interaction.guildId}-user-${interaction.user.id}`
                : `dm-${interaction.user.id}`;
            try {
                await saveGuildHistory(memoryKey, []);
                await saveAngerLevel(memoryKey, { level: 0, lastAsk: 0 });
                await interaction.reply({
                    content: 'Your personal history has been wiped. Donald Trump has his lips sealed.',
                    flags: [MessageFlags.Ephemeral],
                });
            } catch (err) {
                console.error('Clear history error:', err);
                await interaction.reply({
                    content: 'Something went wrong clearing your history',
                    flags: [MessageFlags.Ephemeral],
                });
            }
            return;
        }

        if (!interaction.inGuild()) {
            return interaction.reply({
                content: 'Guild memory can only be cleared from within a guild!',
                flags: [MessageFlags.Ephemeral],
            });
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
        if (!isAdmin) {
            return interaction.reply({
                content: `Only server admins can clear this server's memory`,
                flags: [MessageFlags.Ephemeral],
            });
        }

        try {
            await saveGuildHistory(interaction.guildId, []);
            await saveAngerLevel(interaction.guildId, { level: 0, lastAsk: 0 });
            await interaction.reply({ content: 'History cleared for this server' });
        } catch (err) {
            console.error('Clear history error:', err);
            await interaction.reply({
                content: 'Something went wrong clearing server history',
                flags: [MessageFlags.Ephemeral],
            });
        }
    }

});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('Missing DISCORD_TOKEN in environment variables');
    process.exit(1);
}

client.login(token);
