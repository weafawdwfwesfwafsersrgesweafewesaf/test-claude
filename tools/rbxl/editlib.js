// Outils d'édition ciblée d'un .rbxl (repartir du DERNIER fichier, n'appliquer que les changements voulus).
const { Place, enc } = require('./writer.js');
const { name } = require('./rbxl.js');

function unfloat(b) { let u = b.readUInt32BE(0); u = ((u >>> 1) | (u << 31)) >>> 0; const o = Buffer.alloc(4); o.writeUInt32BE(u); return o.readFloatBE(0); }
function decAttrs(b) {
  const out = {}; if (!b || b.length < 4) return out;
  let p = 4; const n = b.readUInt32LE(0);
  for (let i = 0; i < n; i++) {
    const l = b.readUInt32LE(p); p += 4; const k = b.toString('utf8', p, p + l); p += l; const t = b[p++];
    if (t === 6) { out[k] = b.readDoubleLE(p); p += 8; }
    else if (t === 2) { const l2 = b.readUInt32LE(p); p += 4; out[k] = b.toString('utf8', p, p + l2); p += l2; }
    else if (t === 3) { out[k] = !!b[p]; p += 1; }
    else throw new Error('attribut de type ' + t + ' (' + k + ')');
  }
  return out;
}
class Edit {
  constructor(file) { this.P = new Place(file); }
  find(path) { return this.P.find(path); }
  children(inst) { return inst.children; }
  descendants(inst) { const out = []; (function w(o) { for (const c of o.children) { out.push(c); w(c); } })(inst); return out; }
  // position, taille, couleur d'une part
  part(inst) {
    const cf = this.P.getProp(inst, 'CFrame'), sz = this.P.getProp(inst, 'size'), col = this.P.getProp(inst, 'Color3uint8');
    return { inst, name: name(inst), pos: cf.pos.map(unfloat), rot: cf.rot, size: sz.map(unfloat), color: col ? [...col] : null };
  }
  attrs(inst) { return decAttrs(this.P.getProp(inst, 'AttributesSerialize')); }
  setAttrs(inst, o) { this.P.setProp(inst, 'AttributesSerialize', enc.attrs(o)); }
  setPos(inst, pos) { const cf = this.P.getProp(inst, 'CFrame'); this.P.setProp(inst, 'CFrame', { rot: cf.rot, pos: pos.map(enc.float) }); }
  setSize(inst, size) { this.P.setProp(inst, 'size', enc.vec3(size)); }
  setColor(inst, rgb) { this.P.setProp(inst, 'Color3uint8', enc.rgb8(rgb)); }
  set(inst, pname, value) { this.P.setProp(inst, pname, value); }
  addLike(template, parentRef, values) { return this.P.addNew(template, parentRef, values); }
  remove(insts) { const refs = new Set(); for (const o of insts) { refs.add(o.ref); for (const d of this.descendants(o)) refs.add(d.ref); } this.P.remove([...refs]); return refs.size; }
  setSource(inst, text, expectOld) { this.P.setString(inst, 'Source', text, expectOld); }
  save(file) { this.P.save(file); }
}
module.exports = { Edit, enc, name, unfloat, decAttrs };

// Ajout d'un arbre d'instances (même format que les décors : Folder / Model / Part / PointLight) sous parentRef.
function makeAdder(E) {
  const P = E.P, g = P.g;
  const noAttr = o => !o.props.AttributesSerialize || o.props.AttributesSerialize.v.length === 0;
  const tpl = (cls, pred) => { const t = Object.values(g.inst).find(o => o.cls === cls && pred(o)); if (!t) throw new Error('modèle ' + cls); return t; };
  const T = {
    Folder: tpl('Folder', noAttr),
    Model: tpl('Model', o => noAttr(o) && o.props.ScaleFactor !== undefined && o.children.length > 0 && o.children.every(c => c.cls === 'Part')),
    Part: tpl('Part', o => noAttr(o) && o.props.Material && o.props.Material.v === 272 && o.props.shape && o.props.shape.v === 1 && o.props.CanCollide && o.props.CanCollide.v === false),
    SpecialMesh: tpl('SpecialMesh', () => true),
    PointLight: tpl('PointLight', noAttr),
  };
  const IDENT = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  function add(node, parentRef) {
    let ref;
    if (node.c === 'Folder') ref = P.addNew(T.Folder, parentRef, { Name: enc.str(node.n), AttributesSerialize: enc.str('') });
    else if (node.c === 'Model') ref = P.addNew(T.Model, parentRef, { Name: enc.str(node.n), AttributesSerialize: enc.str(''), WorldPivotData: enc.optcf(node.pivot), PrimaryPart: -1, ScaleFactor: enc.float(1), NeedsPivotMigration: enc.bool(false) });
    else if (node.c === 'PointLight') ref = P.addNew(T.PointLight, parentRef, { Name: enc.str(node.n), AttributesSerialize: enc.str(''), Brightness: enc.float(node.brightness), Range: enc.float(node.range), Color: enc.vec3(node.rgb.map(c => c / 255)), Shadows: enc.bool(false), Enabled: enc.bool(true) });
    else {
      const v = {
        Name: enc.str(node.n), CFrame: enc.cframe(node.cf), size: enc.vec3(node.size), Color3uint8: enc.rgb8(node.rgb), Material: enc.enumv(node.mat),
        shape: enc.enumv(node.shape), Anchored: enc.bool(true), CanCollide: enc.bool(!!node.collide), CanQuery: enc.bool(!!node.collide), CanTouch: enc.bool(false),
        CastShadow: enc.bool(!!node.shadow), Transparency: enc.float(node.transp || 0), Reflectance: enc.float(0), Locked: enc.bool(false), Massless: enc.bool(false),
        TopSurface: enc.enumv(0), BottomSurface: enc.enumv(0), LeftSurface: enc.enumv(0), RightSurface: enc.enumv(0), FrontSurface: enc.enumv(0), BackSurface: enc.enumv(0),
        MaterialVariantSerialized: enc.str(''), PivotOffset: enc.cframe(IDENT), Velocity: enc.vec3([0, 0, 0]), RotVelocity: enc.vec3([0, 0, 0]),
        AttributesSerialize: node.attrs ? enc.attrs(node.attrs) : enc.str(''), CustomPhysicalProperties: Buffer.from([2]),
      };
      if (node.studs) { v.Material = enc.enumv(256); v.MaterialVariantSerialized = enc.str('Studs_2'); }
      ref = P.addNew(T.Part, parentRef, v);
      if (node.sphere) P.addNew(T.SpecialMesh, ref, { Name: enc.str('Mesh'), AttributesSerialize: enc.str(''), MeshId: enc.str(''), TextureId: enc.str(''), MeshType: enc.enumv(3), Scale: enc.vec3([1, 1, 1]), Offset: enc.vec3([0, 0, 0]), VertexColor: enc.vec3([1, 1, 1]) });
    }
    for (const k of node.k || []) add(k, ref);
    return ref;
  }
  return add;
}
module.exports.makeAdder = makeAdder;
