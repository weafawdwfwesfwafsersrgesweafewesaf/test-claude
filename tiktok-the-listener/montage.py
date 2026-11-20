"""Montage final « The Listener » : voix ElevenLabs + 35 plans + sous-titres mot par mot + onomatopées.

  python montage.py [--audio voix.mp3] [--music musique.mp3] [--wait]

- Cale chaque plan sur la vraie voix : détection des pauses + alignement des 35 phrases (programmation dynamique).
- Sous-titres : UN mot à la fois, centré à ~60 % de la hauteur, blanc, police grasse arrondie (Poppins Black),
  contour noir ; onomatopées jaunes (HIC!, SPLASH!).
- Audio normalisé à -14 LUFS. Sortie : final/the_listener_final.mp4 (1080x1920, 30 fps, H.264 + AAC).
Nécessite ffmpeg (avec libass) et numpy.
"""
import argparse, glob, json, os, shutil, subprocess, sys, time, urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Black.ttf"

# onomatopées : (plan, fraction de la phrase, texte)
ONOS = [(12, 0.08, "HIC!"), (12, 0.45, "HIC!"), (12, 0.8, "HIC!"),
        (22, 0.22, "HIC!"), (22, 0.62, "SPLASH!"), (28, 0.2, "hic..."),
        (31, 0.05, "PLOP!"), (33, 0.2, "WHOOSH!")]


def ffmpeg_bin():
    f = shutil.which("ffmpeg")
    if not f:
        sys.exit("ffmpeg introuvable")
    return f


FF = None


def run(args):
    r = subprocess.run([FF, "-y", "-v", "error"] + args, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-2000:])
        raise SystemExit("ffmpeg a échoué")


def load_lines():
    return [l.strip() for l in open(os.path.join(HERE, "script.txt"), encoding="utf-8") if l.strip()]


