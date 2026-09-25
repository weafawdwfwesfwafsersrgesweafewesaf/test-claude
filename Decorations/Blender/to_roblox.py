# Convertit les 51 décorations en parts Roblox (blocs, cylindres, sphères) -> DecorShapes.lua
# Usage : blender -b --python to_roblox.py -- <sortie.lua>
import sys, os, math, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kit_rec
sys.modules['kit'] = kit_rec
from mathutils import Vector, Matrix

WORLDS = ['lava', 'ice', 'candy', 'robot', 'dragon', 'skeleton', 'retro', 'ghost']
CODES = {'B': 1, 'C': 2, 'S': 3, 'E': 4}

def conv(v):
    return Vector((v.x, v.z, -v.y))

def emit(parts, shape, col, M, size_local, axis_right, axis_up):
    """M : matrice Blender ; axis_right/up : axes LOCAUX Blender (Vector) du part Roblox."""
    pos = conv(M.to_translation())
    R = M.to_3x3()
    right = conv(R @ axis_right).normalized()
    up = conv(R @ axis_up).normalized()
    parts.append((shape, col, pos, right, up, size_local))

def scales(M):
    R = M.to_3x3()
    return [R.col[i].length for i in range(3)]

def convert(prims, colors):
    out = []
    for p in prims:
        ci = colors.index(p.c)
        M = p.M
        sx, sy, sz = scales(M)
        X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
        if p.kind == 'cube':
            dx, dy, dz = p.dims
            emit(out, 'B', ci, M, (dx * sx, dz * sz, dy * sy), X, Z)
        elif p.kind == 'ball':
            rx, ry, rz = p.dims
            rx, ry, rz = rx * sx, ry * sy, rz * sz
            if max(rx, ry, rz) - min(rx, ry, rz) < 0.02 * max(rx, ry, rz):
                r = (rx + ry + rz) / 3
                emit(out, 'S', ci, M, (2 * r, 2 * r, 2 * r), X, Z)
            else:
                emit(out, 'E', ci, M, (2 * rx, 2 * rz, 2 * ry), X, Z)
        elif p.kind == 'cyl':
            r, h, r2 = p.dims
            rs = (sx + sy) / 2
            h, r, r2 = h * sz, r * rs, r2 * rs
            if abs(r - r2) < 0.08 * max(r, r2, 1e-6):
                emit(out, 'C', ci, M, (h, 2 * r, 2 * r), Z, X)
            else:
                # cône / tronc de cône : marches de cylindres (style voxel du jeu)
                n = 2 if h < 1.0 else (3 if h < 3.0 else 4)
                Mn = M @ Matrix.Diagonal((1 / sx, 1 / sy, 1 / sz, 1))
                for k in range(n):
                    t = (k + 0.5) / n
                    rk = r + (r2 - r) * t
                    if rk < 0.03:
                        continue
                    Mk = Mn @ Matrix.Translation((0, 0, -h / 2 + t * h))
                    emit(out, 'C', ci, Mk, (h / n * 1.02, 2 * rk, 2 * rk), Z, X)
        elif p.kind == 'torus':
            R, r, s = p.dims
            n = 8 if R < 0.8 else 12
            L = 2 * math.pi * R / n * 1.15
            for k in range(n):
                a = (k + 0.5) / n * math.tau
                Mk = Matrix.Translation((math.cos(a) * R * s[0], math.sin(a) * R * s[1], 0)) @ Matrix.Rotation(a, 4, 'Z')
                emit(out, 'C', ci, M @ Mk, (L * (s[0] + s[1]) / 2, 2 * r * s[2], 2 * r), Y, Z)
    return out

def fmt(x, d=2):
    s = f'{x:.{d}f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    outp = args[0]
    lines = ['-- Généré par Decorations/Blender/to_roblox.py à partir des modèles Blender : ne pas éditer à la main.',
             '-- Par part : forme (1 bloc, 2 cylindre, 3 boule, 4 ellipsoïde), couleur, position (3), droite (3), haut (3), taille (3).',
             'return {']
    total = 0
    for w in WORLDS:
        kit_rec.PALETTE.clear(); kit_rec.GLOW.clear()
        mod = importlib.import_module('world_' + w)
        importlib.reload(mod)
        colors = list(kit_rec.PALETTE)
        lines.append(f'\t{mod.TITLE} = {{')
        pal = ', '.join(f'{{ "{kit_rec.PALETTE[c]}", {"true" if c in kit_rec.GLOW else "false"} }}' for c in colors)
        lines.append(f'\t\tColors = {{ {pal} }},')
        lines.append('\t\tProps = {')
        for name, fn in mod.PROPS:
            prims = kit_rec.finalize(fn(), name)
            parts = convert(prims, colors)
            total += len(parts)
            ys = [pp[2].y + pp[5][1] / 2 for pp in parts]
            flat = []
            for shape, ci, pos, right, up, size in parts:
                flat += [str(CODES[shape]), str(ci + 1), fmt(pos.x), fmt(pos.y), fmt(pos.z),
                         fmt(right.x, 3), fmt(right.y, 3), fmt(right.z, 3), fmt(up.x, 3), fmt(up.y, 3), fmt(up.z, 3),
                         fmt(size[0]), fmt(size[1]), fmt(size[2])]
            lines.append(f'\t\t\t{{ Name = "{name}", Height = {fmt(max(ys))}, Parts = {{ {", ".join(flat)} }} }},')
            print(f'PARTS {mod.TITLE}/{name}: {len(parts)}')
        lines.append('\t\t},')
        lines.append('\t},')
    lines.append('}')
    open(outp, 'w').write('\n'.join(lines) + '\n')
    print('TOTAL', total, 'chars', sum(len(l) for l in lines))

main()
