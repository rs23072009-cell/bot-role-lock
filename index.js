require('dotenv').config();
const {
  ActionRowBuilder, AuditLogEvent, ChannelType, Client, EmbedBuilder, Events,
  GatewayIntentBits, PermissionFlagsBits, RoleSelectMenuBuilder
} = require('discord.js');
const Store = require('./src/store');

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) throw new Error('DISCORD_TOKEN manquant.');
const prefix = process.env.BOT_PREFIX?.trim() || ';';
const owners = new Set((process.env.OWNER_IDS || '949707800257384498').split(',').map(id => id.trim()).filter(Boolean));
const store = new Store(process.env.DATA_FILE || './data/role-lock.json');
const COLOR = 0xf59e0b;
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
] });

function allowed(member) {
  return owners.has(member.id) || member.id === member.guild.ownerId
    || member.permissions.has(PermissionFlagsBits.Administrator)
    || member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function roleProblem(guild, role) {
  if (!role) return 'Rôle introuvable.';
  if (role.id === guild.id) return 'Le rôle @everyone ne peut pas être verrouillé.';
  if (role.managed) return 'Ce rôle est géré par Discord ou une intégration.';
  if (role.position >= guild.members.me.roles.highest.position) return 'Place le rôle du bot au-dessus de ce rôle.';
  return null;
}

function panelPayload(guild) {
  const locked = store.guild(guild.id).lockedRoles.filter(id => guild.roles.cache.has(id));
  const embed = new EmbedBuilder().setColor(COLOR).setTitle('Verrouillage des rôles')
    .setDescription([
      'Sélectionne un rôle à verrouiller ou à déverrouiller.',
      '',
      locked.length ? `**Rôles verrouillés**\n${locked.map(id => `<@&${id}>`).join('\n')}` : '*Aucun rôle verrouillé.*'
    ].join('\n'));
  const lockMenu = new RoleSelectMenuBuilder().setCustomId('rolelock:lock').setPlaceholder('Verrouiller un rôle').setMinValues(1).setMaxValues(1);
  const unlockMenu = new RoleSelectMenuBuilder().setCustomId('rolelock:unlock').setPlaceholder('Déverrouiller un rôle').setMinValues(1).setMaxValues(1);
  return { embeds: [embed], components: [
    new ActionRowBuilder().addComponents(lockMenu),
    new ActionRowBuilder().addComponents(unlockMenu)
  ], allowedMentions: { parse: [] } };
}

async function refreshPanel(guild) {
  const config = store.guild(guild.id);
  if (!config.panelChannelId || !config.panelMessageId) return false;
  const channel = await guild.channels.fetch(config.panelChannelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(config.panelMessageId).catch(() => null) : null;
  if (!message) return false;
  await message.edit(panelPayload(guild));
  return true;
}

async function writeLog(guild, description) {
  const channelId = store.guild(guild.id).logChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('Role Lock').setDescription(description).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => {});
}

async function lockRole(guild, role, actor) {
  const problem = roleProblem(guild, role);
  if (problem) return problem;
  if (store.isLocked(guild.id, role.id)) return `${role} est déjà verrouillé.`;
  store.lock(guild.id, role.id);
  await refreshPanel(guild).catch(() => {});
  await writeLog(guild, `${actor} a verrouillé ${role}.`);
  return `${role} est maintenant verrouillé.`;
}

async function unlockRole(guild, role, actor) {
  if (!store.isLocked(guild.id, role.id)) return `${role} n’est pas verrouillé.`;
  store.unlock(guild.id, role.id);
  await refreshPanel(guild).catch(() => {});
  await writeLog(guild, `${actor} a déverrouillé ${role}.`);
  return `${role} est maintenant déverrouillé.`;
}

async function setup(message) {
  let channel = message.mentions.channels.first();
  if (!channel) channel = await message.guild.channels.create({
    name: '🔒・role-lock', type: ChannelType.GuildText,
    reason: `Configuration Role Lock par ${message.author.tag}`
  });
  if (!channel.isTextBased()) return message.reply('Choisis un salon textuel.');
  const config = store.guild(message.guild.id);
  let panelMessage = config.panelMessageId ? await channel.messages.fetch(config.panelMessageId).catch(() => null) : null;
  panelMessage = panelMessage ? await panelMessage.edit(panelPayload(message.guild)) : await channel.send(panelPayload(message.guild));
  store.set(message.guild.id, { panelChannelId: channel.id, panelMessageId: panelMessage.id });
  return message.reply({ content: `Panneau configuré dans ${channel}.`, allowedMentions: { repliedUser: false } });
}

client.once(Events.ClientReady, async ready => {
  for (const guild of ready.guilds.cache.values()) await refreshPanel(guild).catch(() => {});
  console.log(`Role Lock connecté : ${ready.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot || !message.content.startsWith(prefix)) return;
  const input = message.content.slice(prefix.length).trim().split(/\s+/);
  if (input.shift()?.toLowerCase() !== 'rolelock') return;
  if (!allowed(message.member)) return message.reply({ content: 'Tu n’as pas accès à cette commande.', allowedMentions: { repliedUser: false } });
  const action = input.shift()?.toLowerCase() || 'help';
  try {
    if (action === 'setup') return setup(message);
    if (action === 'lock') return message.reply(await lockRole(message.guild, message.mentions.roles.first(), message.author));
    if (action === 'unlock') return message.reply(await unlockRole(message.guild, message.mentions.roles.first(), message.author));
    if (action === 'list') {
      const roles = store.guild(message.guild.id).lockedRoles.filter(id => message.guild.roles.cache.has(id));
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('Rôles verrouillés').setDescription(roles.length ? roles.map(id => `<@&${id}>`).join('\n') : 'Aucun rôle verrouillé.')], allowedMentions: { parse: [] } });
    }
    if (action === 'status') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply(`Usage : \`${prefix}rolelock status @rôle\``);
      return message.reply(`${role} est **${store.isLocked(message.guild.id, role.id) ? 'verrouillé' : 'déverrouillé'}**.`);
    }
    if (action === 'logs') {
      if (input[0]?.toLowerCase() === 'off') { store.set(message.guild.id, { logChannelId: null }); return message.reply('Logs désactivés.'); }
      const channel = message.mentions.channels.first();
      if (!channel?.isTextBased()) return message.reply(`Usage : \`${prefix}rolelock logs #salon\` ou \`${prefix}rolelock logs off\`.`);
      store.set(message.guild.id, { logChannelId: channel.id });
      return message.reply(`Les logs seront envoyés dans ${channel}.`);
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('Role Lock').setDescription([
      `\`${prefix}rolelock setup [#salon]\``, `\`${prefix}rolelock lock @rôle\``, `\`${prefix}rolelock unlock @rôle\``,
      `\`${prefix}rolelock status @rôle\``, `\`${prefix}rolelock list\``, `\`${prefix}rolelock logs #salon|off\``
    ].join('\n'))] });
  } catch (error) {
    console.error(error);
    return message.reply('Une erreur est survenue. Vérifie les permissions et la hiérarchie du bot.').catch(() => {});
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.inGuild() || !interaction.isRoleSelectMenu() || !interaction.customId.startsWith('rolelock:')) return;
  if (!allowed(interaction.member)) return interaction.reply({ content: 'Tu n’as pas accès à ce panneau.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const role = interaction.guild.roles.cache.get(interaction.values[0]);
  const text = interaction.customId.endsWith(':lock')
    ? await lockRole(interaction.guild, role, interaction.user)
    : await unlockRole(interaction.guild, role, interaction.user);
  return interaction.editReply(text);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  const locked = added.filter(role => store.isLocked(newMember.guild.id, role.id));
  for (const role of locked.values()) {
    if (role.position >= newMember.guild.members.me.roles.highest.position) {
      await writeLog(newMember.guild, `Impossible de retirer ${role} à ${newMember} : rôle trop haut.`);
      continue;
    }
    await newMember.roles.remove(role, 'Role Lock : rôle verrouillé').catch(() => {});
    const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 6 }).catch(() => null);
    const entry = audit?.entries.find(item => item.target?.id === newMember.id && Date.now() - item.createdTimestamp < 10000);
    await writeLog(newMember.guild, `${role} a été retiré de ${newMember}.${entry?.executor ? ` Attribution tentée par ${entry.executor}.` : ''}`);
  }
});

client.on(Events.GuildRoleDelete, role => {
  if (store.isLocked(role.guild.id, role.id)) store.unlock(role.guild.id, role.id);
});

client.login(token);