# ------------------------------------------------------------------ audio
def decode(path, sr=16000):
    r = subprocess.run([FF, "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32) / 32768.0, sr


def silences(x, sr, hop=0.01, min_len=0.09):
    n = int(hop * sr)
    frames = len(x) // n
    rms = np.sqrt(np.mean(x[:frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    peak = np.percentile(db, 98)
    thr = max(peak - 32, np.percentile(db, 10) + 6)
    sil = db < thr
    out, i = [], 0
    while i < frames:
        if sil[i]:
            j = i
            while j < frames and sil[j]:
                j += 1
            if (j - i) * hop >= min_len:
                out.append((i * hop, j * hop))
            i = j
        else:
            i += 1
    speech = np.where(~sil)[0]
    return out, speech[0] * hop, (speech[-1] + 1) * hop, frames * hop


def weight(text):
    return sum(c.isalnum() for c in text) + 2.0 * text.count(" ") + 3.0


def align_sentences(lines, gaps, t0, t1):
    """Choisit len(lines)-1 pauses parmi les candidates pour couper en phrases (DP)."""
    G = [g for g in gaps if g[0] > t0 + 0.2 and g[1] < t1 - 0.2]
    n, K = len(lines), len(lines) - 1
    w = np.array([weight(l) for l in lines], float)
    cum = np.concatenate([[0], np.cumsum(w)]) / w.sum()
    span = t1 - t0
    m = len(G)
    if m < K:
        raise SystemExit(f"Pas assez de pauses détectées ({m} < {K})")
    mid = [((a + b) / 2 - t0) / span for a, b in G]
    glen = [b - a for a, b in G]
    INF = 1e18
    # dp[k][j] = coût min en utilisant la pause j comme k-ième coupure (k de 1 à K)
    dp = np.full((K + 1, m), INF)
    bk = np.zeros((K + 1, m), int)
    for j in range(m):
        dp[1][j] = (mid[j] - cum[1]) ** 2 * 400 - glen[j] * 2
    for k in range(2, K + 1):
        for j in range(k - 1, m):
            best, bi = INF, -1
            for i in range(k - 2, j):
                c = dp[k - 1][i]
                if c < best:
                    best, bi = c, i
            dp[k][j] = best + (mid[j] - cum[k]) ** 2 * 400 - glen[j] * 2
            bk[k][j] = bi
    j = int(np.argmin(dp[K]))
    chosen = []
    for k in range(K, 0, -1):
        chosen.append(G[j])
        j = bk[k][j]
    chosen = chosen[::-1]
    starts = [t0] + [b for a, b in chosen]
    ends = [a for a, b in chosen] + [t1]
    return list(zip(starts, ends))


def word_times(line, s, e, gaps):
    """Temps de chaque mot dans [s, e], en utilisant les pauses internes sur la ponctuation."""
    words = line.split()
    inner = sorted([g for g in gaps if g[0] > s + 0.05 and g[1] < e - 0.05 and g[1] - g[0] >= 0.1],
                   key=lambda g: g[0])
    punct = [i for i, wd in enumerate(words[:-1]) if wd[-1] in ",.?!;:"]
    ww = np.array([weight(wd) for wd in words])
    cw = np.concatenate([[0], np.cumsum(ww)]) / ww.sum()
    assign = {}
    for g in inner:
        tg = ((g[0] + g[1]) / 2 - s) / max(e - s, 1e-3)
        cands = [p for p in punct if p not in assign and all(p > q for q in assign)]
        if not cands:
            break
        p = min(cands, key=lambda p: abs(cw[p + 1] - tg))
        if abs(cw[p + 1] - tg) < 0.35:
            assign[p] = g
    # découpe en sous-phrases
    bounds, cur = [], (0, s)
    for p in sorted(assign):
        g = assign[p]
        bounds.append((cur[0], p + 1, cur[1], g[0]))
        cur = (p + 1, g[1])
    bounds.append((cur[0], len(words), cur[1], e))
    out = []
    for a, b, ts, te in bounds:
        sw = ww[a:b]
        c = np.concatenate([[0], np.cumsum(sw)]) / sw.sum()
        for k in range(b - a):
            out.append((words[a + k], ts + c[k] * (te - ts), ts + c[k + 1] * (te - ts)))
    return out


# ------------------------------------------------------------------ sous-titres ASS
def ts(t):
    t = max(0, t)
    h, m = int(t // 3600), int(t % 3600 // 60)
    return f"{h}:{m:02d}:{t % 60:05.2f}"


def clean(wd):
    return wd.strip(",.;:").replace("—", "")


def write_ass(path, words, onos):
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,Poppins Black,124,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,9,4,5,40,40,0,1
Style: Ono,Poppins Black,150,&H0000DCFF,&H0000DCFF,&H00000000,&H64000000,-1,0,0,0,100,100,2,0,1,11,6,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    for i, (wd, a, b) in enumerate(words):
        nxt = words[i + 1][1] if i + 1 < len(words) else b + 0.3
        end = min(max(b, a + 0.12), nxt) if nxt - b < 0.6 else b + 0.15
        pop = r"{\pos(540,1150)\fscx78\fscy78\t(0,70,\fscx112\fscy112)\t(70,140,\fscx100\fscy100)}"
        ev.append(f"Dialogue: 0,{ts(a)},{ts(end)},Word,,0,0,0,,{pop}{clean(wd)}")
    for t, txt in onos:
        pop = r"{\pos(540,620)\frz-7\fscx40\fscy40\t(0,90,\fscx125\fscy125)\t(90,180,\fscx100\fscy100)\t(600,750,\alpha&HFF&)}"
        ev.append(f"Dialogue: 1,{ts(t)},{ts(t + 0.75)},Ono,,0,0,0,,{pop}{txt}")
    open(path, "w", encoding="utf-8").write(head + "\n".join(ev) + "\n")


# ------------------------------------------------------------------ vidéo
def probe_frames(path):
    r = subprocess.run([FF.replace("ffmpeg", "ffprobe") if os.path.exists(FF.replace("ffmpeg", "ffprobe")) else "ffprobe",
                        "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return int(r.stdout.strip().split(",")[0])
    except Exception:
        return None


def main():
    global FF
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", default=None)
    ap.add_argument("--music", default=None, help="musique de fond optionnelle (mixée à -22 dB)")
    ap.add_argument("--wait", action="store_true", help="attend que les 35 plans soient rendus")
    ap.add_argument("--renders", default=os.path.join(HERE, "renders"))
    ap.add_argument("--out", default=os.path.join(HERE, "final"))
    args = ap.parse_args()
    FF = ffmpeg_bin()
    lines = load_lines()
    n = len(lines)
    vids = [os.path.join(args.renders, f"plan_{i:02d}.mp4") for i in range(1, n + 1)]
    while args.wait and not all(os.path.exists(v) for v in vids):
        print(time.strftime("%H:%M:%S"), "attente des rendus :", sum(os.path.exists(v) for v in vids), "/", n, flush=True)
        time.sleep(60)
    audio = args.audio or sorted(glob.glob(os.path.expanduser("~/Downloads/ElevenLabs*.mp3")), key=os.path.getmtime)[0]
    print("voix :", audio)
    os.makedirs(args.out, exist_ok=True)
    tmp = os.path.join(args.out, "tmp")
    os.makedirs(tmp, exist_ok=True)

    x, sr = decode(audio)
    gaps, t0, t1, dur = silences(x, sr)
    sents = align_sentences(lines, gaps, t0, t1)
    words, timing = [], []
    for i, (l, (s, e)) in enumerate(zip(lines, sents)):
        wt = word_times(l, s, e, gaps)
        words += wt
        timing.append({"plan": i + 1, "start": round(s, 3), "end": round(e, 3), "text": l})
    json.dump(timing, open(os.path.join(args.out, "timing.json"), "w"), indent=1)
    for tm in timing:
        print(f"{tm['plan']:02d} {tm['start']:7.2f} {tm['end']:7.2f}  {tm['text']}")

    # coupes : juste avant chaque phrase
    lead = 0.12
    cuts = [0.0] + [max(sents[i][0] - lead, (sents[i - 1][1] + sents[i][0]) / 2) for i in range(1, n)]
    total = max(dur, sents[-1][1] + 0.6)
    cuts.append(total)
    segs = []
    for i in range(n):
        c0, c1 = cuts[i], cuts[i + 1]
        d = c1 - c0
        s, e = sents[i]
        in_off = max(0.0, 0.5 - (s - c0))          # dans le fichier, la phrase commence à 0,5 s
        nf = probe_frames(vids[i]) or 0
        flen = nf / FPS if nf else d + in_off
        need = in_off + d
        f = 1.0
        if need > flen:                               # phrase plus longue que le plan : on ralentit un peu
            f = min(1.25, need / flen)
        vf = f"setpts={f:.4f}*(PTS-STARTPTS),fps={FPS},scale=1080:1920:flags=lanczos,tpad=stop_mode=clone:stop_duration=3"
        out = os.path.join(tmp, f"seg_{i + 1:02d}.mp4")
        run(["-ss", f"{in_off:.3f}", "-i", vids[i], "-vf", vf, "-t", f"{d:.3f}",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", out])
        segs.append(out)
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join(f"file '{os.path.basename(p)}'\n" for p in segs))
    vid = os.path.join(tmp, "video.mp4")
    run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", vid])

    onos = []
    for p, frac, txt in ONOS:
        s, e = sents[p - 1]
        onos.append((s + frac * (e - s), txt))
    fonts = os.path.join(HERE, "fonts")
    os.makedirs(fonts, exist_ok=True)
    fp = os.path.join(fonts, "Poppins-Black.ttf")
    if not os.path.exists(fp):
        try:
            urllib.request.urlretrieve(FONT_URL, fp)
        except Exception as ex:
            print("police non téléchargée :", ex)
    ass = os.path.join(tmp, "subs.ass")
    write_ass(ass, words, onos)

    final = os.path.join(args.out, "the_listener_final.mp4")
    # chemins relatifs (le filtre subtitles n'aime pas « C: » sous Windows)
    afilter = "[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]"
    inputs = ["-i", "tmp/video.mp4", "-i", os.path.abspath(audio)]
    if args.music:
        inputs += ["-stream_loop", "-1", "-i", os.path.abspath(args.music)]
        afilter = (f"[2:a]volume=-22dB,afade=t=out:st={total - 2:.2f}:d=2[m];[1:a][m]amix=inputs=2:duration=first:"
                   f"dropout_transition=0:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    cwd = os.getcwd()
    os.chdir(args.out)
    try:
        run(inputs + ["-filter_complex", f"[0:v]subtitles=tmp/subs.ass:fontsdir=../fonts[v];{afilter}",
                      "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "the_listener_final.mp4"])
    finally:
        os.chdir(cwd)
    print("OK ->", final)


if __name__ == "__main__":
    main()
