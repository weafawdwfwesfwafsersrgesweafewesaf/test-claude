// Test : réécrire sans rien changer doit redonner exactement le même fichier.
const fs = require('fs'); const { Place } = require('./writer.js');
const f = process.argv[2]; const p = new Place(f); p.save('/tmp/claude-0/rbx/rt.rbxl');
console.log('identique :', fs.readFileSync(f).equals(fs.readFileSync('/tmp/claude-0/rbx/rt.rbxl')));
