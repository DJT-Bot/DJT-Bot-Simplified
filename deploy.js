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
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription(`Donald will only remember the conversation he's had with you personally`)
                .setRequired(false)
        )
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),

    new SlashCommandBuilder()
        .setName('clearmemory')
        .setDescription(`This psyop isn't working on Donald. Wipe his shit.`)
        .addBooleanOption(option =>
            option
                .setName('guild')
                .setDescription('Wipe what Donald Trump remembers from this server (admin only)')
                .setRequired(false)
        )
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),

    new SlashCommandBuilder()
        .setName('setanger')
        .setDescription(`Manually set how pissed off Donald is. (His orange-ness reflects how angry he is)`)
        .addNumberOption(option =>
            option
                .setName('level')
                .setDescription('Anger level from 0 to 10')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(10)
        )
        .addBooleanOption(option =>
            option
                .setName('guild')
                .setDescription('Set the anger level for this whole server instead of just you (admin only)')
                .setRequired(false)
        )
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),

    new SlashCommandBuilder()
        .setName('checkanger')
        .setDescription(`See how pissed off Donald currently is.`)
        .addBooleanOption(option =>
            option
                .setName('guild')
                .setDescription('Check the server-wide anger level instead of your own')
                .setRequired(false)
        )
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing global application (/) commands.');

        const existing = await rest.get(
            Routes.applicationCommands(process.env.CLIENT_ID),
        );

        // Entry Point commands are type 4 (PRIMARY_ENTRY_POINT), created automatically
        // when Activities is enabled — must be preserved in bulk updates.
        const entryPoint = existing.find(cmd => cmd.type === 4);

        const body = entryPoint ? [...commands, entryPoint] : commands;

        if (!entryPoint) {
            console.log('No entry point command found — Activities may not be fully enabled yet.');
        }
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body },
        );

        console.log('Successfully reloaded global application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
