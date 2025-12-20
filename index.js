const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.BOT_TOKEN;

// ---------- Persistence ----------
const DATA_FILE = path.join(__dirname, "guildSettings.json");

// Default settings per server
function defaultSettings() {
  return {
    enabled: true,
    interval: 10,
    customMessage: "meow 😺",      // fallback if pool empty
    messagePool: ["meow 😺"],      // random pool
    counter: 0                    // per-guild counter
  };
}

// In-memory store
const settingsByGuild = new Map();

// Load from disk
function loadAll() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const obj = JSON.parse(raw);
    for (const [guildId, data] of Object.entries(obj)) {
      settingsByGuild.set(guildId, {
        ...defaultSettings(),
        ...data,
        // ensure arrays are sane
        messagePool: Array.isArray(data.messagePool) ? data.messagePool : defaultSettings().messagePool,
      });
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

// Save to disk (debounced so it won’t spam writes)
let saveTimer = null;
function saveAllSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj = Object.fromEntries(settingsByGuild.entries());
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }, 300);
}

// Get/create settings for a guild
function getGuildSettings(guildId) {
  if (!settingsByGuild.has(guildId)) {
    settingsByGuild.set(guildId, defaultSettings());
    saveAllSoon();
  }
  return settingsByGuild.get(guildId);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- Discord Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------- Slash Commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName("interval")
    .setDescription("Set how many messages until bot responds (this server only).")
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Number of messages").setRequired(true)
    ),

  new SlashCommandBuilder().setName("enable").setDescription("Enable auto mode (this server only)."),
  new SlashCommandBuilder().setName("disable").setDescription("Disable auto mode (this server only)."),

  new SlashCommandBuilder()
    .setName("edit")
    .setDescription("Change the fallback message (this server only).")
    .addStringOption(opt =>
      opt.setName("text").setDescription("The message to send").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("pooladd")
    .setDescription("Add a message to the random pool (this server only).")
    .addStringOption(opt =>
      opt.setName("text").setDescription("Message to add").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poolremove")
    .setDescription("Remove a message from the pool by number (see /poollist).")
    .addIntegerOption(opt =>
      opt.setName("index").setDescription("Message number to remove (1, 2, 3...)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poollist")
    .setDescription("Show the current random message pool (this server only)."),

  new SlashCommandBuilder()
    .setName("poolclear")
    .setDescription("Clear the random message pool (this server only)."),
].map(c => c.toJSON());

// Register commands on ready
client.once("ready", async () => {
  loadAll();

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    // Global commands (can take time to appear)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Global slash commands registered.");
  } catch (err) {
    console.error("❌ Command registration error:", err);
  }

  console.log(`Logged in as ${client.user.tag}`);
});

// ---------- Message Counter (per server) ----------
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild) return; // ignore DMs

  const s = getGuildSettings(msg.guild.id);
  if (!s.enabled) return;

  s.counter++;

  if (s.counter >= s.interval) {
    const text = (s.messagePool.length > 0) ? pickRandom(s.messagePool) : s.customMessage;
    msg.channel.send(text);
    s.counter = 0;
    saveAllSoon();
  }
});

// ---------- Slash Command Handler (per server) ----------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) {
    return interaction.reply({ content: "Use these commands in a server (not in DMs).", ephemeral: true });
  }

  const s = getGuildSettings(interaction.guildId);
  const name = interaction.commandName;

  if (name === "interval") {
    const amount = interaction.options.getInteger("amount");
    s.interval = Math.max(1, amount);
    s.counter = 0; // reset so it feels predictable after changing
    saveAllSoon();
    return interaction.reply(`✔ Interval for this server set to **${s.interval}** messages.`);
  }

  if (name === "enable") {
    s.enabled = true;
    saveAllSoon();
    return interaction.reply("✔ Auto mode **ENABLED** for this server 😺");
  }

  if (name === "disable") {
    s.enabled = false;
    saveAllSoon();
    return interaction.reply("❌ Auto mode **DISABLED** for this server");
  }

  if (name === "edit") {
    const text = interaction.options.getString("text");
    s.customMessage = text;
    saveAllSoon();
    return interaction.reply(`✔ Fallback message updated for this server:\n**${s.customMessage}**`);
  }

  if (name === "pooladd") {
    const text = interaction.options.getString("text");
    s.messagePool.push(text);
    saveAllSoon();
    return interaction.reply(`✔ Added to this server pool (#${s.messagePool.length}):\n**${text}**`);
  }

  if (name === "poolremove") {
    const index = interaction.options.getInteger("index");
    const i = index - 1;
    if (i < 0 || i >= s.messagePool.length) {
      return interaction.reply({ content: "❌ Invalid index. Use **/poollist** to see numbers.", ephemeral: true });
    }
    const removed = s.messagePool.splice(i, 1)[0];
    saveAllSoon();
    return interaction.reply(`🗑 Removed from this server pool (#${index}):\n**${removed}**`);
  }

  if (name === "poollist") {
    if (s.messagePool.length === 0) {
      return interaction.reply(`(Pool is empty) Fallback is:\n**${s.customMessage}**`);
    }
    const lines = s.messagePool.slice(0, 50).map((m, idx) => `${idx + 1}. ${m}`);
    const extra = s.messagePool.length > 50 ? `\n…and ${s.messagePool.length - 50} more.` : "";
    return interaction.reply(`📦 **Server Message Pool (${s.messagePool.length})**\n${lines.join("\n")}${extra}`);
  }

  if (name === "poolclear") {
    s.messagePool = [];
    saveAllSoon();
    return interaction.reply("🧹 Pool cleared for this server. Add new ones with **/pooladd**.");
  }
});

client.login(TOKEN);
