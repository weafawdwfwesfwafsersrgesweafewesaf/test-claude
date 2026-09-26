// Remplace le dossier DecorMondes/LevelN par une nouvelle version (tree.json produit par setpieces.py pour ce niveau).
const fs = require('fs');
const { Edit, name, makeAdder } = require('./editlib.js');
module.exports = function (E, treeFile) {
  const add = makeAdder(E);
  const tree = JSON.parse(fs.readFileSync(treeFile));
  const root = E.find('Workspace/DecorMondes');
  const log = [];
  for (const lvf of tree.k) {
    const old = root.children.find(c => name(c) === lvf.n);
    const n = old ? E.remove([old]) : 0;
    add(lvf, root.ref);
    log.push(`${lvf.n} : ancien décor retiré (${n} instances), nouveau posé`);
  }
  return log.join('\n');
};
if (require.main === module) {
  const E = new Edit(process.argv[2]);
  console.log(module.exports(E, process.argv[4]));
  E.save(process.argv[3]);
}
