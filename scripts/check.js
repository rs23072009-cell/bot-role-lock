const fs = require('node:fs');
const required = ['index.js', 'src/store.js', 'deploy/bot-role-lock.service', '.env.example'];
const missing = required.filter(file => !fs.existsSync(file));
if (missing.length) {
  console.error(`Fichiers manquants : ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Structure du bot Role Lock valide.');

