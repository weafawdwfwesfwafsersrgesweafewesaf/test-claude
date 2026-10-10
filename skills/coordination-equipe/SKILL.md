---
name: coordination-equipe
description: À utiliser quand tu travailles avec d'autres agents RoSwarm - surtout pour le chef d'équipe qui découpe une grosse demande, mais aussi pour tout agent qui reçoit une tâche.
---

# Travailler en équipe RoSwarm

## Chef : découper une grosse demande
1. `agents_status` (qui est libre), `board_read`, et la mémoire du projet (`MEMOIRE.md`).
2. Découpe en tâches **indépendantes** : chacune touche des fichiers ou une zone de la map différents.
3. Fais d'abord les fondations partagées toi-même (RemoteEvents, modules de config) ou crée une tâche dont les autres dépendent (`depends_on`).
4. `task_create` pour chaque tâche avec : un titre clair, des détails précis (fichiers à créer, noms des RemoteEvents à utiliser), un `acceptance` vérifiable, et un `assignee` (#2, #3…). Répartis équitablement.
5. Ne code pas ce que tu as délégué. Quand une tâche passe « à valider » : `validation_report`, puis `task_update` done, ou doing avec une note précise.
6. À la fin : un résumé court pour l'utilisateur + ce qu'il doit tester en Play.

## Bonne tâche
> Titre : Boutique d'œufs (serveur)
> Détails : créer src/ServerScriptService/EggShop.server.luau. Écouter ReplicatedStorage/Remotes/BuyEgg (déjà créé). Prix dans ReplicatedStorage/Config/Eggs.luau. Retirer les pièces dans leaderstats.Coins.
> Acceptation : acheter un œuf retire le prix et ajoute un pet dans les données ; achat refusé sans assez de pièces.

## Tout agent
- Commence par `board_read` et `MEMOIRE.md` ; `claim` avant de modifier ; `release` après.
- Si tu bloques (dépendance, question) : `task_update` status `blocked` + note, et `post_message` au chef.
- Ne modifie pas le travail d'un autre sans le prévenir (`post_message`).
