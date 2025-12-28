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

/* ================= ENV ================= */
const TOKEN = process.env.DISCORD_TOKEN; // ✅ FIXED
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

const OWNER_ID = "1164912728087986277";
const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID || "1443129460390887454";
const SUPPORT_INVITE = "https://discord.gg/kphZKb3uBP";

/* ================= FILES ================= */
const SETTINGS_FILE = path.join(__dirname, "guildSettings.json");
const SUPPORTERS_FILE = path.join(__dirname, "supporters.json");

/* ================= DEFAULTS ================= */
const BASE_SLOTS = 5;

function defaultGuildSettings() {
  return {
    enabled: true,
    interval: 10,
    customMessage: "meow 😺",
    messagePool: ["meow 😺"],
    counter: 0,
  };
}

/* ================= STORES ================= */
const settingsByGuild = new Map();
let supportersByGuild = {};

/* ================= FS HELPERS ================= */
function safeReadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Failed reading ${file}:`, e);
    return fallback;
  }
}

function safeWriteJSON(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error(`Failed writing ${file}:`, e);
  }
}

function loadAll() {
  const rawSettings = safeReadJSON(SETTINGS_FILE, {});
  for (const [guildId, data] of Object.entries(rawSettings)) {
    settingsByGuild.set(guildId, {
      ...defaultGuildSettings(),
      ...data,
      messagePool: Array.isArray(data.messagePool)
        ? data.messagePool
        : defaultGuildSettings().messagePool,
    });
  }
  supportersByGuild = safeReadJSON(SUPPORTERS_FILE, {});
}

let saveTimer = null;
function saveAllSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    safeWriteJSON(SETTINGS_FILE, Object.fromEntries(settingsByGuild.entries()));
    safeWriteJSON(SUPPORTERS_FILE, supportersByGuild);
  }, 300);
}

function getGuildSettings(guildId) {
  if (!settingsByGuild.has(guildId)) {
    settingsByGuild.set(guildId, defaultGuildSettings());
    saveAllSoon();
  }
  return settingsByGuild.get(guildId);
}

/* ================= SLOTS ================= */
function getBonusSlots(guildId) {
  return supportersByGuild[guildId]
    ? Object.keys(supportersByGuild[guildId]).length
    : 0;
}
function getMaxSlotsForGuild(guildId) {
  return BASE_SLOTS + getBonusSlots(guildId);
}

/* ================= PERMS ================= */
function isStaff(interaction) {
  const perms = interaction.memberPermissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ||
         perms?.has(PermissionFlagsBits.Administrator);
}

/* ================= HELPERS ================= */
const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

async function findSpeakableChannel(guild) {
  try {
    if (guild.systemChannelId) {
      const ch = await guild.channels.fetch(guild.systemChannelId);
      if (ch?.isTextBased()) return ch;
    }
  } catch {}

  const me = guild.members.me;
  const channels = await guild.channels.fetch();

  for (const ch of channels.values()) {
    if (!ch.isTextBased()) continue;
    const perms = ch.permissionsFor(me);
    if (perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return ch;
    }
  }
  return null;
}

async function sendWelcomeMessage(guild) {
  const msg =
    `👋 meow! Thanks for inviting me 😺\n` +
    `• /interval — set frequency\n` +
    `• /pooladd — add random messages\n` +
    `• /poollist — view pool\n` +
    `Slots: ${BASE_SLOTS} + supporter bonuses\n` +
    `Support server: ${SUPPORT_INVITE}`;

  try {
    const ch = await findSpeakableChannel(guild);
    if (ch) await ch.send(msg);
  } catch (e) {
    console.error("Welcome message failed:", e);
  }
}

/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* ================= SLASH COMMANDS ================= */
const commands = [
  new SlashCommandBuilder().setName("interval").setDescription("Set message interval")
    .addIntegerOption(o => o.setName("amount").setRequired(true)),
  new SlashCommandBuilder().setName("enable").setDescription("Enable auto mode"),
  new SlashCommandBuilder().setName("disable").setDescription("Disable auto mode"),
  new SlashCommandBuilder().setName("edit").setDescription("Edit fallback message")
    .addStringOption(o => o.setName("text").setRequired(true)),
  new SlashCommandBuilder().setName("pooladd").setDescription("Add pool message")
    .addStringOption(o => o.setName("text").setRequired(true)),
  new SlashCommandBuilder().setName("poolremove").setDescription("Remove pool message")
    .addIntegerOption(o => o.setName("index").setRequired(true)),
  new SlashCommandBuilder().setName("poollist").setDescription("List pool"),
  new SlashCommandBuilder().setName("poolclear").setDescription("Clear pool"),
  new SlashCommandBuilder().setName("supportadd").setDescription("Add support"),
  new SlashCommandBuilder().setName("supportremove").setDescription("Remove support"),
].map(c => c.toJSON());

/* ================= READY ================= */
client.once("ready", async () => {
  loadAll();

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (e) {
    console.error("❌ Slash command error:", e);
  }

  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ================= GUILD JOIN ================= */
client.on("guildCreate", sendWelcomeMessage);

/* ================= MESSAGE HANDLER ================= */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (msg.author.id === OWNER_ID && msg.content.startsWith("..meowbot globalmessage ")) {
    const text = msg.content.slice(26).trim();
    if (!text) return;

    let sent = 0;
    for (const guild of client.guilds.cache.values()) {
      try {
        const ch = await findSpeakableChannel(guild);
        if (ch) {
          await ch.send(text);
          sent++;
          await new Promise(r => setTimeout(r, 1800));
        }
      } catch {}
    }
    return msg.reply(`✅ Broadcast sent to ${sent} servers`);
  }

  const s = getGuildSettings(msg.guild.id);
  if (!s.enabled) return;

  s.counter++;
  if (s.counter >= s.interval) {
    s.counter = 0;
    saveAllSoon();

    if (msg.channel.permissionsFor(msg.guild.members.me)?.has("SendMessages")) {
      const text = s.messagePool.length
        ? pickRandom(s.messagePool)
        : s.customMessage;
      await msg.channel.send(text);
    }
  }
});

/* ================= INTERACTIONS ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  const guildId = interaction.guildId;
  const s = getGuildSettings(guildId);
  const name = interaction.commandName;

  const staffOnly = new Set(["interval", "enable", "disable", "edit", "pooladd", "poolremove", "poolclear"]);
  if (staffOnly.has(name) && !isStaff(interaction)) {
    return interaction.reply({ content: "❌ Staff only", ephemeral: true });
  }

  if (name === "interval") {
    s.interval = Math.max(1, interaction.options.getInteger("amount"));
    s.counter = 0;
    saveAllSoon();
    return interaction.reply(`✔ Interval set to ${s.interval}`);
  }

  if (name === "enable") { s.enabled = true; saveAllSoon(); return interaction.reply("Enabled 😺"); }
  if (name === "disable") { s.enabled = false; saveAllSoon(); return interaction.reply("Disabled"); }

  if (name === "edit") {
    s.customMessage = interaction.options.getString("text");
    saveAllSoon();
    return interaction.reply("✔ Updated");
  }

  if (name === "pooladd") {
    const max = getMaxSlotsForGuild(guildId);
    if (s.messagePool.length >= max) {
      return interaction.reply(`❌ Pool full (${max}). Join: ${SUPPORT_INVITE}`);
    }
    s.messagePool.push(interaction.options.getString("text"));
    saveAllSoon();
    return interaction.reply("✔ Added");
  }

  if (name === "poolremove") {
    const i = interaction.options.getInteger("index") - 1;
    if (i < 0 || i >= s.messagePool.length) return interaction.reply("❌ Invalid index");
    s.messagePool.splice(i, 1);
    saveAllSoon();
    return interaction.reply("🗑 Removed");
  }

  if (name === "poolclear") {
    s.messagePool = [];
    saveAllSoon();
    return interaction.reply("🧹 Cleared");
  }

  if (name === "poollist") {
    const max = getMaxSlotsForGuild(guildId);
    return interaction.reply(
      `Slots ${s.messagePool.length}/${max}\n` +
      (s.messagePool.length
        ? s.messagePool.map((m, i) => `${i + 1}. ${m}`).join("\n")
        : `Fallback: ${s.customMessage}`)
    );
  }

  if (name === "supportadd") {
    try {
      const g = await client.guilds.fetch(SUPPORT_GUILD_ID);
      await g.members.fetch(interaction.user.id);

      supportersByGuild[guildId] ??= {};
      supportersByGuild[guildId][interaction.user.id] = true;
      saveAllSoon();

      return interaction.reply(`✅ Supported. Max slots: ${getMaxSlotsForGuild(guildId)}`);
    } catch {
      return interaction.reply({ content: `❌ Join support server first: ${SUPPORT_INVITE}`, ephemeral: true });
    }
  }

  if (name === "supportremove") {
    delete supportersByGuild[guildId]?.[interaction.user.id];
    saveAllSoon();
    return interaction.reply("✅ Support removed");
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);
