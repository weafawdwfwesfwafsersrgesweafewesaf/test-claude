---
name: memoire-projet
description: À utiliser au début de chaque tâche (lire) et à la fin (mettre à jour). Mémoire partagée du projet dans MEMOIRE.md - architecture, décisions, conventions, où se trouve quoi. Évite de tout réexplorer et garde l'équipe cohérente.
---

# Mémoire du projet (partagée par tous les agents)

Le fichier `MEMOIRE.md` à la racine du projet est la mémoire commune de l'équipe. Il survit aux redémarrages des agents
et évite de relire tout le jeu à chaque tâche.

## Au début d'une tâche
Lis `MEMOIRE.md` (s'il existe) avant d'explorer le projet.

## À la fin d'une tâche
Mets-le à jour **brièvement** (réserve-le avec `claim` : `MEMOIRE.md`, puis `release`) :

```markdown
## Architecture
- Monnaie : leaderstats.Coins, gérée par src/ServerScriptService/Economy.server.luau
- Remotes : ReplicatedStorage/Remotes (BuyEgg, ClaimCoin)

## Conventions
- Modules de config dans ReplicatedStorage/Config ; noms en PascalCase

## Décisions
- 2026-10-12 : œufs payés côté serveur uniquement (anti-triche)

## Où se trouve quoi
- Map : Workspace/Map (Spawn, EggShop, CoinGarden)

## À faire / problèmes connus
- Le son de la boutique n'est pas encore branché
```

## Règles
- Seulement ce qui servira aux prochains : pas de journal détaillé, pas de code (des chemins).
- Corrige ce qui est devenu faux plutôt que d'ajouter.
- Moins de 150 lignes : résume les vieilles sections.
