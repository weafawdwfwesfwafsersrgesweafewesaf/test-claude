# Guide de style — jeux simulateur (œufs / +1 / steal)

Référence à suivre pour le mapping, l'UI, les animations et les sons.
Basé sur ce qui sort et se vend en ce moment (sept.–oct. 2026) dans le genre simulateur / tycoon / pets.

> Les valeurs chiffrées (lighting, tailles, durées) sont des **points de départ** à ajuster en jeu,
> pas des règles absolues. Toujours tester sur **mobile en graphismes bas**.

---

## 1. Style de build / mapping

### Style principal : "Studs" (néo-classique Roblox)
C'est le look dominant des simulateurs, tycoons et jeux de pets/collection en 2026.

- **Grille 1×1 stud** : toutes les pièces alignées sur la grille pour que les studs tombent bien.
- Deux façons d'avoir les studs :
  1. `Part.TopSurface = Enum.SurfaceType.Studs` (le plus simple).
  2. Une `Texture` avec l'image de stud classique, posée par-dessus la couleur de la pièce,
     avec un peu de transparence (≈ 0.5–0.8) — c'est la technique du baseplate "classique".
- **Ne pas tout mettre en studs** : mélanger studs + `SmoothPlastic` (bordures, chemins, décor)
  pour éviter un rendu plat et répétitif.
- **Formes grosses et lisibles** : silhouettes simples, peu de petits détails, chemins larges.
  Le joueur doit comprendre la map en 2 secondes, même sur téléphone.
- **Couleurs saturées type "jouet"** : verts herbe vifs, bleus ciel, jaunes, oranges. Pas de gris sale.

### Structure de map qui marche (simulateur à zones)
- **Lobby / hub** au spawn : bases des joueurs (plots), boutiques, PNJ, panneau des codes, classement.
- **Zones / biomes en ligne** avec des **portes de monde** (world gates) payantes en monnaie du jeu.
  Chaque zone = une **palette de couleur propre** (prairie verte → désert → glace → lave → espace…).
- Les **éléments importants brillent** (Neon ou Highlight) : œufs, portes, zones de vente.
- **Distance spawn → action ≤ 5 secondes** : le joueur doit jouer tout de suite.
- Pour un jeu "dig" : couches verticales bien différenciées par couleur et matériau, avec un
  panneau de profondeur visible.

### Styles alternatifs (selon le thème)
- **Cartoon smooth / low-poly** (plus doux, façon Grow a Garden) : bon pour les jeux cosy/farming.
- **Moderne mat** : contre-tendance plus "propre", moins enfantin.
- Pour un jeu d'œufs / +1 / steal → **rester sur le studs**, c'est le code visuel du genre.

### Lighting (départ)
- Technologie `Future` (ou `ShadowMap` si besoin de perfs).
- `ColorCorrection` : Saturation ≈ +0.1 à +0.3, Contrast ≈ +0.1, légère teinte chaude.
- `Bloom` léger : Intensity ≈ 0.3–1, Threshold élevé, pour que seuls le Neon et les effets brillent.
- `Atmosphere` légère pour la profondeur. `SunRays` faibles.
- **Pas de Blur au-dessus de 2** en permanence (ça rend flou/brumeux en qualité basse).
  Le Blur sert seulement derrière les menus ouverts.

---

## 2. UI (le plus important)

### Look "Stud UI" (le style qui domine les packs simulateur 2026)
- **Fond des fenêtres** : `ImageLabel` avec texture de studs en `ScaleType = Tile`,
  couleur via `UIGradient`.
- **Dégradé vertical** sur tout : haut clair, **bas plus foncé**.
- **Contours épais** : `UIStroke` 3–5 px, couleur = version **foncée** de la couleur du bouton
  (pas noir pur, pas trop clair : le contour doit contraster).
- `UICorner` arrondi sur tout.
- **Texte épais avec contour** : `UIStroke` sur le texte (noir/foncé, 2–3 px).
- **Polices** : 1 police "titre" grasse et arrondie (FredokaOne, LuckiestGuy) + 1 police lisible
  pour les chiffres (BuilderSans/Gotham en ExtraBold). Jamais plus de 2.
- **Icônes** grosses, colorées, avec contour, cohérentes entre elles.

### Code couleur des boutons
| Couleur | Usage |
|---|---|
| Vert | Acheter / confirmer / équiper |
| Rouge | Fermer (X) / supprimer |
| Jaune–or | Robux, premium, gamepass |
| Bleu | Info, paramètres, neutre |
| Violet | Rebirth / prestige |

### Couleurs de rareté
Commun (gris) → Peu commun (vert) → Rare (bleu) → Épique (violet) → Légendaire (or/orange)
→ Mythique (rouge/rose) → Secret (noir + arc-en-ciel animé).
**Toujours les mêmes partout** : inventaire, index, éclosion, notifications.

### Disposition HUD (standard du genre)
- **Gauche** : colonne de gros boutons de menu (Shop, Pets, Rebirth, Index, Codes, Paramètres).
- **Haut** : compteurs de monnaie (icône + nombre abrégé : 1.2K, 3.4M, 5.6B…).
- **Droite** : cadeaux de temps de jeu, boosts actifs avec timers, événements.
- **Bas** : action principale / hotbar.
- Un petit **badge rouge "!"** qui pulse quand une récompense est dispo.

