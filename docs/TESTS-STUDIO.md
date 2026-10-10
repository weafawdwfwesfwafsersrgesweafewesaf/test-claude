# Tests à faire dans un vrai Roblox Studio

Les tests automatiques (`npm test`) utilisent un **plugin simulé** qui suit le même protocole que `plugin/RoSwarm.lua`.
Ils ne remplacent pas un essai dans Roblox Studio, qui n'est pas disponible dans l'environnement où RoSwarm a été
développé. Voici la procédure manuelle, à faire sous Windows ou macOS. Elle prend une quinzaine de minutes.

## Préparation
1. `npm install`, puis `npm start`.
2. Accueil → Plugin Roblox Studio → **Installer** (ou **Mettre à jour**), puis redémarre Studio.
3. Crée un projet « TestStudio », puis ouvre une place **vide** (Baseplate) dans Studio.

## Scénarios

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir la place | Studio demande l'autorisation HTTP pour `127.0.0.1` : accepte. La sortie affiche « Autorisation nécessaire… code XXXX ». |
| 2 | Dans RoSwarm, vérifie le code, puis **Autoriser** | La sortie affiche « Plugin autorisé », puis « Connecté ». Le panneau indique « Studio ouvert ». |
| 3 | Crée `src/ServerScriptService/Hello.server.luau` contenant `print("salut")` | Le Script apparaît dans ServerScriptService, avec l'attribut `RoSwarm`. Sync : « 1 à jour ». |
| 4 | Lance Play | La sortie affiche « salut ». Onglet Console de RoSwarm : « [Play] salut ». |
| 5 | Modifie le script **dans Studio** | Le fichier est mis à jour en moins de 2 s. Aucun renvoi vers Studio (Activité : « Studio → src/… » seulement). |
| 6 | Écris `local x = = 1` dans le fichier | Sync : « 1 erreur de syntaxe ». Le script est quand même mis à jour dans Studio. |
| 7 | Supprime le fichier | Le Script disparaît de Studio environ 2 s plus tard. Ctrl+Z dans Studio le restaure. |
| 8 | Ferme RoSwarm, modifie un fichier, modifie un autre script dans Studio, relance RoSwarm | Activité : « réconciliation : push 1, import 1… ». Les deux changements sont conservés. |
| 9 | Accueil → Studios autorisés → **Révoquer** | La sortie affiche « Autorisation révoquée » et une nouvelle demande apparaît dans RoSwarm. |
| 10 | Agent : `run_luau` avec `print(workspace.Baseplate.Size)` | Le résultat revient à l'agent. Ctrl+Z annule une modification faite par `run_luau`. |
| 11 | Place existante avec des scripts, projet vide | Les scripts sont importés dans `src/`. Rien n'est modifié dans Studio. |
| 12 | Script écrit à la main dans Studio (sans attribut), puis fichier du même nom créé | Le script est remplacé, et sa version d'origine est copiée dans `.roswarm/conflicts/`. |

Note les écarts et la version de Studio (Aide → À propos), puis ouvre un ticket avec la sortie de Studio.

## Points précis à surveiller (non vérifiables hors Studio)
- `ScriptEditorService:UpdateSourceAsync` alors qu'un script est ouvert dans l'éditeur : vérifier que le contenu
  affiché est bien mis à jour.
- L'en-tête personnalisé `X-RoSwarm-Plugin` passe-t-il par `HttpService:RequestAsync` ? (Il le devrait : les
  en-têtes `X-` ne sont pas réservés par Roblox.)
- Performance de `sync_manifest` (empreinte FNV-1a en Luau) sur une place avec beaucoup de scripts.
