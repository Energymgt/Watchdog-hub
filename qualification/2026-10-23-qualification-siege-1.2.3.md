# Qualification siège Watchdog Hub — reprise du 23 octobre 2026

Date : 23 octobre 2026, 06:49–06:56 (UTC+2)  
Instance : `http://10.9.86.105:1884/watchdog-hub/`  
Ingest observé : `http://10.9.86.105:8091`  
Mode : lecture seule. Aucune écriture, aucun clic sur Enregistrer, Tester l’intégration, Connecter ou Retirer. Aucun jeton utilisé ni consigné.

## 1. Résumé exécutif

L’instance siège répond. Le dashboard se charge, le WebSocket UIbuilder passe à LIVE, la flotte réelle compte 7 appareils, et l’ingest protège `/v1` par authentification. Le registre d’événements est vide : 3 flux déclarés restent `UNKNOWN`, ce qui est affiché comme tel sur l’écran Flux.

La vue Événements est inutilisable sur le code servi : `#events` affiche Overview. L’interface servie n’est pas celle du dépôt local modifié. Les compteurs d’en-tête affichent « 0 flux » alors que 3 flux sont inconnus.

**Verdict global : NO GO.**

## 2. Périmètre et environnement

Contrôles faits depuis ce poste vers `10.9.86.105`, sans redémarrage et sans lecture du jeton d’ingest.

Le dépôt local reste le commit `e541d2a`, avec les modifications non commitées de la session du 22 octobre. Ces modifications ne sont pas déployées.

## 3. État initial

| Élément | Constat |
| --- | --- |
| UI `GET /watchdog-hub/` | HTTP 200 en 29 ms, titre « Watchdog Hub - BACnet Gateway » |
| Éditeur `GET :1884/` | HTTP 200 en 26 ms, titre « Watchdog Hub ». Non utilisé ensuite |
| `GET /healthz` | HTTP 200 en 25 ms. `ok=true`, registre `sqlite`, fichier `watchdog-registry.sqlite` |
| Compteurs healthz | événements 0, anomalies 0 dont 0 ouvertes, incidents 0 dont 0 actifs, actions 0, résolutions 0 |
| WebSocket | Premier affichage DISCONNECTED / OFFLINE, puis LIVE. 7 appareils chargés |
| Intégrations visibles | Balena connecté, MQTT en réception, Teams indiqué opérationnel dans le panneau Sources. Aucune erreur de source affichée. Aucune commande envoyée |
| Secrets | Jeton Balena et webhook masqués. Valeurs non recopiées. `GET /v1` sans jeton refusé |

## 4. Contrôles

| Contrôle | Résultat | Preuve | Statut |
| --- | --- | --- | --- |
| Version servie = fichiers locaux modifiés | Non. `hash-router.js`, `app-nav.js`, `incident-detail.js` et `index.html` identiques. `fleet-store.js`, `app.js`, overview, événements, anomalies, en-tête et administration différents | SHA-256 des fichiers HTTP 200 contre `uibuilder/watchdog-hub/src` | CONFIRMÉ |
| Marqueurs des corrections locales | Absents du serveur : pas de « non confirmés », pas de `flowsKnown`, liste de vues sans `events` | Fichiers servis | CONFIRMÉ |
| Numéro 1.2.3 exposé par le serveur | Aucun endpoint de version | Absence de réponse dédiée | NON VÉRIFIÉ |
| `GET /healthz` | 200, 25 ms, champs `ok`, `registry`, `path`, compteurs | curl | CONFIRMÉ, données réelles |
| `GET /v1/events?limit=1` | 401, 24 ms, clés `ok`, `error` | curl sans jeton | CONFIRMÉ |
| `GET /v1/anomalies?limit=1` | 401, 25 ms | curl sans jeton | CONFIRMÉ |
| `GET /v1/flows` | 401, 26 ms | curl sans jeton | CONFIRMÉ |
| `GET /v1/incidents?limit=1` | 401, 28 ms | curl sans jeton | CONFIRMÉ |
| `GET /v1/events/:id`, anomalies, flux et incidents détaillés, actions, résolutions | Non appelés : la collection est déjà refusée sans jeton, et le jeton n’a pas été utilisé | Code `runtime/server.js` | BLOQUÉ de l’extérieur, volontairement |
| Lecture interne des flux | 3 flux chargés à 06:54:28, états `UNKNOWN`, motif « Aucun événement reçu » | Écran Flux | CONFIRMÉ |
| Overview | Situation « dégradée » à cause des 4 alertes flotte. 0 incident actif. 7 appareils | Écran après arrivée des flux | CONFIRMÉ |
| Événements `#events` | L’URL change, l’onglet courant reste Overview, le titre reste Operational Overview | Clic puis navigation directe | CONFIRMÉ |
| Anomalies | 0 anomalie, cohérent avec healthz. Un filtre sans résultat garde le titre « Aucune anomalie détectée » et le message « Aucune anomalie ne correspond aux filtres actuels » | Écran | CONFIRMÉ |
| Incidents | Écran Incidents ouvert, 0 incident actif, cohérent avec healthz | Navigation directe | CONFIRMÉ |
| Flotte | 7 appareils, 3 opérationnels, 4 alertes, dont 1 heartbeat absent et 2 hors service. Des états inconnus sont aussi visibles dans la liste | Écran Flotte | CONFIRMÉ |
| Administration | Formulaire chargé, enregistrement désactivé tant que rien n’est modifié. Seuils affichés : grâce 5 min, 2 polls, rétention 30 j, poll 2 min. Phrase servie : les seuils « ne changent pas la machine d’états » | Écran, sans sauvegarde | CONFIRMÉ |
| Persistance | Second `GET /healthz` : les mêmes compteurs à zéro après la navigation | curl | CONFIRMÉ pour les compteurs. Fichier non ouvert |
| Écritures | Non effectuées | Interdit | HORS PÉRIMÈTRE |

