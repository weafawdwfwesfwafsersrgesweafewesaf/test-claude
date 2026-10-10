---
name: sobriete-code
description: À utiliser AVANT d'écrire ou de modifier du code (scripts Luau, systèmes de jeu). Fait écrire moins de code, plus simple, en réutilisant ce que Roblox et le projet fournissent déjà. Économise des tokens et réduit les bugs.
---

# Sobriété : le meilleur code est celui qu'on n'écrit pas

Avant d'écrire quoi que ce soit, descends cette échelle et **arrête-toi au premier « oui »** :

1. **Est-ce que ça doit vraiment exister ?** La demande l'exige-t-elle, ou est-ce que je l'imagine « au cas où » ? Si ce n'est pas demandé, ne le fais pas.
2. **Est-ce que ça existe déjà dans le projet ?** Cherche d'abord (`search`, `get_tree`, fichiers de `src/`, mémoire du projet). Réutilise et étends l'existant au lieu de créer un doublon.
3. **Est-ce que Roblox le fait déjà ?** Exemples : `TweenService` (animations), `ProximityPrompt` (interaction), `CollectionService` + tags (comportements partagés), `Debris` (suppression différée), `leaderstats` (affichage du score), `PathfindingService`, `ContextActionService`, `UIListLayout`/`UIGridLayout`, `SoundService`, `Humanoid`, `Attributes`.
4. **Est-ce qu'un module déjà présent le fait ?** (dans `ReplicatedStorage`, `ServerScriptService`…)
5. **Est-ce que ça tient en quelques lignes ?** Alors pas de nouveau module, pas de classe, pas de framework.
6. **Sinon** : fais le minimum qui marche, sans abstraction « pour plus tard ».

## Jamais retirer
La validation côté serveur (anti-triche), la sauvegarde des données (pcall, retries), la sécurité, l'accessibilité et les messages d'erreur utiles. Sobre ne veut pas dire fragile.

## Concrètement
- Pas de « framework maison », de gestionnaire d'événements générique ou de couche d'abstraction sans besoin réel et présent.
- Modifie le moins de fichiers possible ; préfère éditer une fonction existante.
- Pas de code mort, pas de `print` de debug laissés, pas de commentaires qui répètent le code.
- Une tâche = un changement ciblé. Si tu vois autre chose à améliorer, note-le (`post_message` ou mémoire du projet) au lieu de le faire.
