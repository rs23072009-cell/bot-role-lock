const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(filename) {
    this.filename = path.resolve(filename);
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    this.data = { guilds: {} };
    try {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.filename, 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  guild(guildId) {
    this.data.guilds[guildId] ||= { lockedRoles: [], logChannelId: null, panelChannelId: null, panelMessageId: null };
    return this.data.guilds[guildId];
  }

  save() {
    const temporary = `${this.filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2));
    fs.renameSync(temporary, this.filename);
  }

  isLocked(guildId, roleId) { return this.guild(guildId).lockedRoles.includes(roleId); }
  lock(guildId, roleId) {
    const config = this.guild(guildId);
    if (!config.lockedRoles.includes(roleId)) config.lockedRoles.push(roleId);
    this.save();
  }
  unlock(guildId, roleId) {
    const config = this.guild(guildId);
    config.lockedRoles = config.lockedRoles.filter(id => id !== roleId);
    this.save();
  }
  set(guildId, values) { Object.assign(this.guild(guildId), values); this.save(); }
}

module.exports = Store;