Les trois flux visibles sont CSV OASSIS vers SQL PLUTO, Import Auto MeteoSwiss OGD et Statistiques quotidiennes Genève. Aucun n’est affiché opérationnel.

## 5. Anomalies

| Référence | Priorité | Composant | Résultat attendu | Résultat observé | Preuve | Statut | Action recommandée |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | P1 | Événements | `#events` ouvre le workspace Événements | L’URL est `#events`, l’écran reste Overview. Le store servi n’accepte pas la vue `events` | Navigation réelle et `fleet-store.js` servi, ligne de la liste des vues | CONFIRMÉ | Déployer la correction déjà présente dans le dépôt local, après revue |
| S-02 | P1 | Version | Le siège sert la version qualifiée | Les corrections locales ne sont pas servies. Aucune version 1.2.3 n’est exposée | Hash des fichiers | CONFIRMÉ pour l’écart. NON VÉRIFIÉ pour le numéro d’image | Identifier l’image déployée avant tout déploiement |
| S-03 | P2 | En-tête | Un flux inconnu n’est pas résumé comme une absence de flux | « 0 flux » alors que 3 flux sont `UNKNOWN`. L’écran Flux, lui, le dit correctement | En-tête et écran Flux | CONFIRMÉ | Ne pas traiter « 0 flux » comme un état sain |
| S-04 | P2 | Anomalies vides | Liste vide et filtre sans résultat ont des titres distincts | Le titre reste « Aucune anomalie détectée » dans les deux cas. Le message de filtre est correct | Filtre `___aucun___` | CONFIRMÉ | Titre déjà corrigé localement, non déployé |
| A-01 | P2 | Liens d’incident | Événement et anomalie liés cliquables | Aucun incident réel. Le fichier servi `incident-detail.js` est identique au dépôt et ne clique que les liens `flow` | Hash identique, pas de clic possible | CONFIRMÉ dans le code servi. NON TESTÉ par un clic | Ne pas déclarer corrigé |
| A-02 | P2 | Plafond de 100 lignes | La suite au-delà de 100 reste visible | Registre vide. Le flow réellement chargé dans Node-RED n’a pas été lu | healthz à 0 | NON TESTÉ | Ne pas déclarer corrigé |
| A-03 | P2 | Note d’incident | Le texte reste si le serveur refuse | Écriture interdite. Le composant servi vide le commentaire avant la réponse | `incident-detail.js` servi, identique | CONFIRMÉ dans le code. NON TESTÉ en action | Autorisation et registre isolé requis |
| A-04 | P2 | Erreur Balena | Une erreur de poll n’est pas libellée comme un échec d’enregistrement | Aucune erreur Balena affichée. La bannière servie préfixe pourtant toute erreur par « Configuration non enregistrée » | Écran sans erreur, source du fichier servi | NON REPRODUIT à l’écran. Code toujours présent | Ne pas déclarer corrigé |
| S-05 | P3 | Texte des seuils | Le texte dit que les seuils alimentent la machine d’états | Le siège affiche encore qu’ils ne changent pas la machine d’états | Écran Administration | CONFIRMÉ | Correction locale non déployée |

## 6. Tests automatisés

Non relancés pendant cette reprise. La référence du 22 octobre reste : `npm test`, 158 tests, 158 réussites, 0 échec, 0 ignoré, durée TAP 951 ms. Elle ne qualifie pas le code servi.

