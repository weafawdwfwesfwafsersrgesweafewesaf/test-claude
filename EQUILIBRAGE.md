# Équilibrage de l'économie

Objectif : **~4 h pour finir les 12 niveaux** (au lieu d'environ 23 min), avec quelque chose à gagner toutes les 10 à 15 min : un niveau, un rebirth, un pet, une plaque ou un vélo.
Seuls des **chiffres** ont changé : aucune logique ni aucun bouton n'a été touché.

## Temps estimés (simulation d'un joueur qui joue bien, sans Robux)

| Moment | Avant | Après |
|---|---|---|
| Niveau 6 | 8 min | ~17 min (+ 1er rebirth) |
| Niveau 8 | 12 min | ~1 h |
| Niveau 10 | 17 min | ~2 h |
| Niveau 12 (fin) | **23 min** | **~4 h** |
| 12 rebirths (dernier tapis gratuit) | ~4 h 30 | ~6 h 30–7 h |

Un vrai joueur va moins vite que la simulation : compter plutôt 4 à 5 h.

## Ce qui a changé

**Portes de vitesse des niveaux** (MapConfig + attributs `SpeedRequired` + panneaux « Speed : X+ »)
`0 · 100 · 400 · 1,200 · 3,500 · 10K · 30K · 90K · 250K · 700K · 2M · 5M`
(avant : 0 · 25 · 70 · 150 · 300 · 520 · 820 · 1,250 · 1,900 · 2,800 · 4,200 · 6,500)
`SpeedCurveStat` passe de 420 à 2500 : on garde à peu près la même vitesse réelle (studs/s) à l'entrée des niveaux.

**Trophées de fin de niveau** (ProgressionConfig)
- Vitesse : 25 → 2M, soit environ 25 % de la porte suivante. Le boost se sent à chaque trophée.
- Pièces : 100 → 750K. Le niveau 12 paie de quoi acheter le vélo Ghost (la récompense finale).
- Nombre de trophées et XP : inchangés.

**Rebirth** (UIConfig) : le coût est multiplié par 2,1 à chaque fois → 10K, 21K, 44K, 93K, 190K, 410K, 860K, 1.8M…
Le multiplicateur (+0,5 par rebirth) ne change pas.

**Plaques de vitesse** (LobbyConfig + attributs + panneaux) : 0 · 5 · 15 · **40 · 100 · 220 · 450 · 800** · 1,200 trophées.

**Œufs** : Clavier 500 · Volcan **10,000** (au lieu de 7,500) · Cosmique **150,000** (au lieu de 90,000).

**Vélos** (les pièces repartent de zéro à chaque rebirth) :
Lava 1,500 · Ice 5,000 · Candy 12,000 · Robot 30,000 · Dragon 75,000 · Skeleton 150,000 · Retro 350,000 · Ghost 800,000
→ on peut s'offrir un vélo toutes les 20 à 60 min.
**Trails** ≈ 0,6× et **auras** ≈ 0,8× le prix du vélo du même thème.

**Cadeaux et quotidien** : les récompenses en vitesse sont augmentées pour rester utiles (+100 → +10,000 pour les cadeaux, +500 pour le jour 2).

**Inchangés** : les tapis (rebirths requis et multiplicateurs), les prix Robux, les pets et leurs chances, et le taux de pièces en roulant.

## Réglages rapides
- Jeu trop long : baisser le `2.1` de `UIConfig.RebirthCost` (à 1.9, par exemple).
- Jeu trop court : augmenter les dernières portes de `MapConfig`, **et** mettre les attributs `SpeedRequired` des dossiers `Workspace.BikeASMR.Map.Levels.LevelN` aux mêmes valeurs (la porte physique lit l'attribut).
