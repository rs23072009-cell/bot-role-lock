const fs = require('node:fs');
const required = ['index.js', 'src/store.js', 'deploy/bot-role-lock.service', '.env.example'];
const missing = required.filter(file => !fs.existsSync(file));
if (missing.length) {
  console.error(`Fichiers manquants : ${missing.join(', ')}`);
  process.exit(1);
}
const source = fs.readFileSync('index.js', 'utf8');
if (!source.includes('return Boolean(member && owners.has(member.id));')) {
  throw new Error('La gestion de Role Lock doit être réservée aux OWNER_IDS.');
}
for (const forbidden of ['member.guild.ownerId', 'PermissionFlagsBits.Administrator', 'PermissionFlagsBits.ManageRoles']) {
  if (source.includes(forbidden)) throw new Error(`Accès automatique interdit encore présent : ${forbidden}`);
}
console.log('Structure et accès Owner du bot Role Lock valides.');

