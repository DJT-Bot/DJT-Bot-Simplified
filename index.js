const { Client, GatewayIntentBits, Events, ActivityType, MessageFlags } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const parser = new Parser({
    headers: { 'User-Agent': 'DJT-Bot-Simple/1.0 ()' }
});

const FEED_URL = '';
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
                channel.send(`**${latestPost.title}**\n${latestPost.link}`);
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
        activities: [{ name: '', type: ActivityType.Playing }],
        status: 'idle',
    });

    checkRedditFeed();
    setInterval(checkRedditFeed, 1800000);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'about') {
        await interaction.reply({ 
            content: '',
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

        try {
            const response = await ai.models.generateContent({
                model: '',
                contents: prompt,
                config: {
                    systemInstruction: "",
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
