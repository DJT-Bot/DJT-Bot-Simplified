const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder()
        .setName('about')
        .setDescription('Shows bot info')
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),
        
    new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Shows how long DJT has been online')
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),

    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Mr. President something.')
        .addStringOption(option =>
            option
                .setName('prompt')
                .setDescription('What do you want to ask?')
                .setRequired(true)
        )
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing global application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('Successfully reloaded global application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
