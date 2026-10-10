# RoSwarm — contrats internes

Ce document décrit ce que le code garantit réellement (version 0.2.0). Chaque point renvoie au fichier qui l'implémente
et au test qui le vérifie.

## 1. Réseau et secrets

| Élément | Où | Détail |
|---|---|---|
| Écoute | `server/index.js` | `127.0.0.1` uniquement, port 34900 (`ROSWARM_PORT`). Aucune option d'écoute plus large. |
| Hôte HTTP | `hostOk()` | Seuls `127.0.0.1:PORT` et `localhost:PORT` sont acceptés (anti « DNS rebinding »). |
| Jeton de l'application | `~/.roswarm/token` | 192 bits aléatoires, fichier `0600` (sous Windows : droits du profil utilisateur). Exigé par toutes les routes `/api/*` (sauf `/api/ping`) et par le WebSocket. Comparaison à temps constant. Utilisé par l'interface, le pont MCP (`bridge.cjs`) et le hook Claude (`hook.cjs`), qui le lisent dans `~/.roswarm/connection.json`. |
| Jetons de plugin | `~/.roswarm/plugin-tokens.json` | 256 bits, générés par le serveur à l'appairage. Seule l'empreinte SHA-256 est stockée. |

Le jeton de l'application est l'« administrateur » : il permet tout, y compris approuver un plugin. Un jeton de plugin
ne donne accès qu'aux routes `/plugin/*`, donc à ce qu'un plugin Studio doit pouvoir faire.

**Limite assumée :** un programme qui tourne sous **ton** compte peut lire `~/.roswarm/`, comme n'importe quel fichier
de ton profil. RoSwarm protège contre les sites web, les autres comptes de la machine et les processus qui n'ont pas
accès à ces fichiers, pas contre un logiciel malveillant déjà installé sous ton compte.

## 2. Appairage du plugin (`server/pluginAuth.js`)

