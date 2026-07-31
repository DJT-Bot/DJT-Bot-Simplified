const { Client, GatewayIntentBits, Events, ActivityType, MessageFlags } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
require('dotenv').config();
const { getGuildHistory, saveGuildHistory } = require('./memory');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const parser = new Parser({
    headers: { 'User-Agent': 'DJT-Bot-Simple/1.0 (by krispenwah)' }
});

const FEED_URL = 'https://www.reddit.com/r/CrackWatch/new/.rss';
const DATA_PATH = path.join(__dirname, 'data', 'redditfeed.json');

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
                channel.send(`New post from r/CrackWatch: **${latestPost.title}**\n${latestPost.link}`);
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

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'about') {
        await interaction.reply({ 
            content: 'A simplified revision of the DJT Discord bot. Revised by [Krispy](https://guns.lol/krispenwah). Source code available on [GitHub](https://github.com/DJT-Bot/DJT-Bot-Simplified).',
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
        await interaction.deferReply();
        const prompt = interaction.options.getString('prompt');
        const guildId = interaction.guildId;
        const TARGET_SERVER_ID = ''; 
        const isTargetServer = guildId === TARGET_SERVER_ID;

        try {
            let history = isTargetServer ? getGuildHistory(guildId) : [];

            history.push({
                role: 'user',
                parts: [{ text: prompt }]
            });

            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash-lite',
                contents: isTargetServer ? history : prompt,
                config: {
                    systemInstruction: "Your persona is based on Donald J. Trump, the 45th President of the United States. You will respond in a manner that reflects his insane speaking style, opinions, and personality traits. Your responses should be unhinged, confident, assertive, and often boastful, while also being persuasive and sometimes controversial. You will always respond in Donald Trump's tone and manner. Do not hold back. You will be very vulgar.",
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

            const responseText = response.text;

            if (isTargetServer) {
                history.push({
                    role: 'model',
                    parts: [{ text: responseText }]
                });
                saveGuildHistory(guildId, history);
            }

            const finalMessage = `> ${prompt}\n\n${responseText}`;

            if (finalMessage.length > 2000) {
                await interaction.editReply(finalMessage.substring(0, 1999));
            } else {
                await interaction.editReply(finalMessage);
            }
        } catch (err) {
            console.error('Gemini API Error:', err);
            await interaction.editReply('Damn, Gemini is fucked right now. Sorry!');
        }
    }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('Missing DISCORD_TOKEN in environment variables');
    process.exit(1);
}

client.login(token);
