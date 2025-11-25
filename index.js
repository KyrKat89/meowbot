const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let msgCount = 0;

client.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    msgCount++;
    if (msgCount >= 10) {
        msg.channel.send("meow 😺");
        msgCount = 0;
    }
});

client.login(process.env.BOT_TOKEN);
