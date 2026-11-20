#!/usr/bin/env python3
"""Rend tous les plans sur TON PC (RTX 5050), à partir des fichiers blend/plan_XX.blend.

Usage (Windows, macOS ou Linux, Python 3.8+ ; aucun module à installer) :
    python render_all.py                     # tous les plans, EEVEE 1080x1920, 64 échantillons
    python render_all.py --plans 1,5-8       # seulement certains plans
    python render_all.py --samples 128       # plus propre (plus lent)
    python render_all.py --half              # test rapide en 540x960
    python render_all.py --cycles            # variante Cycles sur GPU (OptiX)
    python render_all.py --blender "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe"

Sortie : renders/plan_XX.mp4 (H.264, 1080x1920, 30 fps, sans audio).
- Si ffmpeg est installé : images PNG dans frames/plan_XX/ puis encodage MP4 (reprise possible si
  tu coupes : les images déjà faites ne sont pas refaites).
- Sinon : Blender écrit directement le MP4.
Un plan déjà rendu (renders/plan_XX.mp4 présent) est sauté, sauf avec --force.
Il faut Blender 5.3 ou plus récent.
"""
import sys as _s
try:
    _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
import argparse, glob, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))


def find_blender(user_path):
    cands = [user_path, os.environ.get("BLENDER"), shutil.which("blender")]
    cands += sorted(glob.glob(r"C:\Program Files\Blender Foundation\Blender*\blender.exe"), reverse=True)
    cands += ["/Applications/Blender.app/Contents/MacOS/Blender"]
    cands += sorted(glob.glob(os.path.expanduser("~/blender*/blender")), reverse=True)
    for c in cands:
        if c and os.path.isfile(c):
            return c
    sys.exit("Blender introuvable. Passe son chemin avec --blender \"...\\blender.exe\".")


def parse_plans(s, available):
    if not s:
        return available
    out = []
    for part in s.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += list(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return [p for p in out if p in available]


def settings_expr(args, direct_video, out_path):
    lines = [
        "import bpy",
        "sc = bpy.context.scene",
        "sc.render.use_overwrite = False",
        "sc.render.use_placeholder = False",
    ]
    if args.half:
        lines.append("sc.render.resolution_percentage = 50")
    if args.cycles:
        lines += [
            "sc.render.engine = 'CYCLES'",
            "p = bpy.context.preferences.addons['cycles'].preferences",
            "for dt in ('OPTIX', 'CUDA'):",
            "    try:",
            "        p.compute_device_type = dt; p.get_devices()",
            "        [setattr(d, 'use', True) for d in p.devices]",
            "        break",
            "    except Exception: pass",
            "sc.cycles.device = 'GPU'",
            f"sc.cycles.samples = {args.samples * 2}",
            "sc.cycles.use_denoising = True",
        ]
    else:
        lines.append(f"sc.eevee.taa_render_samples = {args.samples}")
    if direct_video:
        lines += [
            "im = sc.render.image_settings",
            "im.media_type = 'VIDEO'",
            "sc.render.ffmpeg.format = 'MPEG4'",
            "sc.render.ffmpeg.codec = 'H264'",
            "sc.render.ffmpeg.constant_rate_factor = 'HIGH'",
            "sc.render.ffmpeg.audio_codec = 'NONE'",
            f"sc.render.filepath = r'{out_path}'",
        ]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blender", default=None)
    ap.add_argument("--plans", default="")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--half", action="store_true")
    ap.add_argument("--cycles", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    blender = find_blender(args.blender)
    ver = subprocess.run([blender, "--version"], capture_output=True, text=True).stdout.splitlines()
    print("Blender :", blender, "|", ver[0] if ver else "?")
    ffmpeg = shutil.which("ffmpeg")
    print("ffmpeg  :", ffmpeg or "absent, MP4 ecrit directement par Blender")

    blends = {int(re.findall(r"(\d+)", os.path.basename(b))[0]): b
              for b in glob.glob(os.path.join(HERE, "blend", "plan_*.blend"))}
    plans = parse_plans(args.plans, sorted(blends))
    os.makedirs(os.path.join(HERE, "renders"), exist_ok=True)
    t_all = time.time()
    for n, p in enumerate(plans, 1):
        tag = f"plan_{p:02d}"
        out = os.path.join(HERE, "renders", tag + ".mp4")
        if os.path.exists(out) and not args.force:
            print(f"[{n}/{len(plans)}] {tag} déjà rendu, sauté")
            continue
        if args.force and os.path.exists(out):
            os.remove(out)
        t0 = time.time()
        print(f"[{n}/{len(plans)}] {tag} …", flush=True)
        if ffmpeg:
            fdir = os.path.join(HERE, "frames", tag)
            os.makedirs(fdir, exist_ok=True)
            expr = settings_expr(args, False, "")
            subprocess.run([blender, "-b", blends[p], "--python-expr", expr, "-a"], check=True,
                           stdout=subprocess.DEVNULL)
            subprocess.run([ffmpeg, "-y", "-v", "error", "-framerate", "30", "-i", os.path.join(fdir, "%04d.png"),
                            "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
                            "-pix_fmt", "yuv420p", "-an", out], check=True)
        else:
            tmp = os.path.join(HERE, "renders", tag + "_")
            expr = settings_expr(args, True, tmp)
            subprocess.run([blender, "-b", blends[p], "--python-expr", expr, "-a"], check=True,
                           stdout=subprocess.DEVNULL)
            made = sorted(glob.glob(tmp + "*.mp4"))
            if made:
                os.replace(made[-1], out)
        print(f"    -> {out} ({time.time() - t0:.0f} s)", flush=True)
    print(f"Terminé en {(time.time() - t_all) / 60:.1f} min.")


if __name__ == "__main__":
    main()