1. Le plugin génère un `requestId` (GUID) et un code à 4 chiffres, et l'affiche dans la sortie de Studio.
2. `POST /plugin/pair { requestId, code, placeName }` : la demande apparaît dans RoSwarm (« Studio demande l'accès »),
   avec le code. Il y a au plus 5 demandes en attente et 10 demandes par minute. Une demande expire au bout de 5 minutes.
3. L'utilisateur vérifie le code et clique **Autoriser**. Cette route exige le jeton de l'application.
4. `POST /plugin/pair-status { requestId }` renvoie le jeton **une seule fois**, puis la demande est oubliée.
   Le plugin le garde dans ses réglages (`plugin:SetSetting`).
5. **Révocation** : Accueil → « Studios autorisés » → Révoquer. Les sessions ouvertes avec ce jeton sont fermées
   immédiatement, leurs commandes en cours échouent avec un résultat « inconnu », et le plugin redemande une autorisation.

Tests : `test/unit.test.js` (appairage), `test/security.test.js` (approbation impossible sans l'interface, révocation).

## 3. Sessions et livraison des commandes (`server/studio.js`)

- `POST /plugin/hello` (jeton requis) ouvre une session. Le `sessionId` est généré par le serveur (128 bits).
  Une session n'est utilisable qu'avec le jeton qui l'a ouverte. Elle expire après 35 s sans requête.
  Un même Studio qui se reconnecte (même jeton + même `instanceId`) reprend sa session.
- `POST /plugin/poll { sessionId, lastPollId }` : long-polling (20 s). La réponse contient un `pollId` et au plus 20 commandes.
- **Au moins une fois, sans double exécution.** Une commande envoyée dans la réponse `pollId = N` n'est considérée comme
  reçue que lorsque le plugin renvoie `lastPollId ≥ N`. Sinon (réponse perdue), elle est renvoyée telle quelle
  (5 essais maximum). Le plugin garde le résultat des 300 dernières commandes : une commande déjà exécutée n'est pas
  rejouée, son résultat est simplement renvoyé.
- `POST /plugin/result` : refusé si la commande appartient à une autre session (403). Ignoré sans effet si elle est
  inconnue, déjà résolue ou expirée (doublon ou retard).
- Les erreurs portent un code qui dit si l'opération a pu avoir lieu :

| Code | Signification | Rejouer ? |
|---|---|---|
| `NO_STUDIO`, `QUEUE_FULL`, `NOT_DELIVERED`, `TIMEOUT_NOT_DELIVERED` | rien n'a été appliqué | oui, sans risque |
| `TIMEOUT_UNKNOWN`, `DISCONNECTED_UNKNOWN` | **résultat inconnu** | seulement si l'opération est idempotente |
| `REJECTED` | Studio a refusé (erreur du plugin) | non, pas tel quel |

- **Bornes** : 500 commandes en file par session, 2000 en tout, corps HTTP limités à 8 Mo (plugin) et 10 Mo (API),
  1000 lignes de sortie Studio et 300 entrées d'activité en mémoire.
- Les sessions « sortie seulement » (plugin en test Play) ne reçoivent jamais de commandes.
- Studio est relié au **projet actif**. Un agent d'un autre projet ne peut pas le piloter. Changer de projet relie
  la session au nouveau projet et relance une réconciliation.

## 4. Synchronisation `src/` ↔ Studio (`server/sync.js`, `server/syncCore.js`)

**Correspondance** : `src/<Service>/<Dossiers>/<Nom>.server.luau` → Script, `.client.luau` → LocalScript,
`.luau` → ModuleScript. Les noms invalides (`..`, `.caché`, caractères interdits, noms réservés Windows) sont refusés.
Les chemins sont confinés à `src/` après normalisation, et les liens symboliques ne sont jamais suivis.

**États d'un fichier** :

```
pending ──envoi──▶ in_progress ──confirmé──▶ applied
   ▲                    │
   │                    ├─ rien n'a été appliqué ───────────▶ pending (attend Studio)
   │                    ├─ résultat inconnu ────────────────▶ unknown ─▶ nouvel essai (1 s, 2 s, 4 s… max 30 s, 6 essais)
   │                    └─ refus de Studio / trop gros ─────▶ failed (permanent : relancé au prochain changement)
   └──── nouveau changement local (même pendant un envoi : marqué « dirty », renvoyé après)
```

- **La base** (empreinte commune aux deux côtés) n'est mise à jour **qu'après confirmation de Studio**.
  Elle est persistée dans `~/.roswarm/sync/<projet>.json`.
- **Un seul envoi à la fois par fichier**, et des numéros d'ordre croissants (`RoSwarmSeq`). Le plugin refuse une
  version plus ancienne que celle qu'il a déjà : Studio ne peut pas revenir en arrière.
- **Envois groupés** : jusqu'à 40 scripts (400 Ko) par commande et 4 commandes en parallèle.
- **Suppression** : un fichier doit être absent pendant 1,5 s avant d'être supprimé dans Studio, car les éditeurs qui
  écrivent « atomiquement » suppriment puis recréent le fichier. Les enfants d'un script supprimé ne sont jamais
  détruits : ils passent dans un `Folder` du même nom. Un script non marqué RoSwarm n'est jamais supprimé.
  Un renommage est traité comme une suppression suivie d'une création.
- **Changements venant de Studio** : écrits dans le fichier (écriture atomique) **et** dans la base. L'événement du
  watcher qui suit voit `contenu == base` et ne renvoie rien : il n'y a pas de boucle.
- **Conflit** : si le fichier a aussi changé (envoi en attente, ou contenu différent de la base), **le fichier gagne**.
  La version Studio est sauvegardée dans `.roswarm/conflicts/` et l'agent qui a écrit le fichier est prévenu.
  Un script écrit à la main dans Studio, mais pas encore synchronisé, est lui aussi sauvegardé avant d'être remplacé.
- **Réconciliation à chaque connexion de Studio** (y compris après un redémarrage de RoSwarm) : comparaison à trois
  points entre fichiers, Studio (empreintes FNV-1a calculées par le plugin) et base :

| Fichier | Studio | Action |
|---|---|---|
| = Studio | | rien |
| changé | = base | envoi |
| = base | changé | import dans le fichier |
| changé | changé | conflit (le fichier gagne, la copie Studio est sauvegardée) |
| supprimé | = base | suppression dans Studio |
| supprimé | changé | conflit (on restaure la version Studio) |
| absent | nouveau (pas de base) | import |

- **Fins de ligne** : tout est normalisé en LF avant l'envoi et avant le calcul des empreintes. Le serveur et le plugin
  calculent la même empreinte (vérifié par `test/unit.test.js` avec l'interpréteur Luau officiel).

Tests : `test/sync.test.js` (ordre, réponse perdue, résultat inconnu, erreur permanente, déconnexion, conflit, boucle,
suppressions, script non synchronisé, syntaxe, lien symbolique, changement de projet, redémarrage, 1000 scripts).

## 5. Réservations (`server/coord.js`)

- `claim` réserve **tout ou rien** (jusqu'à 50 ressources). Node.js est mono-thread et la vérification puis
  l'écriture se font sans point d'attente : deux demandes simultanées ne peuvent pas réussir toutes les deux.
- Une réservation dure 10 minutes. Refaire `claim` la **renouvelle**. Seul son propriétaire peut la libérer.
  Elle est libérée automatiquement à l'arrêt ou à la fermeture de l'agent, et à l'expiration.
- Les noms sont normalisés : séparateurs `\` → `/`, et comparaison sans tenir compte de la casse (Windows, macOS).
- Le hook Claude Code réserve automatiquement chaque fichier avant écriture. Il bloque l'écriture si le fichier est
  réservé par un autre agent.
- **Écrasements** : si un agent modifie un fichier écrit par un autre agent dans les 30 dernières minutes (le verrou
  ayant expiré), ce n'est pas bloqué. Mais l'auteur précédent est prévenu et l'activité affiche ⚠.

Tests : `test/unit.test.js` (tout ou rien, renouvellement, expiration), `test/coordination.test.js` (20 courses
simultanées, agent fermé).

## 6. Tâches (`server/coord.js`)

```
todo ─▶ doing ─▶ review ─▶ done        (review : « fini » déclaré par un agent, à valider)
  │       │        │
  └───────┴──▶ blocked ─▶ todo / doing
done ─▶ doing (réouverture)
```

- Un agent qui termine une tâche **créée par quelqu'un d'autre** la fait passer en `review`. Seuls le créateur et
  l'utilisateur peuvent la passer en `done`. Le créateur est prévenu automatiquement.
- `depends_on` : une tâche ne peut pas passer `doing` tant que ses dépendances ne sont pas `done`.
- `acceptance` : critère de réussite, rappelé à l'agent et au moment de la validation.
- Terminer deux fois une tâche ne change rien. Les transitions interdites sont refusées avec un message clair.
- Un agent fermé ou planté : ses tâches `doing` reviennent à `todo` et leur créateur est prévenu.
- L'utilisateur (interface) peut forcer n'importe quel état.

## 7. Niveaux de validation (`validation_report`)

L'outil distingue, pour chaque fichier : 1) écrit sur le disque, 2) synchronisé avec Studio (confirmé), 3) syntaxe
acceptée par le compilateur Luau de Studio (`loadstring`, sans exécution), 4) erreurs récentes dans la sortie de Studio.
Les niveaux 5 (testé en jeu) et 6 (fonctionnalité validée) ne sont **jamais** déclarés automatiquement.
Sans Studio connecté, la syntaxe est marquée « non vérifiée (hors ligne) ».
