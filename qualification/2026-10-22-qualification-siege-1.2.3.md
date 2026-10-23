# Qualification siège Watchdog Hub 1.2.3

Date : 22 octobre 2026, 15:51–16:00 (UTC+2)  
Périmètre : instance Node-RED siège, UIbuilder et registre SQLite réel  
Mode : lecture seule. Aucune écriture métier, aucun redémarrage, aucun déploiement.

## 1. Résumé exécutif

L’instance siège n’est pas joignable depuis ce poste. Docker Desktop tourne, mais aucun conteneur n’est démarré. Les ports locaux 1880, 1884 et 8091 refusent la connexion. Aucun processus Node ne porte Node-RED, UIbuilder ou l’ingest.

La qualification opérationnelle s’arrête donc avant les phases navigateur, HTTP siège et persistance réelle.

Les tests automatisés du dépôt local passent : 158 tests, 0 échec, 0 ignoré. Ce résultat ne prouve pas que la version servie au siège est 1.2.3, ni que l’interface, l’API ou le registre de production fonctionnent.

**Verdict global : NO GO.**

## 2. Périmètre et environnement

Contrôles exécutés sur le dépôt `c:\DEV_local\watchdog-hub`, sans modification de code, de flow, de contrat ou de schéma.

Ce qui a été cherché, et seulement cela :

- identité Git en lecture ;
- processus Docker et Node ;
- connexions HTTP locales sur les ports documentés ;
- présence des variables d’environnement, sans lecture de leur valeur ;
- métadonnées du fichier SQLite local, sans l’ouvrir ;
- `npm test`.

Les URL documentées dans `docker-compose.yml` et `README.md` sont des modèles, pas une adresse de siège observée :

- éditeur Node-RED : `http://<serveur>:1884` (conteneur 1880) ;
- dashboard : `http://<serveur>:1884/watchdog-hub` ;
- ingest : `http://<serveur>:8091`.

Aucun nom d’hôte de siège n’est présent dans le dépôt. Aucune adresse distante n’a été inventée ni sondée.

## 3. État initial

| Élément | Constat | Preuve |
| --- | --- | --- |
| Commit local | `e541d2a840848d68fdde80ba0c9605e8fa4a2abc` | `git rev-parse HEAD` |
| Message | Déclare le flux METEO_STAT_DAILY… | `git log -1` |
| Tag Git `1.2.3` | Absent | `git tag -l` et `git rev-parse` : révision inconnue |
| Version déclarée dans le dépôt | `1.2.3` dans `package.json` | Lecture du fichier |
| Version servie par le siège | Non vérifiée | Aucun serveur joignable |
| Arbre de travail | 15 fichiers modifiés, non commités | `git status --short` |
| Docker | Moteur 29.7.2, contexte `desktop-linux`, aucun conteneur | `docker version`, `docker ps` |
| Processus Watchdog / Node-RED | Aucun | Lignes de commande des processus `node.exe` |
| Port 1884 | Connexion refusée | `curl` vers `127.0.0.1:1884`, HTTP 000, environ 2,0 s |
| Port 1880 | Connexion refusée | `curl` vers `127.0.0.1:1880`, HTTP 000, environ 2,0 s |
| Port 8091 | Connexion refusée | `curl` vers `127.0.0.1:8091/healthz`, HTTP 000, environ 2,0 s |
| Registre siège | Non accessible | Volume Docker `watchdog_hub_data` non monté, service arrêté |
| Fichier local `data/watchdog-registry.sqlite` | Présent, 40 960 octets, modifié le 2026-08-25 12:51:29. Pas de fichiers `-wal` ni `-shm`. Non ouvert | Métadonnées du fichier |
| Sauvegarde `.tgz` dans le dépôt | Aucune trouvée | Recherche locale |
| Journaux siège | Inaccessibles | Pas de conteneur, pas de processus |
| `WATCHDOG_INGEST_TOKEN` dans ce shell | Présent, longueur 64. Valeur non lue | Présence seulement |
| `USERNAME` dans ce shell | Présent, longueur 10. Valeur non lue. Ce n’est pas une preuve de configuration Node-RED | Présence seulement |
| Autres variables de stack | Absentes de ce shell : mot de passe Node-RED, clé de chiffrement, jeton Balena, identifiants de flotte, webhook Teams, image, chemin de registre, `FORCE_COPY_FLOWS` | Présence seulement |

