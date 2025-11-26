const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require("discord.js");

const TOKEN = process.env.BOT_TOKEN;

// ---- Bot State ----
let enabled = true;
let interval = 10;
let customMessage = "meow 😺";
let counter = 0;

// ---- Create Client ----
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ---- Slash Commands ----
const commands = [
    new SlashCommandBuilder()
        .setName("interval")
        .setDescription("Set how many messages until bot responds.")
        .addIntegerOption(opt =>
            opt.setName("amount")
            .setDescription("Number of messages")
            .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("enable")
        .setDescription("Enable auto-meow mode"),

    new SlashCommandBuilder()
        .setName("disable")
        .setDescription("Disable auto-meow mode"),

    new SlashCommandBuilder()
        .setName("edit")
        .setDescription("Change the auto message")
        .addStringOption(opt =>
            opt.setName("text")
            .setDescription("The message to send")
            .setRequired(true)
        )
].map(cmd => cmd.toJSON());

// ---- Register slash commands ----
client.once("ready", async () => {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log("Slash commands registered.");
    } catch (err) {
        console.error(err);
    }

    console.log(`Logged in as ${client.user.tag}`);
});

// ---- Message Counter ----
client.on("messageCreate", (msg) => {
    if (msg.author.bot) return;
    if (!enabled) return;

    counter++;

    if (counter >= interval) {
        msg.channel.send(customMessage);
        counter = 0;
    }
});

// ---- Slash Command Handler ----
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "interval") {
        const amount = interaction.options.getInteger("amount");
        interval = Math.max(1, amount);
        await interaction.reply(`✔ Interval set to **${interval}** messages.`);
    }

    if (interaction.commandName === "enable") {
        enabled = true;
        await interaction.reply("✔ Auto-meow **ENABLED** 😺");
    }

    if (interaction.commandName === "disable") {
        enabled = false;
        await interaction.reply("❌ Auto-meow **DISABLED**");
    }

    if (interaction.commandName === "edit") {
        const text = interaction.options.getString("text");
        customMessage = text;
        await interaction.reply(`✔ Auto message updated:\n**${customMessage}**`);
    }
});

client.login(TOKEN);
