const { Client, GatewayIntentBits, Events } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === '!about') {
    message.reply('A simplified revision of the DJT Discord bot. Revised by [Krispy](https://guns.lol/krispenwah).');
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN in environment variables');
  process.exit(1);
}

client.login(token);