Le fichier `portainer.env` du dépôt contient `FORCE_COPY_FLOWS=true` et des secrets vides. Ce n’est pas la configuration observée d’un service en cours d’exécution. Elle n’a pas été appliquée.

Les 15 fichiers déjà modifiés avant cette qualification n’ont pas été annulés. Ils couvrent l’interface locale et les tests d’isolation du jeton. Ils ne sont pas déployés.

## 4. Tableau des contrôles

| Contrôle | Résultat | Preuve | Statut |
| --- | --- | --- | --- |
| Identité Git et version de `package.json` | Commit `e541d2a`, version de fichier 1.2.3, pas de tag `1.2.3` | Commandes Git | CONFIRMÉ pour le dépôt seulement |
| Services Node-RED, UIbuilder, ingest | Absents localement | Docker vide, ports refusés, aucun processus | CONFIRMÉ : services non joignables |
| URL réellement configurée du siège | Inconnue | Le dépôt ne contient que `<serveur>` | BLOQUÉ |
| Registre SQLite du service | Non accessible | Aucun conteneur, volume non monté | BLOQUÉ |
| Sauvegarde exploitable du volume et du flow siège | Non trouvée | Pas de conteneur, pas d’archive dans le dépôt | BLOQUÉ |
| Journaux en lecture seule | Non accessibles | Pas de service | BLOQUÉ |
| Balena, MQTT, Teams | État réel non observable. Aucune commande envoyée | Variables absentes de ce shell, service arrêté | BLOQUÉ |
| Bundle UIbuilder servi = fichiers 1.2.3 | Impossible à comparer | Aucune réponse HTTP | NON VÉRIFIÉ |
| Routes hash locales dans le dépôt | `overview`, `incidents`, `flows`, `anomalies`, `events`, `fleet`, `admin` présentes dans `hash-router.js` | Lecture du fichier | CONFIRMÉ dans le dépôt, NON VÉRIFIÉ à l’écran |
| `GET /healthz` | Non appelé avec succès : connexion refusée sur `127.0.0.1:8091` | curl HTTP 000 | BLOQUÉ |
| `GET /v1/events` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/events/:id` | Non exécuté. Route existante dans `runtime/server.js` | Code seulement | BLOQUÉ |
| `GET /v1/anomalies` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/anomalies/:id` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/flows` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/flows/:id` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/incidents` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/incidents/:id` | Non exécuté | Service absent | BLOQUÉ |
| `GET /v1/incidents/:id/actions` | Non exécuté. Sous-route GET définie dans `runtime/server.js` | Code seulement | BLOQUÉ |
| `GET /v1/incidents/:id/resolutions` | Non exécuté. Sous-route GET définie dans `runtime/server.js` | Code seulement | BLOQUÉ |
| POST et PATCH | Non appelés | Interdits par la mission | HORS PÉRIMÈTRE |
| Parcours navigateur des 7 écrans | Non ouvert | Aucune URL servie | BLOQUÉ |
| Erreurs JavaScript, filtres, états, compteurs | Non observés dans un navigateur | Service absent | NON TESTÉ |
| Consultations répétées du registre siège | Non faites | Registre du service inaccessible | BLOQUÉ |
| Écritures : note, transition, résolution, configuration | Non faites | Interdites sans autorisation | HORS PÉRIMÈTRE |
| `npm test` | 158 tests, 158 réussites, 0 échec, 0 ignoré, durée TAP 951 ms | Sortie de `npm test` | CONFIRMÉ, dépôt local seulement |

