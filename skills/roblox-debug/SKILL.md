---
name: roblox-debug
description: À utiliser quand quelque chose ne marche pas, et avant de déclarer une tâche finie - trouver et corriger les erreurs, vérifier honnêtement ce qui a été testé.
---

# Déboguer et vérifier

## Trouver le problème
1. `get_console` avec `only_errors: true` : lis le message et la ligne (`Script 'ServerScriptService.Shop', Line 12`).
2. `check_scripts` : erreurs de syntaxe dans les scripts synchronisés.
3. `sync_status` : le fichier est-il bien arrivé dans Studio ?
4. `get_instance` sur l'objet concerné : existe-t-il, au bon endroit, avec les bonnes propriétés ?
5. Ajoute temporairement des `print` ciblés, demande un test en Play, relis `get_console`, puis **retire les print**.

## Erreurs classiques
- `attempt to index nil` : un objet n'existe pas (encore) → `WaitForChild` côté client, vérifie le chemin.
- `Infinite yield possible` : `WaitForChild` sur un nom qui n'existe pas ou mal orthographié.
- Rien ne se passe : script dans le mauvais service (un LocalScript ne tourne pas dans `ServerScriptService`), ou `Disabled`.
- Marche en solo mais pas pour les autres : modification faite côté client au lieu du serveur.

## Avant de dire « fini »
- `validation_report` sur tes fichiers.
- Dis précisément ce qui a été vérifié : « syntaxe OK, synchronisé, pas d'erreur dans la sortie ».
- **Ne dis jamais que c'est testé en jeu si personne n'a lancé Play.** Écris plutôt : « À tester : appuie sur Play, va à la boutique, achète un œuf ».