### Écrans à prévoir
Shop (monnaie du jeu) · Shop Robux (gamepasses + produits) · Inventaire / pets · Index ·
Cadeaux quotidiens / temps de jeu · Rebirth · Codes · Gains hors-ligne · Paramètres
(musique, sons, effets, performances).

### Mobile d'abord
- Tailles en `Scale` + `UIAspectRatioConstraint` + `UISizeConstraint` (min/max).
- Boutons **gros**, rien dans les coins où il y a les contrôles Roblox (joystick, saut, menu).
- Tester sur un petit écran de téléphone avant chaque publication.

---

## 3. Animations / mouvement ("juice")

### Boutons
- **Survol** : scale 1.0 → 1.07–1.1 en ~0.12 s (Quad/Back Out), petite rotation ±3° possible.
- **Clic** : écrasement 0.9 puis retour en Back Out (~0.15 s) + son.
- Le tween de sortie **remplace** celui d'entrée (annuler l'ancien), sinon boutons bloqués.
- Debounce sur les clics.

### Fenêtres
- **Ouverture** : `UIScale` 0.7 → 1 en ~0.25 s **Back Out** + fondu de transparence,
  `BlurEffect` derrière (~10–15) + légère variation du FOV caméra + son "pop".
- **Fermeture** : plus rapide (~0.15 s, Quad In), scale vers 0.8 + fondu.
- Ne pas tweener `Visible` (impossible) : tweener scale/transparence puis cacher à la fin.

### Animations au repos (UI vivante)
- **Reflet** qui balaie les boutons premium toutes les 3–4 s (offset du `UIGradient` animé).
- Icônes qui flottent / tournent doucement, badges "!" qui pulsent.
- Dégradé arc-en-ciel animé pour les raretés Secret / les gamepasses phares.

### Feedback de gain (crucial pour un jeu +1 / œufs)
- Texte **"+1"** (ou "+X") qui jaillit au-dessus du joueur, monte et disparaît,
  couleur selon la stat.
- **Icônes de monnaie qui volent** depuis l'action vers le compteur en haut.
- Le **compteur "punch"** (scale 1.2 → 1) et le nombre **défile** jusqu'à la nouvelle valeur.
- Effets de particules courts sur la collecte.

### Éclosion d'œuf (le moment fort à soigner)
1. Caméra / UI zoom sur l'œuf.
2. L'œuf **tremble 3 fois**, de plus en plus fort (et plus longtemps si rare).
3. **Flash blanc**.
4. Explosion de la **couleur de rareté** + rayons qui tournent derrière.
5. Le pet apparaît en "pop" (Back Out) avec nom + rareté en dégradé.
6. Rare+ : message à tout le serveur ("X a obtenu un LÉGENDAIRE !").
7. Bouton **Skip** + gamepasses "Ouverture rapide" / "Ouvrir x3 / x8".

### Technique
- `TweenService` (pas `TweenPosition`/`TweenSize`, dépréciés).
- Réutiliser les tweens dont les valeurs ne changent pas au lieu d'en recréer à chaque clic.
- Un module `UIAnim` unique (hover, press, open, close, punch) branché sur tous les boutons.

---

## 4. Sons

### Palette UI (type "bulle" cartoon, standard des simulateurs)
| Action | Son |
|---|---|
| Survol | petit "tick" très discret |
| Clic | "pop"/bulle doux |
| Ouvrir / fermer fenêtre | "whoosh" court / pop |
| Achat réussi | pièces / caisse enregistreuse |
| Pas assez d'argent | petit buzz doux (jamais agressif) |
| Récompense / niveau | carillon montant |
| Éclosion normale | "bloop" + petite fanfare |
| Éclosion rare+ | roulement qui monte + grosse fanfare (son unique par rareté) |
| Vol réussi / se faire voler | jingle "mission réussie" / alarme courte |

### Règles
- **Variation de pitch aléatoire** (0.9–1.1) sur les sons répétés (+1, collecte),
  et **pitch qui monte** pendant un combo : ça rend le +1 addictif.
- Sons UI joués **en local** (`SoundService:PlayLocalSound`), sons du monde placés dans le
  Workspace (positionnels) pour que les autres les entendent.
- **Musique** entraînante et légère par zone, volume bas (~0.3), coupable dans les paramètres.
- Sources : Creator Store audio (Roblox), freesound.org, ZapSplat (créditer) ; retouche avec
  Audacity. **Vérifier la licence** et que l'asset existe encore avant de publier.

---

## 5. Checklist avant publication
- [ ] Map en grille studs, mélange studs + smooth, couleurs saturées, une palette par zone
- [ ] Lighting réglé et testé en graphismes bas
- [ ] Tous les boutons ont hover + clic + son
- [ ] Toutes les fenêtres ont ouverture/fermeture animées + blur
- [ ] Feedback "+X" + monnaie qui vole + compteur qui punch
- [ ] Séquence d'éclosion complète avec couleurs de rareté
- [ ] Testé sur téléphone (tailles, coins libres, lisibilité)
- [ ] Musique + sons coupables dans Paramètres