Les routes GET ci-dessus sont celles réellement déclarées dans `runtime/server.js`. Aucune route supplémentaire n’a été appelée.

## 5. Anomalies

| Référence | Priorité | Composant | Résultat attendu | Résultat observé | Preuve | Statut | Action recommandée |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-01 | P1 | Instance siège | Node-RED, UIbuilder et ingest joignables | Aucun conteneur, ports 1880, 1884 et 8091 fermés, aucun processus | `docker ps`, `curl` | CONFIRMÉ | Fournir l’URL du siège ou démarrer la stack sans changer `FORCE_COPY_FLOWS`, hors de cette mission |
| Q-02 | P1 | Version servie | Le bundle servi est identifiable comme 1.2.3 | Version servie non vérifiée. Le tag Git `1.2.3` n’existe pas. Le dépôt local est sale | Git, absence HTTP | NON VÉRIFIÉ | Comparer les fichiers servis sous `/watchdog-hub/` au dépôt, et l’image réellement déployée |
| Q-03 | P1 | API siège | Lectures GET réelles, avec code, durée et forme de réponse | Aucune réponse | curl HTTP 000 | BLOQUÉ | Reprendre la phase C quand le port 8091 répond |
| Q-04 | P1 | Navigateur | Sept écrans parcourus sur l’UI servie | Aucune page ouverte | Service absent | BLOQUÉ | Reprendre la phase D sur l’URL réelle |
| Q-05 | P1 | Persistance | Le registre utilisé par le service est identifié et stable en lecture | Volume siège non monté. Le fichier local du 25 août 2026 n’a pas été ouvert et n’est pas le registre d’un service actif | Métadonnées fichier, Docker vide | BLOQUÉ | Ouvrir en lecture seule le SQLite du volume réellement monté |
| A-01 | P2 | Incident | Un lien vers un événement ou une anomalie ouvre l’écran correspondant | Dans le code local, `openRelated` ignore tout `target_kind` autre que `flow` | `app.js` | CONFIRMÉ dans le code. NON TESTÉ à l’écran | Ne pas déclarer corrigé. Vérifier plus tard sur l’UI servie |
| A-02 | P2 | Listes | Au-delà de 100 lignes, la suite reste accessible | Le pont du flow local demande `limit=100` pour événements, anomalies et incidents | `flows/04_Watchdog_Hub.json`, tests de pont | CONFIRMÉ dans le code. NON TESTÉ sur un registre réel de plus de 100 lignes | Ne pas déclarer corrigé |
| A-03 | P2 | Note d’incident | Le texte reste si le serveur refuse | Le composant vide `noteComment` avant la réponse | `incident-detail.js` | CONFIRMÉ dans le code. NON TESTÉ en conditions réelles. Écriture interdite | Ne pas déclarer corrigé. Procédure isolée avant tout essai |
| A-04 | P2 | Administration | Une erreur Balena n’est pas présentée comme un échec d’enregistrement | La bannière préfixe toute erreur par « Configuration non enregistrée » | `admin-page.js` | CONFIRMÉ dans le code. NON TESTÉ sur le siège | Ne pas déclarer corrigé |
| Q-06 | P2 | Sauvegarde | Une sauvegarde du volume et du flow est exploitable avant qualification | Aucune archive trouvée, volume non accessible | Recherche locale | BLOQUÉ | Produire une sauvegarde en lecture seule avant toute reprise |

Les quatre limites connues ne sont pas corrigées. Leur présence est prouvée dans le dépôt local. Leur effet sur le siège n’a pas été reproduit, faute d’interface servie.

## 6. Tests automatisés

Commande : `npm test`  
Répertoire : `c:\DEV_local\watchdog-hub`  
Référence précédente : 158 tests réussis.

Résultat TAP :

- tests : 158 ;
- suites : 36 ;
- réussites : 158 ;
- échecs : 0 ;
- ignorés : 0 ;
- annulés : 0 ;
- durée TAP : 951,0149 ms.

