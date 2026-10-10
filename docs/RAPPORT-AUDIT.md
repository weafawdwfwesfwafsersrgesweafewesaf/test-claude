# Rapport d'audit et de corrections — RoSwarm 0.1.0 → 0.2.0

Date : octobre 2026. Périmètre : tout le dépôt (`server/`, `plugin/`, `public/`, `test/`, lanceurs, documentation).
Environnement : Linux, Node 22. **Roblox Studio n'était pas disponible** : le plugin a été compilé et sa fonction
d'empreinte a été exécutée avec l'outillage Luau officiel, mais il n'a pas tourné dans Studio (voir `TESTS-STUDIO.md`).

## A. Résumé

État initial : 8 tests de bout en bout, tous réussis, mais 4 défauts graves **reproduits** sur le code d'origine
(script `repro.mjs`, non versionné) :

1. N'importe quel processus local pouvait se faire passer pour Studio, sans aucun secret, et recevoir les commandes des agents.
2. Deux écritures rapides du même fichier pouvaient arriver dans le désordre : Studio gardait **l'ancienne** version.
3. N'importe quel processus local pouvait écrire des scripts dans `src/` via `/plugin/changes`.
4. Une modification locale pas encore synchronisée était **écrasée** par une modification faite dans Studio.

Après corrections : appairage explicite du plugin, jetons et sessions, livraison « au moins une fois » sans double
exécution, synchronisation à états avec nouvelles tentatives, réconciliation à trois points, conflits sans perte,
cycle de vie des tâches avec validation, et 55 tests (unitaires, sécurité, synchronisation, coordination, bout en bout).

## B. Défauts corrigés

