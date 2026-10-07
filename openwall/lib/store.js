// Stockage JSON simple sur disque, avec écriture différée et atomique.
const fs = require('fs');
const path = require('path');

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Fusion profonde : les tableaux sont remplacés, les objets fusionnés.
function deepMerge(target, patch) {
  const out = isObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = deepMerge(defaults, this._read());
    this._timer = null;
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  get() {
    return this.data;
  }

  set(data) {
    this.data = data;
    this.save();
  }

  merge(patch) {
    this.data = deepMerge(this.data, patch);
    this.save();
    return this.data;
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('Échec de sauvegarde', this.file, e);
    }
  }
}

module.exports = { JsonStore, deepMerge };
