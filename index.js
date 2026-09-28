require('dotenv').config();
const {
  ActionRowBuilder, AuditLogEvent, ChannelType, Client, EmbedBuilder, Events,
  GatewayIntentBits, PermissionFlagsBits, REST, RoleSelectMenuBuilder, Routes,
  SlashCommandBuilder, StringSelectMenuBuilder
} = require('discord.js');
const Store = require('./src/store');

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) throw new Error('DISCORD_TOKEN manquant.');
const owners = new Set((process.env.OWNER_IDS || '949707800257384498').split(',').map(id => id.trim()).filter(Boolean));
const store = new Store(process.env.DATA_FILE || './data/role-lock.json');
const COLOR = 0xf59e0b;
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers
] });
const commands = [
  new SlashCommandBuilder().setName('rolelock').setDescription('Gère le verrouillage des rôles')
    .addSubcommand(command => command.setName('setup').setDescription('Crée ou actualise le panneau de gestion')
      .addChannelOption(option => option.setName('salon').setDescription('Salon du panneau').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(command => command.setName('verrouiller').setDescription('Bloque toute nouvelle attribution')
      .addRoleOption(option => option.setName('role').setDescription('Rôle à verrouiller').setRequired(true)))
    .addSubcommand(command => command.setName('deverrouiller').setDescription('Autorise de nouveau les attributions')
      .addRoleOption(option => option.setName('role').setDescription('Rôle à déverrouiller').setRequired(true)))
    .addSubcommand(command => command.setName('limite').setDescription('Définit une limite de détenteurs, 0 pour retirer la limite')
      .addRoleOption(option => option.setName('role').setDescription('Rôle concerné').setRequired(true))
      .addIntegerOption(option => option.setName('maximum').setDescription('Maximum autorisé, 0 pour désactiver').setRequired(true).setMinValue(0).setMaxValue(100000)))
    .addSubcommand(command => command.setName('statut').setDescription('Affiche le statut d’un rôle')
      .addRoleOption(option => option.setName('role').setDescription('Rôle concerné').setRequired(true)))
    .addSubcommand(command => command.setName('liste').setDescription('Affiche les rôles verrouillés et limités'))
    .addSubcommand(command => command.setName('logs').setDescription('Configure les journaux')
      .addChannelOption(option => option.setName('salon').setDescription('Salon des logs, vide pour désactiver').addChannelTypes(ChannelType.GuildText)))
].map(command => command.toJSON());

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
  const config = store.guild(guild.id);
  const locked = config.lockedRoles
    .map(id => guild.roles.cache.get(id))
    .filter(Boolean)
    .sort((a, b) => b.position - a.position);
  const limits = Object.entries(config.roleLimits)
    .map(([id, maximum]) => [guild.roles.cache.get(id), maximum])
    .filter(([role]) => role)
    .sort(([a], [b]) => b.position - a.position);

  const lockedDetails = locked.length
    ? locked.slice(0, 20).map((role, index) => {
        const maximum = store.limit(guild.id, role.id);
        return [
          `**${index + 1}. ${role.name}** — ${role}`,
          `> Détenteurs actuels : **${role.members.size}**`,
          `> Limite : **${maximum === null ? 'aucune' : maximum + ' membre(s)'}**`
        ].join('\n');
      }).join('\n\n')
    : '> Aucun rôle n’est actuellement verrouillé.';

  const limitDetails = limits.length
    ? limits.slice(0, 20).map(([role, maximum]) =>
        `• ${role} — **${role.members.size}/${maximum}** détenteur(s)`
      ).join('\n')
    : '> Aucune limite de détenteurs configurée.';

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: client.user?.username || 'Tokina Role Lock', iconURL: client.user?.displayAvatarURL({ extension: 'png', size: 128 }) })
    .setTitle('Gestion des rôles protégés')
    .setDescription([
      '## Centre de verrouillage',
      '> Protège les rôles sensibles contre toute nouvelle attribution non autorisée.',
      '',
      '### Fonctionnement',
      '1. Sélectionne un rôle dans le premier menu pour le verrouiller.',
      '2. Toute nouvelle attribution sera retirée automatiquement.',
      '3. Utilise le second menu pour choisir uniquement parmi les rôles déjà verrouillés.',
      '',
      `### Rôles verrouillés — ${locked.length}`,
      lockedDetails,
      '',
      `### Limites configurées — ${limits.length}`,
      limitDetails,
      '',
      '-# Les membres qui possédaient déjà un rôle le conservent. Les changements sont appliqués immédiatement.'
    ].join('\n').slice(0, 4096))
    .setThumbnail(guild.iconURL({ extension: 'png', size: 256 }))
    .setFooter({ text: `${locked.length} rôle(s) verrouillé(s) • ${limits.length} limite(s) active(s)` })
    .setTimestamp();

  const lockMenu = new RoleSelectMenuBuilder()
    .setCustomId('rolelock:lock')
    .setPlaceholder('Choisir un rôle à verrouiller')
    .setMinValues(1)
    .setMaxValues(1);

  const unlockMenu = new StringSelectMenuBuilder()
    .setCustomId('rolelock:unlock')
    .setPlaceholder(locked.length ? 'Choisir un rôle verrouillé à libérer' : 'Aucun rôle verrouillé')
    .setMinValues(1)
    .setMaxValues(1);

  if (locked.length) {
    unlockMenu.addOptions(locked.slice(0, 25).map(role => ({
      label: role.name.slice(0, 100),
      value: role.id,
      description: `${role.members.size} détenteur(s) actuel(s)`.slice(0, 100),
      emoji: '🔓'
    })));
  } else {
    unlockMenu.addOptions({ label: 'Aucun rôle verrouillé', value: 'none', description: 'Verrouille d’abord un rôle.' }).setDisabled(true);
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(lockMenu),
      new ActionRowBuilder().addComponents(unlockMenu)
    ],
    allowedMentions: { parse: [] }
  };
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