| # | Gravité | Module | Cause | Correction | Test |
|---|---|---|---|---|---|
| 1 | Critique | `index.js`, `studio.js` | Routes `/plugin/*` sans authentification : seuls l'absence d'`Origin` et le `Content-Type` étaient vérifiés | Appairage approuvé dans l'interface (`pluginAuth.js`), jeton 256 bits stocké sous forme d'empreinte et révocable, exigé sur toutes les routes | `security.test.js` : « aucune route ne répond sans jeton… », « ne peut pas approuver sa propre demande » |
| 2 | Critique | `studio.js` | `sessionId` choisi par le client, n'importe qui pouvait devenir la session active | Session générée par le serveur (128 bits), liée au jeton, expirée après 35 s, fermée à la révocation | « session d'un autre plugin », « session expirée », « révocation » |
| 3 | Critique | `studio.js` | Résultats acceptés de n'importe qui, pour n'importe quelle commande | Résultat refusé si la commande appartient à une autre session (403) ; doublons et retards ignorés | « faux résultats » |
| 4 | Critique | `sync.js` | Plusieurs envois simultanés du même fichier, exécutés en parallèle par le plugin | Un seul envoi à la fois par fichier, plus un numéro d'ordre croissant que le plugin respecte | `sync.test.js` « écritures rapides » |
| 5 | Élevée | `sync.js` | Le contenu était mémorisé comme « envoyé » **avant** la confirmation ; un échec n'était jamais réessayé | États `pending / in_progress / applied / unknown / failed / conflict`, base mise à jour seulement après confirmation, nouvelles tentatives 1 s → 30 s (6 essais max), erreurs permanentes et temporaires distinguées | « pas de réponse », « erreur permanente » |
| 6 | Élevée | `sync.js` | Une modification Studio écrasait une modification locale non synchronisée | Détection du conflit, le fichier gagne, la version Studio est sauvegardée dans `.roswarm/conflicts/`, l'auteur est prévenu | « conflit » |
| 7 | Élevée | `studio.js` | Réponse de long-poll perdue = commande perdue jusqu'au délai d'expiration | `pollId`/`lastPollId` : renvoi automatique ; le plugin met en cache les résultats et n'exécute jamais deux fois | « réponse de poll perdue » |
| 8 | Élevée | `sync.js` | À chaque reconnexion, tout `src/` était renvoyé : les modifications faites dans Studio pendant une coupure étaient écrasées | Réconciliation à trois points (fichiers / empreintes calculées par le plugin / base persistée) | « changements des deux côtés pendant l'arrêt » |
| 9 | Élevée | `sync.js` | Suppression immédiate quand un fichier disparaissait, y compris pendant un remplacement atomique par un éditeur ; les enfants du script étaient détruits | Délai de grâce de 1,5 s, enfants conservés dans un `Folder`, jamais de suppression d'un script non marqué | « suppressions » |
| 10 | Élevée | `sync.js` | `src/` vide (dossier déplacé) aurait entraîné la suppression des scripts dans Studio (défaut introduit puis corrigé pendant le travail) | Aucune suppression automatique si `src/` est vide : réimport à la place | « src/ vidé pendant l'arrêt » |
| 11 | Élevée | `index.js`, `studio.js` | Changer de projet laissait la session Studio rattachée à l'ancien projet : les modifications Studio étaient ignorées | Session rattachée au projet actif, avec réconciliation | « Studio connecté puis nouveau projet » |
| 12 | Élevée | `tools.js` | Un agent d'un autre projet pouvait piloter le Studio du projet actif | Vérification du projet avant tout outil Studio | `coordination.test.js` « autre projet » |
| 13 | Moyenne | `sync.js`, `syncCore.js` | Chemins venant de Studio peu validés ; liens symboliques suivis | `resolveInside` (refus de `..`, chemins absolus, liens symboliques sortants, noms réservés Windows), aucun lien suivi | `unit.test.js` « resolveInside », `sync.test.js` « lien symbolique », `security.test.js` « chemins hors projet » |
| 14 | Moyenne | `sync.js` | Un script écrit à la main dans Studio était remplacé sans copie | Le plugin renvoie l'ancienne source, que le serveur sauvegarde | « script écrit à la main » |
| 15 | Moyenne | `coord.js` | Tâches : `done` déclaré par n'importe qui, aucune validation ni dépendance, transitions libres | États `todo/doing/review/blocked/done`, transitions vérifiées, « à valider » obligatoire si quelqu'un d'autre a créé la tâche, dépendances, critères d'acceptation, double fin sans effet | `unit.test.js` « tâches », `coordination.test.js` « cycle de vie » |
| 16 | Moyenne | `coord.js` (bug introduit puis corrigé) | Après le premier passage, « terminer » une tâche depuis `todo` était refusé (la conversion vers `review` précédait la vérification) | Vérification faite sur le statut demandé | « notifications » (bout en bout) |
| 17 | Moyenne | `agents.js` | Agent fermé ou planté : ses tâches restaient « en cours » sans fin | Tâches remises à faire, créateur prévenu | « agent fermé en pleine tâche » |
| 18 | Moyenne | `index.js` | Écrasement silencieux du travail d'un autre agent après expiration de sa réservation | Suivi de l'auteur de chaque fichier : alerte dans l'activité et notification | « écrasement » |
| 19 | Moyenne | `index.js` | `/api/studio/raw` permettait à l'interface d'appeler n'importe quel outil du plugin | Liste blanche d'outils en lecture | « outils Studio en écriture interdits » |
| 20 | Faible | `index.js` | Contrôle des fichiers statiques par préfixe (`public2/…` aurait passé) ; corps limité à 20 Mo ; corps non-objet accepté | Préfixe avec séparateur, URL décodée, 8 Mo (plugin) / 10 Mo (API), 413/400 explicites, délais de requête | « fichiers statiques », « données malformées » |
| 21 | Faible | `index.js` | Comparaison du jeton non constante dans le temps ; rejets de promesses non gérés | `timingSafeEqual`, gestionnaires `unhandledRejection` et `uncaughtException`, arrêt propre (sauvegarde de l'état de synchronisation, fermeture des sessions) | — |
| 22 | Perf. | `sync.js` | Un seul lot de 40 scripts par passage toutes les 300 ms | Plusieurs lots par passage, nouveau passage dès qu'un lot se termine | mesure ci-dessous |

## C. Fichiers

- **Ajoutés** : `server/pluginAuth.js` (appairage, jetons), `server/syncCore.js` (logique pure testable),
  `test/helpers.js` (serveur réel et plugin simulé), `test/unit.test.js`, `test/security.test.js`, `test/sync.test.js`,
  `test/coordination.test.js`, `docs/PROTOCOL.md`, `docs/TESTS-STUDIO.md`, ce rapport.
- **Modifiés** : `server/studio.js` (sessions, livraison), `server/sync.js` (machine à états, réconciliation),
  `server/index.js` (authentification, limites, routes), `server/coord.js` (tâches, écritures),
  `server/tools.js` (validation, nouveaux outils), `server/agents.js` (agent parti), `server/tooldefs.cjs`,
  `server/projects.js` (consignes), `plugin/RoSwarm.lua` (appairage, idempotence, empreintes, suppression sûre),
  `public/*` (appairage, révocation, état de synchronisation, tâches), `test/e2e.test.js` (nouveau protocole,
  mêmes scénarios), `README.md`, `package.json` (0.2.0, `npm test` portable).
- **Supprimés** : aucun.
- **Dépendances ajoutées** : aucune.

## D. Tests

Commandes réellement exécutées :
```
npm test                                  # 55 tests : 54 réussis, 1 ignoré (pas d'interpréteur Luau)
LUAU_BIN=/chemin/luau npm test            # 55 tests : 55 réussis
luau-compile --null plugin/RoSwarm.lua    # compilation du plugin : OK
luau-analyze (mode nonstrict)             # aucun avertissement hors API Roblox inconnues de l'analyseur autonome
```
La suite complète a été exécutée deux fois de suite, avec le même résultat (aucun échec intermittent observé).
Les tests de référence d'origine (8) ont été conservés et adaptés au nouveau protocole. Aucun test n'a été supprimé.

**Non exécuté** : tout ce qui demande un vrai Roblox Studio. Le plugin Lua n'a tourné que via sa fonction
d'empreinte ; les tests de protocole utilisent un plugin simulé en JavaScript qui suit la même spécification.
Procédure manuelle : `docs/TESTS-STUDIO.md`.

## E. Sécurité

Ajouté : appairage avec approbation humaine et code de vérification, jetons de plugin (256 bits, empreinte SHA-256,
révocables, limités aux routes du plugin), sessions générées par le serveur et liées à leur jeton, avec expiration,
refus des résultats inter-sessions, limites de débit et de taille, validation des entrées, confinement des chemins,
comparaison à temps constant, aucun secret dans les réponses (vérifié par test).

Risques restants : un logiciel malveillant qui tourne sous le compte de l'utilisateur peut lire `~/.roswarm/`
(c'est la limite de tout outil local). Le code à 4 chiffres protège contre une approbation par erreur, pas contre
un utilisateur qui approuve sans vérifier. Les agents ont les droits de l'utilisateur dans le dossier du projet.
Ce travail n'est **pas** un audit de sécurité exhaustif (pas de fuzzing, pas de revue externe).

## F. Performances (mesurées)

Machine de développement Linux, plugin simulé (pas Studio), 1000 scripts d'environ 600 octets répartis en 20 dossiers :
- avant l'optimisation : envoi initial en **7,6 s** (25 commandes, une toutes les 300 ms) ;
- après : **0,5 à 1,3 s** selon l'exécution (25 commandes groupées, 4 en parallèle) ;
- modification isolée d'un script parmi 1000 : 0,3 à 0,5 s, **une seule** commande envoyée.

Dans un vrai Studio, le temps d'application des scripts et le calcul des empreintes en Luau s'ajoutent : non mesurés.

## G. Risques restants (par priorité)

1. **Élevé** : plugin non testé dans un vrai Studio (en-tête personnalisé, `UpdateSourceAsync` sur un script
   ouvert, performance de `sync_manifest` sur une grosse place). → Faire `docs/TESTS-STUDIO.md`.
2. **Moyen** : la vérification de syntaxe passe par `loadstring` (syntaxe seulement, pas les types, ni les
   `require` manquants). → Ajouter luau-lsp/selene en option si installés.
3. **Moyen** : les renommages sont traités comme suppression + création (les références vers l'ancien script
   dans Studio ne suivent pas).
4. **Faible** : les réservations et les tâches « en cours » ne survivent pas à un redémarrage de RoSwarm.
   C'est voulu, puisque les agents s'arrêtent aussi ; le tableau de tâches, lui, est persisté.
5. **Faible** : plusieurs onglets de l'interface ouverts en même temps répondent tous aux requêtes du terminal
   (affichage seulement).

## H. Validation

```
npm install
npm test
npm start          # puis suivre docs/TESTS-STUDIO.md dans Roblox Studio
```

## I. Conclusion

RoSwarm 0.2.0 est **prêt pour des tests locaux**, y compris un essai réel dans Studio en suivant
`docs/TESTS-STUDIO.md`. Il sera prêt pour une **utilisation régulière en développement** une fois ces scénarios
validés dans un vrai Roblox Studio. Ce n'est pas un logiciel « prêt pour la production » au sens d'un produit
vérifié par des tiers.
