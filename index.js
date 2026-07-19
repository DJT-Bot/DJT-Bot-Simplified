const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

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
        activities: [{ name: 'Watching the Freak Shack', type: ActivityType.Watching }],
        status: 'online',
    });

    checkRedditFeed();
    setInterval(checkRedditFeed, 1800000);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'about') {
        await interaction.reply('A simplified revision of the DJT Discord bot. Revised by [Krispy](https://guns.lol/krispenwah). Source code available on [GitHub](https://github.com/DJT-Bot/DJT-Bot-Simplified).');
    }

    if (interaction.commandName === 'uptime') {
        const seconds = Math.floor(process.uptime());
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        await interaction.reply(`I've been playing golf for: ${h}h ${m}m ${s}s`);
    }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('Missing DISCORD_TOKEN in environment variables');
    process.exit(1);
}

client.login(token);