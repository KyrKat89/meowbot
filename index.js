const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const http = require("http");

/* ================= ENV ================= */
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN missing");
  process.exit(1);
}

console.log("✅ Token detected, length:", TOKEN.length);

/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // ---- START HTTP SERVER ONLY AFTER LOGIN ----
  const PORT = process.env.PORT || 3000;
  http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is running");
  }).listen(PORT, () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });
});

/* ================= LOGIN ================= */
client.login(TOKEN).catch(err => {
  console.error("❌ Discord login failed:");
  console.error(err);
  process.exit(1);
});
