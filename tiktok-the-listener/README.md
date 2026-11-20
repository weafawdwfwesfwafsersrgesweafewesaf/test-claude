# « The Listener » — partie 3D Blender (TikTok « In this world »)

> *In this town, you're never allowed to make a splash.*

Vidéo verticale 9:16, 1080x1920, 30 fps, style Roblox R6. 35 plans, un par phrase de `script.txt`.
Voix off, sous-titres et montage : à faire de ton côté.

## Rendre la vidéo sur ton PC (RTX 5050)
1. Installe **Blender 5.3 ou plus récent** (les .blend viennent de Blender 5.3) et, si possible, **ffmpeg**.
2. Dans ce dossier :
   ```bash
   python render_all.py                 # tous les plans, EEVEE 1080x1920, 64 échantillons
   python render_all.py --half          # test rapide en 540x960
   python render_all.py --plans 3,10-12 # quelques plans
   python render_all.py --samples 128   # plus propre
   python render_all.py --cycles        # variante Cycles GPU (OptiX), plus lente mais plus réaliste
   ```
   Si Blender n'est pas trouvé : `--blender "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe"`.
3. Résultat : `renders/plan_XX.mp4` (H.264, sans audio). Chaque fichier a **0,5 s de marge avant et après** la phrase, pour recaler sur la vraie voix.

Tu peux aussi ouvrir un `blend/plan_XX.blend` et faire Render > Render Animation (sortie PNG dans `frames/plan_XX/`).

## Montage final automatique
```bash
python montage.py --audio "chemin/voix_elevenlabs.mp3" [--music musique.mp3] [--wait]
```
Cale chaque plan sur la vraie voix (détection des pauses + alignement des 35 phrases), ajoute les sous-titres
mot par mot (Poppins Black, blanc contour noir, à 60 % de la hauteur), les onomatopées jaunes (HIC!, SPLASH!…),
normalise le son à -14 LUFS → `final/the_listener_final.mp4`. `timing.json` donne le début/fin de chaque phrase.
Voix utilisée : ElevenLabs « Johnny Kid – Serious and Calm Narrator », modèle Eleven v4.

## Publication TikTok
- **Titre / légende** : In this town, you can NEVER make a splash 🌊👂
- **Description** : My hiccups almost got me caught by the Listener… #storytime
- **Hashtags** : #roblox #robloxstory #inthisworld #dontsplash #storytime
- Astuce : ajoute un son tendance discret (volume ~10 %) au moment de publier.

## Contenu
| Dossier / fichier | Rôle |
|---|---|
| `script.txt` | Texte exact pour ElevenLabs, une phrase par ligne (= un plan). |
| `shotlist.md` | N° du plan, phrase, durée, cadrage, fichier. |
| `previews/plan_XX.png` | 1 image clé par plan (EEVEE, 540x960), pour valider le style. |
| `blend/plan_XX.blend` | Scènes prêtes à rendre : EEVEE, 1080x1920, 30 fps, caméra, animation, lumières (visages embarqués). |
| `render_all.py` | Rend tous les .blend et encode les MP4 (à lancer sur ton PC). |
| `render_plan.py` | Regénère les .blend depuis les scripts (+ aperçus avec `--preview`). |
| `lib/core.py` | Réglages de rendu, matériaux procéduraux (carrelage, bois, brique, tissu, eau…), primitives, clés d'animation (ease, overshoot), caméra. |
| `lib/faces.py` | Génère les visages 2D (neutre, sourire, peur, sueur, colère, dodo, hoquet, souffle retenu…) → `textures/faces/` (Pillow requis). |
| `lib/chars.py` | Persos R6 riggés (armature root/torso/head/arm/leg), visage interchangeable avec clignements, et le monstre The Listener. |
| `lib/sets.py`, `lib/sets_pool.py` | Modules de décor : piscine jour/nuit, vestiaires, salle de bain, lac, rue, façade. |
| `lib/shotkit.py`, `lib/shots.py` | Timing, caméra (push-in), marche, hoquet, ricochets, gouttes, Zzz, et les 35 plans. |

## Modifier puis regénérer
```bash
pip install bpy pillow            # ou utilise Blender : blender -b -P render_plan.py -- all
python render_plan.py all          # recrée blend/plan_XX.blend
python render_plan.py 12 --preview # recrée le plan 12 + son aperçu
```

## Notes
- Durées estimées à 0,4 s/mot.
- Le tiers bas de l'image est laissé libre pour les sous-titres.
- Les aperçus ont été rendus en EEVEE sans GPU (24 échantillons) : ton rendu GPU sera plus net, avec un meilleur anti-aliasing et un vrai flou de mouvement.