async function setup(interaction) {
  let channel = interaction.options.getChannel('salon');
  if (!channel) channel = await interaction.guild.channels.create({
    name: '🔒・role-lock', type: ChannelType.GuildText,
    reason: `Configuration Role Lock par ${interaction.user.tag}`
  });
  const config = store.guild(interaction.guild.id);
  let panelMessage = config.panelMessageId ? await channel.messages.fetch(config.panelMessageId).catch(() => null) : null;
  panelMessage = panelMessage ? await panelMessage.edit(panelPayload(interaction.guild)) : await channel.send(panelPayload(interaction.guild));
  store.set(interaction.guild.id, { panelChannelId: channel.id, panelMessageId: panelMessage.id });
  return interaction.editReply(`Panneau configuré dans ${channel}.`);
}

client.once(Events.ClientReady, async ready => {
  await new REST({ version: '10' }).setToken(token).put(Routes.applicationCommands(ready.user.id), { body: commands });
  for (const guild of ready.guilds.cache.values()) await refreshPanel(guild).catch(() => {});
  console.log(`Role Lock connecté : ${ready.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.inGuild()) return;
  if (interaction.isChatInputCommand() && interaction.commandName === 'rolelock') {
    if (!allowed(interaction.member)) return interaction.reply({ content: 'Tu n’as pas accès à cette commande.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const action = interaction.options.getSubcommand();
      if (action === 'setup') return setup(interaction);
      const role = interaction.options.getRole('role');
      if (action === 'verrouiller') return interaction.editReply(await lockRole(interaction.guild, role, interaction.user));
      if (action === 'deverrouiller') return interaction.editReply(await unlockRole(interaction.guild, role, interaction.user));
      if (action === 'statut') {
        const limit = store.limit(interaction.guildId, role.id);
        return interaction.editReply(`${role} est **${store.isLocked(interaction.guildId, role.id) ? 'verrouillé' : 'déverrouillé'}**. Limite : **${limit ?? 'aucune'}**.`);
      }
      if (action === 'limite') {
        const problem = roleProblem(interaction.guild, role);
        if (problem) return interaction.editReply(problem);
        const maximum = interaction.options.getInteger('maximum', true);
        store.setLimit(interaction.guildId, role.id, maximum === 0 ? null : maximum);
        await refreshPanel(interaction.guild).catch(() => {});
        await writeLog(interaction.guild, maximum === 0 ? `${interaction.user} a retiré la limite de ${role}.` : `${interaction.user} a limité ${role} à ${maximum} personne(s).`);
        return interaction.editReply(maximum === 0 ? `La limite de ${role} est supprimée.` : `${role} est maintenant limité à **${maximum} personne(s)**.`);
      }
      if (action === 'liste') return interaction.editReply(panelPayload(interaction.guild));
      if (action === 'logs') {
        const channel = interaction.options.getChannel('salon');
        store.set(interaction.guildId, { logChannelId: channel?.id || null });
        return interaction.editReply(channel ? `Les logs seront envoyés dans ${channel}.` : 'Logs désactivés.');
      }
    } catch (error) {
      console.error(error);
      return interaction.editReply('Une erreur est survenue. Vérifie les permissions et la hiérarchie du bot.');
    }
  }
  const isRoleLockMenu = interaction.isRoleSelectMenu() && interaction.customId === 'rolelock:lock';
  const isRoleUnlockMenu = interaction.isStringSelectMenu() && interaction.customId === 'rolelock:unlock';
  if (!isRoleLockMenu && !isRoleUnlockMenu) return;
  if (!allowed(interaction.member)) return interaction.reply({ content: 'Tu n’as pas accès à ce panneau.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const roleId = interaction.values[0];
  if (roleId === 'none') return interaction.editReply('Aucun rôle n’est actuellement verrouillé.');
  const role = interaction.guild.roles.cache.get(roleId);
  const text = isRoleLockMenu
    ? await lockRole(interaction.guild, role, interaction.user)
    : await unlockRole(interaction.guild, role, interaction.user);
  return interaction.editReply(text);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  const blocked = added.filter(role => {
    if (store.isLocked(newMember.guild.id, role.id)) return true;
    const maximum = store.limit(newMember.guild.id, role.id);
    return maximum !== null && role.members.size > maximum;
  });
  for (const role of blocked.values()) {
    if (role.position >= newMember.guild.members.me.roles.highest.position) {
      await writeLog(newMember.guild, `Impossible de retirer ${role} à ${newMember} : rôle trop haut.`);
      continue;
    }
    const maximum = store.limit(newMember.guild.id, role.id);
    const reason = store.isLocked(newMember.guild.id, role.id)
      ? 'rôle verrouillé'
      : `limite de ${maximum} atteinte`;
    await newMember.roles.remove(role, `Role Lock : ${reason}`).catch(() => {});
    const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 6 }).catch(() => null);
    const entry = audit?.entries.find(item => item.target?.id === newMember.id && Date.now() - item.createdTimestamp < 10000);
    await writeLog(newMember.guild, `${role} a été retiré de ${newMember} : ${reason}.${entry?.executor ? ` Attribution tentée par ${entry.executor}.` : ''}`);
  }
});

client.on(Events.GuildRoleDelete, role => {
  if (store.isLocked(role.guild.id, role.id)) store.unlock(role.guild.id, role.id);
  if (store.limit(role.guild.id, role.id) !== null) store.setLimit(role.guild.id, role.id, null);
});

client.login(token);

