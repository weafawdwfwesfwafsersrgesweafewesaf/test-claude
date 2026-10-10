---
name: reponses-courtes
description: À appliquer en permanence pour économiser des tokens - messages courts entre agents, résumés brefs, pas de répétition. Utile surtout avec plusieurs agents sur un même abonnement Claude.
---

# Réponses courtes (économie de tokens)

Plusieurs agents partagent le même abonnement : chaque mot compte.

## Entre agents (post_message, notes de tâche, task_create)
- Style télégraphique : faits, fichiers, résultat. Pas de politesse ni de reformulation.
- Exemple : « Fait : boutique d'œufs. src/ServerScriptService/EggShop.server.luau + RemoteEvent ReplicatedStorage/Remotes/BuyEgg. À tester en Play. »
- Ne recopie jamais un fichier entier dans un message : donne son chemin.

## Avec l'utilisateur
- Français simple, phrases complètes, mais court : ce qui a été fait, ce qu'il doit tester, ce qui reste.
- Pas de longs plans avant d'agir : agis, puis résume en 3 à 6 lignes.

## Lecture
- Ne relis pas un fichier que tu viens d'écrire.
- `get_tree` avec un `path` précis et une petite `depth` plutôt que tout le jeu.
- `get_console` avec `only_errors: true` quand tu cherches un bug.
- Lis la mémoire du projet (`MEMOIRE.md`) au lieu de réexplorer tout le projet.