## 7. Non vérifié

- tag ou image réellement déployés ;
- corps JSON authentifié de `/v1`, le jeton n’ayant pas été utilisé ;
- routes GET de détail, faute d’identifiant et de jeton ;
- clic d’un lien incident vers un événement ou une anomalie, faute d’incident ;
- liste de plus de 100 lignes ;
- note, transition, résolution et enregistrement de configuration ;
- comparaison du `flows.json` actif avec `flows/04_Watchdog_Hub.json` ;
- sauvegarde du volume.

## 8. Risques résiduels

- La supervision des flux est honnête sur l’écran Flux, mais l’en-tête peut être lu comme « aucun flux ».
- La traçabilité des événements est inaccessible par la navigation, alors que le registre est vide et que cette page servira dès les premiers événements.
- Déployer le dépôt local en l’état publierait aussi des fichiers non commités et ne doit pas activer `FORCE_COPY_FLOWS`.
- Teams est affiché opérationnel. Aucun test de webhook n’a été déclenché, donc l’envoi réel reste non prouvé.

## 9. Verdicts

| Niveau | Verdict |
| --- | --- |
| Tests automatisés | GO, dépôt local du 22 octobre seulement |
| Cohérence de version | NO GO |
| Interface navigateur | NO GO |
| API et authentification | GO pour `healthz` ouvert et `/v1` refusé sans jeton. La lecture externe authentifiée reste non faite |
| Persistance | GO en lecture : compteurs stables et cohérents avec l’écran. Fichier non ouvert directement |
| Qualification opérationnelle siège | NO GO |
| Mise en service | NO GO |

Verdict global : **NO GO**.

## 10. Plan d’action

1. Corriger le déploiement de la vue Événements sans remplacer le flow par `FORCE_COPY_FLOWS`.
2. Vérifier l’image en place avant d’y copier le dépôt local.
3. Après déploiement, rouvrir `#events` et contrôler que l’en-tête ne présente plus un flux inconnu comme « 0 flux ».
4. Toute note, transition, résolution ou sauvegarde de configuration reste soumise à une autorisation explicite et à un registre isolé.

## 11. Poursuite du 23 octobre, 06:59

Contrôles en lecture seule, sans redémarrage, sans jeton d’ingest et sans `FORCE_COPY_FLOWS`.

| Constat | Preuve |
| --- | --- |
| Tous les fichiers UI servis portent le même horodatage `Thu, 22 Oct 2026 12:28:29 GMT` | `HEAD` sur `index.html`, `app.js`, `store/fleet-store.js`, événements, en-tête, vue d’ensemble, anomalies, administration, détail d’incident |
| Cet horodatage est postérieur au commit `e541d2a` (22 octobre 2026, 13:55 +0200) et antérieur aux modifications locales de l’interface | `git log -1`, dates des fichiers locaux |
| L’éditeur Node-RED n’est pas lisible | `GET /settings` → 401 |
| Portainer 2.19.4 répond sur le port 9000, son API est fermée | `GET /api/system/status` → 200, `GET /api/endpoints` → 401 |
| L’API Docker du siège n’est pas exposée | port 2375, connexion refusée |
| Le registre n’a pas changé | `GET /healthz` : tous les compteurs restent à 0 |

Le déploiement du correctif local reste bloqué. `publish.ps1` refuse un arbre Git modifié, et aucune session Portainer n’est disponible depuis ce poste. `FORCE_COPY_FLOWS` n’a pas été activé. Le verdict global reste **NO GO**.

## 12. Après redéploiement, 23 octobre 07:19

Image servie horodatée `Fri, 23 Oct 2026 05:17:10 GMT`. Le store contient la vue `events`. L’en-tête contient le libellé des flux non confirmés. `GET /healthz` reste à zéro sur tous les compteurs.

Contrôle navigateur, lecture seule :

| Contrôle | Résultat |
| --- | --- |
| `#events` | Navigation courante « Événements », titre « Events Workspace », registre vide « Aucun événement disponible. » |
| En-tête après lecture des flux | `DEGRADED`, `0 incidents`, `3 flux non confirmés`, `4 alertes flotte` |
| Flux | 3 flux `UNKNOWN`, « Aucun événement reçu », « État non déterminable » |
| Overview | `SITUATION DÉGRADÉE`, KPI 0 incident, 0 flux dégradé, 4 alertes, 7 appareils |

Les défauts de navigation Événements et de libellé « 0 flux » sont levés sur le siège. La dégradation affichée vient des 4 alertes flotte et des 3 flux sans événement. Aucune écriture n’a été faite.