La sortie se termine par le résumé TAP, puis par l’avis npm de mise à jour. Ces tests créent leurs propres bases temporaires. Ils ne constituent pas une lecture ni une écriture du registre siège.

Comparaison : le nombre et le résultat restent 158 réussites, 0 échec. Le dépôt était déjà modifié avant ce contrôle. `npm test` n’a pas été utilisé pour modifier le produit.

## 7. Non vérifié

- version et fichiers réellement servis par UIbuilder ;
- navigation, filtres, états et erreurs du navigateur ;
- tous les GET d’ingest sur le service siège ;
- authentification effective du service siège ;
- registre SQLite utilisé par le service ;
- stabilité des données après consultations répétées ;
- état Balena, MQTT et Teams ;
- journaux du service ;
- existence d’une sauvegarde de production ;
- les quatre limites UI sur des données réelles.

Raison unique : l’instance siège n’est pas accessible, et son adresse n’est pas dans le dépôt.

## 8. Risques résiduels

- Déployer ou qualifier le dépôt local sale ferait partir une version non identifiée par un tag `1.2.3`.
- `portainer.env` demande `FORCE_COPY_FLOWS=true`. L’appliquer remplacerait le flow du volume. Cette qualification ne l’a pas activé. Il ne faut pas l’activer pour débloquer un contrôle.
- Le jeton d’ingest est présent dans le shell de ce poste. Son usage sur un service exposé n’a pas pu être vérifié. La valeur n’a pas été consignée.
- Le fichier SQLite local du 25 août 2026 peut être pris à tort pour le registre siège. Il n’est relié à aucun service en cours d’exécution.
- Les tests verts peuvent être lus comme une mise en service. Ils ne le sont pas.

## 9. Verdicts

| Niveau | Verdict |
| --- | --- |
| Tests automatisés | GO, limité au dépôt local |
| Cohérence de version | NO GO |
| Interface navigateur | NO GO |
| API et authentification | NO GO |
| Persistance | NO GO |
| Qualification opérationnelle siège | NO GO |
| Mise en service | NO GO |

Verdict global : **NO GO**.

## 10. Plan d’action

1. Obtenir l’URL réelle du siège, ou l’accès au nœud où la stack tourne. Ne pas démarrer une nouvelle stack pendant une qualification en lecture seule si une instance existe ailleurs.
2. Vérifier l’image déployée et comparer les fichiers servis sous `/watchdog-hub/` au dépôt, y compris `hash-router.js` et les composants modifiés non commités.
3. Confirmer qu’une sauvegarde du volume existe avant toute autre action.
4. Exécuter uniquement les GET documentés à la section 4, sans afficher le jeton. Enregistrer code, durée et présence des champs, pas les payloads sensibles.
5. Ouvrir les sept écrans dans le navigateur et relever la console ainsi que les erreurs réseau.
6. Pour une note, une transition, une résolution ou un enregistrement de configuration, utiliser un registre isolé déjà séparé du siège, et seulement après autorisation explicite.

### Procédure d’écriture, non exécutée

Cette procédure n’a pas été lancée. Elle exige une autorisation explicite et un registre qui n’est pas celui du siège.

1. Prouver que le fichier SQLite utilisé n’est pas `/data/watchdog-registry.sqlite` du volume de production.
2. Sauvegarder ce registre d’essai.
3. Créer un incident uniquement par un événement de test sur cet ingest isolé.
4. Ajouter une note, vérifier qu’elle survit à un refus puis à un succès, relire par `GET /v1/incidents/:id/actions`.
5. Enchaîner une transition autorisée, puis une résolution seulement si l’état l’autorise.
6. Ne pas appeler Balena, MQTT ni Teams.
7. Supprimer l’essai seulement si l’autorisation couvre aussi la suppression.

Sans cette autorisation, ces écritures restent hors périmètre.
