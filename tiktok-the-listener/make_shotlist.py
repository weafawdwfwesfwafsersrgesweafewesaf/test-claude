"""Génère shotlist.md à partir de script.txt + des infos de plans ci-dessous."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = [l.strip() for l in open(os.path.join(HERE, "script.txt"), encoding="utf-8") if l.strip()]

# (décor, cadrage, mouvement, persos, expression)
INFO = [
    ("Piscine jour", "Plan large au ras de l'eau", "Push-in lent", "Leo (maillot)", "neutre → sueur, orteil au-dessus de l'eau"),
    ("Rue grise", "Gros plan sur l'avaloir d'égout", "Push-in plongée", "Main pâle du Listener", "—"),
    ("Piscine nuit", "Plongée sur le grand bain", "Descente lente", "Listener allongé au fond", "—"),
    ("Piscine nuit", "Contre-plongée sur la tête-oreille", "Push-in", "Listener", "oreille qui palpite, gouttes"),
    ("Piscine jour", "Ras de l'eau", "Push-in", "—", "goutte → ondes rapides"),
    ("Salle de bain", "Plan moyen", "Push-in", "Leo dans la baignoire", "pince-sans-rire, éponge"),
    ("Rue grise", "Travelling latéral sur le trottoir", "Dolly latéral", "—", "flaques + cônes"),
    ("Piscine jour", "Plongée large", "Push-in", "4 enfants qui flottent, coach", "coach « chut », sueur"),
    ("Piscine nuit", "Ras de l'eau", "Glissé avant", "—", "eau miroir"),
    ("Piscine nuit", "Ras de l'eau", "Push-in", "—", "sillage de rides vers la caméra"),
    ("Piscine jour", "Plan moyen face", "Push-in", "Leo (maillot)", "sourire + coucou → sueur"),
    ("Piscine jour", "Gros plan visage", "Push-in", "Leo", "hoquet ×3 (sursauts)"),
    ("Lac", "Plan moyen", "Push-in", "Grand-père", "rire"),
    ("Lac", "Plan large de dos", "Push-in", "Grand-père + Leo", "lancer + ricochets"),
    ("Lac", "Ras de l'eau", "Travelling avant", "—", "7 ricochets"),
    ("Lac", "Plan rapproché poche", "Push-in", "Leo (sweat)", "petit sourire, galets"),
    ("Vestiaires", "Plan moyen", "Push-in", "Leo endormi sur le banc", "dodo + Zzz"),
    ("Vestiaires", "Plan large plongée", "Push-in", "Leo endormi", "les lumières s'éteignent une à une"),
    ("Vestiaires nuit", "Plan rapproché", "Push-in", "Leo assis", "dodo → peur, tourne la tête"),
    ("Piscine nuit", "Gros plan cadenas → plan large vers EXIT", "Panoramique + recul", "—", "—"),
    ("Piscine nuit", "Latéral au ras de l'eau", "Travelling d'accompagnement", "Leo", "peur, marche sur la pointe des pieds"),
    ("Piscine nuit", "Plan rapproché bas", "Push-in", "Leo", "hoquet, glissade, éclaboussure"),
    ("Piscine nuit", "Plan large plongée", "Push-in", "Leo (petit)", "sueur, figé"),
    ("Piscine nuit", "Contre-plongée (vue de Leo)", "Tilt up", "Listener qui émerge", "rides, gouttes"),
    ("Piscine nuit", "Contre-plongée au ras de l'eau", "Push-in", "Listener", "dégouline"),
    ("Piscine nuit", "Gros plan oreille", "Push-in", "Listener", "oreille qui palpite"),
    ("Piscine nuit", "Par-dessus l'épaule de Leo", "Push-in", "Listener + Leo", "tête qui tourne lentement"),
    ("Piscine nuit", "Gros plan visage", "Push-in", "Leo", "hoquet → retient son souffle (joues)"),
    ("Piscine nuit", "Plan rapproché", "Push-in", "Leo", "déterminé, sort les galets"),
    ("Piscine nuit", "De dos, 3/4", "Push-in", "Leo", "lancer avec overshoot"),
    ("Piscine nuit", "Ras de l'eau", "Travelling qui suit le galet", "—", "7 rebonds"),
    ("Piscine nuit", "Plongée large", "Push-in", "—", "7 ondes en ligne"),
    ("Piscine nuit", "Plan large latéral", "Panoramique", "Listener", "fonce vers le petit bain"),
    ("Piscine nuit", "De dos", "Push-in", "Leo", "pointe des pieds, ouvre la porte EXIT"),
    ("Façade nuit", "Plan moyen face", "Push-in", "Leo (sweat)", "sourire → joie, bras levé"),
]


def words(l):
    return len(l.replace("-", " ").split())


rows = ["# Shot list — « The Listener »", "",
        "Durée phrase = 0,4 s/mot (estimation). Chaque fichier contient 0,5 s de marge avant et après.", "",
        "| N° | Phrase | Durée phrase | Durée fichier | Décor | Cadrage | Mouvement | Persos | Expression / action | Fichier |",
        "|---|---|---|---|---|---|---|---|---|---|"]
tot = 0
for i, (l, inf) in enumerate(zip(LINES, INFO), 1):
    core = max(30, round(0.4 * words(l) * 30))
    d = core / 30
    tot += d
    rows.append(f"| {i:02d} | {l} | {d:.1f} s | {d + 1:.1f} s | {inf[0]} | {inf[1]} | {inf[2]} | {inf[3]} | {inf[4]} | `blend/plan_{i:02d}.blend` → `renders/plan_{i:02d}.mp4` |")
rows += ["", f"Total phrases ≈ {tot:.0f} s ({tot / 60:.1f} min) — {len(LINES)} plans."]
open(os.path.join(HERE, "shotlist.md"), "w", encoding="utf-8").write("\n".join(rows) + "\n")
print("ok", tot)
