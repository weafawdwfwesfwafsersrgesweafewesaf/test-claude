---
name: roblox-interface
description: À utiliser pour créer ou modifier l'interface (HUD, menus, boutiques, compteurs, boutons) - ScreenGui adaptés au mobile et au PC, animations, code client propre.
---

# Interface (GUI)

## Construction
- Un `ScreenGui` par écran logique dans `StarterGui` (`ResetOnSpawn = false` pour un HUD permanent).
- Tailles et positions en **Scale** (`UDim2.fromScale`) + `UIAspectRatioConstraint` : marche sur téléphone et PC.
- `UIListLayout` / `UIGridLayout` / `UIPadding` / `UICorner` / `UIStroke` au lieu de placer chaque élément à la main.
- `TextScaled = true` + `UITextSizeConstraint` (max) pour les textes.
- Zone sûre mobile : `ScreenInsets = DeviceSafeInsets`.
- Pour construire l'interface dans Studio, utilise `run_luau` ou `create_instance` (une hiérarchie propre et nommée).

## Code (LocalScript dans StarterPlayerScripts ou dans le ScreenGui)
- L'interface affiche et demande ; le serveur décide (achat via RemoteEvent, voir `roblox-client-serveur`).
- Mets à jour l'affichage en écoutant les données (leaderstats `.Changed`, attributs), pas avec une boucle.
- Animations : `TweenService` (ouverture de menu, bouton qui grossit au survol, compteur qui « pop »).
- Boutons : `Activated` (marche au tactile et à la souris), pas `MouseButton1Click`.

## Lisibilité
- Contraste fort, textes courts, gros boutons (au moins 44 px de haut sur mobile).
- Ferme les menus avec un bouton visible ; pas de menu qui bloque tout l'écran sans moyen d'en sortir.
