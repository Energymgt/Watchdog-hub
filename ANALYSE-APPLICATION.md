# Analyse fonctionnelle — Watchdog Hub

Document de lecture du dépôt, version applicative **1.2.3**.
Il décrit ce que le code fait aujourd’hui : le dashboard opérateur, le moteur d’appareils, le registre des problèmes de flux, et les limites volontairement tenues.

Ce n’est ni un guide de déploiement (voir `README.md`), ni le contrat d’intégration (voir `INTEGRATION.md` et `integration-kit/README.md`), ni le vocabulaire verrouillé (voir `contracts/glossary.md`). En cas d’écart, le code de `runtime/`, de `flows/04_Watchdog_Hub.json` et de `uibuilder/watchdog-hub/src/` fait foi.

---

## 1. Rôle

Watchdog Hub est le **siège de supervision** d’EnergyMGT. Il observe deux familles de faits, avec deux moteurs distincts, et les présente dans une seule interface.

| Famille | Question posée | Transport | Où vit l’état |
| --- | --- | --- | --- |
| Appareils (gateways BACnet et Modbus) | La passerelle est-elle joignable, et son heartbeat est-il récent ? | MQTT retenu + API Balena Cloud | Contexte du flow Node-RED, persisté sur le volume Docker |
| Flux métier (imports, API, worker quotidien) | La chaîne source → destination a-t-elle produit un écart, puis un problème corrélé ? | HTTP `POST /v1/events` | SQLite `watchdog-registry.sqlite` |

L’application **ne stocke pas les données métier**. Elle ne reçoit ni lignes CSV, ni mesures météo, ni statistiques Genève, ni secrets. Un producteur qui n’arrive pas à joindre le Hub doit continuer son travail : l’émission vers Watchdog est conçue comme du fire-and-forget.

Deux phrases résument la frontière :

- Le **plan données** (fichier, API, SQL, MQTT terrain, Influx) reste dans les applications qui produisent ces données.
- Le **plan problèmes** (événement, anomalie, incident, action, résolution) appartient à Watchdog Hub.

---

## 2. Ce que l’application n’est pas

| Objet existant ailleurs | Rôle réel | Rapport avec Watchdog |
| --- | --- | --- |
| Heartbeat MQTT `bacnet/gateway/{uuid}/heartbeat` | État technique d’un device | Consommé par le moteur Fleet. Ce n’est pas un événement `watchdog.event.v1`. |
| Tables SQL METEO, PLUTO, `dbo.Geneve_Meteo_STAT` | Données métier | Watchdog n’y écrit pas et n’en reçoit pas les lignes. |
| `T_METEO_ALERTS` (gel, canicule) | Alerte métier météo | Indépendante des incidents de flux. |
| Ledger SQLite de CSV to SQL | Journal de traitement fichier | Reste dans CSV to SQL. |
| `gateway.db` | Buffer et inventaire edge | Reste sur la gateway. |
| Flow Node-RED | Runtime du siège | Distinct de l’objet « flux Watchdog » (`METEO_01`, etc.). |
| Broker MQTT | Transport des heartbeats device | Pas le transport du contrat événement. |

Watchdog n’orchestre rien : pas de redémarrage de connecteur, pas de SSH, pas de Docker, pas de relance du worker météo, pas d’écriture SQL.

---

## 3. Déploiement et processus

Un seul conteneur, image `ghcr.io/energymgt/watchdog-hub`, base Node-RED **5.0.4**.

`start.sh` fait trois choses au démarrage :

1. Il copie les réglages Node-RED dans `/data`. Le flow persisté (`/data/flows.json`) est conservé s’il existe déjà. Il n’est remplacé que sur volume neuf, ou si `FORCE_COPY_FLOWS=true`.
2. Il recopie les sources UIbuilder de l’image vers `/data/uibuilder/watchdog-hub/src` (l’interface est donc celle de l’image, pas un build frontend séparé).
3. Il lance **deux processus** :
   - `node runtime/server.js` : serveur HTTP d’ingest (port conteneur **8091**) ;
   - Node-RED (port conteneur **1880**, publié en **1884** sur l’hôte).

Ports utiles :

| Port hôte | Service | Usage |
| --- | --- | --- |
| 1884 | Éditeur Node-RED | Protégé par `USERNAME` / `PASSWORD` |
| 1884 `/watchdog-hub` | Dashboard opérateur | UIbuilder, lecture et actions opérateur |
| 8091 | Ingest HTTP | Producteurs CSV, météo, DJU, et le pont interne de l’UI |

Le healthcheck Swarm exige à la fois l’éditeur (200 ou 401), la page UI, et `GET /healthz` de l’ingest (200, sans token).

État durable sur le volume `watchdog_hub_data` :

- flow Node-RED et contexte filesystem (heartbeats, config admin, appareils pré-déclarés) ;
- `/data/watchdog-registry.sqlite` (registre des problèmes) ;
- journal `/data/watchdog-ingest.log`.

---

## 4. Interface opérateur

L’UI est une application **Vue 3** servie par UIbuilder, sans bundler. La navigation est un routeur par hash.

| Hash | Vue | Ce que l’opérateur y fait |
| --- | --- | --- |
| *(vide)* | Vue d’ensemble | Santé combinée des flux et des appareils, éléments qui demandent attention, activité récente |
| `#flows` | Flux | Contrats déclarés, état calculé, détail d’un flux |
| `#fleet` | Appareils | Inventaire Balena + heartbeats, filtres, fiche appareil |
| `#incidents` et `#incidents/{id}` | Incidents | Liste, détail, note, transition, résolution, clôture |
| `#anomalies` | Anomalies | Journal des écarts ouverts et fermés |
| `#events` | Événements | Journal des faits techniques immuables |
| `#admin` | Paramètres | Config flotte, pré-déclaration d’appareils, test Teams |

Une palette de recherche (Ctrl+K) interroge incidents, flux, anomalies, événements et appareils déjà chargés dans le navigateur.

Le navigateur **ne parle pas directement** au port 8091. Il envoie des actions UIbuilder à Node-RED. Node-RED appelle l’ingest en local (`http://127.0.0.1:8091`) et y ajoute `X-Watchdog-Token` s’il est défini. Le secret n’est pas renvoyé au navigateur.

Compteurs de la navigation : flux non `ok`, appareils non `ok`, incidents encore actifs (hors `RESOLU` et `CLOS`), anomalies ouvertes, nombre d’événements reçus dans le snapshot.

### Vue d’ensemble

Elle mélange les deux plans sans les confondre :

- un flux `down` compte comme indisponible, un flux `degraded` comme avertissement ;
- un appareil `dead` compte comme hors service ; `heartbeat_missing`, `cloud_down` et `unknown_online` comme avertissement ;
- un incident déjà actif n’est pas recompté en plus de l’état du flux qui le porte ;
- la liste « attention » montre les incidents actifs, puis les flux dégradés ou indisponibles qui n’ont pas d’incident actif, puis les appareils en défaut ;
- la chronologie récente fusionne événements, ouvertures et fermetures d’incidents et d’anomalies, et transitions d’appareils.

Si un des deux snapshots (flux ou flotte) manque, la vue le dit explicitement au lieu d’afficher un zéro silencieux.

---

## 5. Plan appareils — moteur Fleet

Implémenté dans `flows/04_Watchdog_Hub.json`. Node-RED est ici le moteur, pas seulement l’hôte de l’UI.

### Entrées

1. **Poll Balena**, toutes les 2 minutes (`Tick 2 min`).
   `BALENA_APP_IDS` accepte plusieurs identifiants numériques, slugs ou UUID, séparés par une virgule ou un retour à la ligne. `BALENA_APP_ID` sert de repli pour une seule flotte.
   Les devices sont fusionnés et dédupliqués par UUID. Si une flotte échoue, les autres restent à jour et le dernier inventaire connu de la flotte en échec est conservé. L’erreur partielle reste visible.
2. **Heartbeats MQTT** sur `bacnet/gateway/{uuid}/heartbeat`, QoS 1, retain. Le préfixe `bacnet/` est historique : les gateways Modbus l’utilisent aussi.
3. **Actions UI** : snapshot, rafraîchissement forcé, enregistrement admin, enrôlement, test Teams.

Un rafraîchissement manuel est ignoré s’il tombe moins de 15 secondes après le précédent.

### Enregistrement d’un heartbeat

Le nœud `Record heartbeat` retient le dernier message par UUID : horodatage, santé, MQTT, buffer, snapshot, supervisor. Un `ts` est accepté s’il est positif et pas plus de 5 minutes dans le futur ; sinon l’heure de réception est utilisée.

Les heartbeats plus vieux que `heartbeatTtlDays` (défaut 30, variable `FLEET_HEARTBEAT_TTL_DAYS`, borne 1–365 dans l’admin) sont retirés de la mémoire du flow au moment d’un nouvel enregistrement.

### État calculé d’un appareil

À chaque poll, et aussi après un heartbeat (`topic` `heartbeat_evaluate`), le nœud `Evaluate fleet watchdog` classe chaque UUID.

Pendant la **grâce de démarrage** de la flotte (même durée que la grâce heartbeat, défaut 5 minutes après le premier passage), tout appareil évalué est forcé à `ok` avec le détail « boot grace flotte ». Cela évite une rafale d’alertes au boot du siège.

Ensuite, pour un appareil vu dans Balena :

| Balena | Heartbeat récent (âge ≤ grâce, défaut 5 min) | État | Sens |
| --- | --- | --- | --- |
| en ligne | oui | `ok` | Opérationnel |
| hors ligne | oui | `cloud_down` | Cloud indisponible, collecte locale encore possible |
| en ligne | non | `heartbeat_missing` | Heartbeat absent |
| hors ligne | non | `dead` | Hors service |

Un UUID présent seulement dans les heartbeats (absent du poll Balena) :

| Heartbeat récent | État |
| --- | --- |
| oui | `unknown_online` — heartbeat OK mais absent de l’API Balena |
| non | `dead` |

Un UUID **pré-déclaré** dans l’admin, sans Balena et sans heartbeat, reste `unknown` : « En attente du premier heartbeat MQTT ». Cet état n’entre pas dans le compteur d’alertes Teams.

### Anti-flap Teams

Le dashboard voit l’état observé tout de suite. La carte Teams ne part qu’après confirmation.

- Seuls les **polls Balena** comptent. Un simple heartbeat met à jour l’affichage mais n’incrémente pas le compteur.
- Il faut `confirmsRequired` polls consécutifs sur le **même** nouvel état (défaut **2**, borne 1–5).
- Un appareil vu pour la première fois ne peut pas alerter pendant `firstSeenGraceMinutes` (défaut 5, borne 1–60). Il reste visible.
- Au seuil, une seule transition est enregistrée (`fleetTransitionHistory`, 500 entrées max) et une carte Adaptive Card part :
  - `[CRITIQUE]` si la pire transition est `critical` (`dead`) ;
  - `[ALERTE]` pour `high` ou `warning` ;
  - `[RECOVERY]` quand l’état confirmé revient à `ok`.
- Le retour au nominal attend le même nombre de polls. Une oscillation d’un seul poll ne crée pas de carte.

Réponses Teams : HTTP 2xx efface l’erreur. 429, 5xx, code 0 ou erreur réseau sont retentés deux fois, à 2 secondes d’intervalle. Un 4xx autre que 429 est affiché comme erreur Teams dans le dashboard, sans retry.

### Projection Modbus

Après l’évaluation, `Projeter santé Modbus` peut **écraser** l’état affiché : si le heartbeat porte `health.modbus.ok === false` et que la flotte n’est plus en grâce de boot, l’appareil passe à `dead` avec le message d’erreur Modbus tronqué à 240 caractères. Cette projection modifie l’état vu par le dashboard. Elle ne passe pas elle-même par le compteur anti-flap.

### Indicateurs de fiche

Pour chaque appareil, le snapshot expose aussi, à part de l’état global :

- BACnet / santé (`health.ok`) ;
- MQTT (`mqtt.ok`) ;
- buffer store-and-forward (`buffer.state`) ;
- services supervisor Balena malsains (`supervisor.unhealthy`).

La fiche montre l’âge du heartbeat, les transitions récentes de cet UUID, et une confirmation en cours (`count` / `required`) tant que l’anti-flap n’a pas basculé.

### Paramètres

L’admin persiste `fleetAdminConfig` et `fleetEnrolledDevices` dans le contexte flow. Les secrets saisis dans l’UI priment sur les variables d’environnement. Le snapshot ne renvoie jamais le secret en clair : jeton Balena masqué `••••` + 4 derniers caractères, webhook Teams réduit à son hôte.

Champs utiles :

| Réglage | Défaut | Effet |
| --- | --- | --- |
| `offlineGraceMinutes` | 5 | Heartbeat considéré périmé au-delà |
| `firstSeenGraceMinutes` | 5 | Pas d’alerte Teams sur un appareil tout juste apparu |
| `confirmsRequired` | 2 | Polls consécutifs avant carte Teams |
| `heartbeatTtlDays` | 30 | Oubli des heartbeats trop anciens |
| `pollIntervalMs` | 120000 | Affiché comme intervalle ; le tick du flow reste le rythme réel |
| Broker / topic MQTT dans l’admin | `iot.energymgt.io:1883`, topic historique | Texte d’onboarding copiable. L’abonnement réel reste le nœud MQTT du flow. |

Actions UI correspondantes : `fleet_snapshot_get`, `fleet_refresh_request`, `fleet_admin_save`, `fleet_device_enroll`, `fleet_device_unenroll`, `fleet_teams_test`.

---

## 6. Plan problèmes — registre des flux

Chaîne, dans cet ordre, et seulement pour un événement **nouveau** :

```text
POST /v1/events
    → validation watchdog.event.v1
    → insert SQLite (immuable)
    → anomalies (écart au contrat de santé)
    → incidents (corrélation de faits similaires)
```

Un échec du calcul d’anomalie ou d’incident **ne rejette pas** l’événement. L’événement reste la source de vérité. Un doublon strict du même `event_id` et du même corps répond 200 sans recalculer. Le même `event_id` avec un corps différent répond 409.

### 6.1 Événement

Contrat `contracts/watchdog.event.v1.schema.json`, validé par `contracts/validate-event-v1.js`.

Un événement est un **fait technique immuable** : une exécution ou un cycle, jamais une ligne ou une mesure.

Champs obligatoires : `schema` (`watchdog.event.v1`), `event_id` (UUID v4 ou ULID), `flow_id`, `event_type`, `status`, `timestamp` UTC avec `Z`, `source_id`, `connector_id`, `destination_id`.

| `event_type` | Sens |
| --- | --- |
| `execution_started` | Début de course. `execution_id` obligatoire. |
| `execution_completed` | Fin nominale. `execution_id` obligatoire. |
| `execution_failed` | Échec de course. `execution_id` obligatoire. |
| `data_received` | Données reçues. |
| `data_missing` | Données manquantes. |
| `connector_error` | Panne du connecteur. |
| `timeout` | Délai dépassé. |
| `validation_failed` | Validation refusée. |
| `destination_error` | Échec d’écriture destination. |

`status` : `success`, `failure`, `partial`, `info`.
`failure` exige `error_signature` (stable : pas d’UUID de run, pas d’horodatage).
`records` est un entier de volume, jamais un tableau.
`metadata` est un objet borné à 4 Ko.
`producer` autorisé : `csv-to-sql`, `api-meteo`, `bacnet-gateway`, `watchdog-internal`, `dju-daily`.
`ingested_at` est interdit dans le corps producteur : le Hub le pose à l’insert.
Toute propriété hors schéma est refusée.

Identifiants `flow_id`, `source_id`, `connector_id`, `destination_id` : majuscules, chiffres, underscore, 2 à 64 caractères, première lettre.

### 6.2 Contrat de santé et règles

Les fichiers `contracts/flows/*.json` sont la source déclarative. Au démarrage de l’ingest, `runtime/health-contracts.js` en dérive des `supervision_rules`. Ces règles ne sont pas une seconde copie éditable : elles sont recalculées depuis les clauses.

Seule forme de clause implémentée : `kind: event_failure`.

Ouverture d’anomalie si :

- la règle est activée pour ce `flow_id` ;
- `event_type` est dans `event_types` ;
- `status` est dans `open_statuses`.

Sans `open_statuses`, le défaut est `failure` seul. `success` n’ouvre jamais. `partial` et `info` n’ouvrent que s’ils sont déclarés.

Fermeture : `status=success` et `event_type` dans `success_types` de la **même** clause. Toutes les anomalies ouvertes de cette clause sont fermées. Il n’y a pas de règle de fraîcheur temporelle, ni de SLA « un fichier par heure ».

### 6.3 Anomalie

Écart à une clause. Elle peut se rouvrir et se refermer toute seule. Ce n’est pas encore un incident.

Clé d’identité d’une anomalie ouverte : `flow_id` + `clause_id` + `error_signature`.

- Premier fait conforme : insert, `occurrence_count = 1`, `status = open`.
- Fait suivant de même signature : `occurrence_count` incrémenté, `last_event_id` mis à jour. Pas de nouvelle ligne.
- Succès de la clause : `status = closed`, `closed_at` posé.

`correlation_key` interne : `flow_id|clause_id|error_signature`.
Si la clause déclare `error_signature`, cette valeur fixe remplace celle de l’événement (cas `source_data_incomplete`).

### 6.4 Incident

Problème **corrélé**. Le moteur est indépendant de l’anti-flap Balena. Il n’y a pas de fenêtre de temps inventée.

Règle d’ouverture : le **deuxième** fait similaire (`occurrence_count >= 2`) sur la même `correlation_key`, alors qu’aucun incident non `CLOS` n’existe déjà pour cette clé. L’incident naît à l’état `DETECTE`. Il est lié à l’anomalie et aux événements concernés.

Règle de fermeture automatique : si l’anomalie se ferme et que l’incident est encore `DETECTE`, il passe à `CLOS` avec la raison `flow_recovered` et l’acteur `watchdog-internal`. Dès que l’incident a été pris en charge (`OUVERT` et au-delà), le succès du flux ne le clôt plus.

Cycle, sans saut :

```text
DETECTE → OUVERT → EN_ANALYSE → EN_CORRECTION → EN_VALIDATION → RESOLU → CLOS
DETECTE → CLOS          (automatique si le flux revient au succès)
```

| Transition | Qui |
| --- | --- |
| `DETECTE` → `OUVERT` | Opérateur |
| `OUVERT` → `EN_ANALYSE` → `EN_CORRECTION` → `EN_VALIDATION` | Opérateur, une étape à la fois |
| `EN_VALIDATION` → `RESOLU` | Uniquement par une **résolution** commentée |
| `RESOLU` → `CLOS` | Opérateur, clôture administrative, pas une résolution |
| `DETECTE` → `CLOS` | Moteur, retour au succès |

Chaque transition écrit une ligne dans `incident_state_history` (acteur, raison, horodatage). Les liens `incident_links` relient N événements et N anomalies à un incident. Un lien déjà présent n’est pas dupliqué.

### 6.5 Action

Intervention **enregistrée**, pas exécutée.

`POST /v1/incidents/:id/actions` :

- note : `actor` + `comment` obligatoires ;
- transition : `actor` + `to_state` autorisé par le graphe ; `comment` optionnel, 2000 caractères max ;
- `to_state: RESOLU` est refusé (`resolution_required`).

`PATCH /v1/incidents/:id` avec `to_state` est le même chemin : il enregistre une action `transition`. L’acteur par défaut du PATCH, s’il est omis, est `operator`.

### 6.6 Résolution

Constat validé du retour au nominal.

`POST /v1/incidents/:id/resolutions` n’est accepté que depuis `EN_VALIDATION`, avec `actor` et `comment` obligatoires. Elle :

1. passe l’incident à `RESOLU` ;
2. enregistre une action `transition` vers `RESOLU` ;
3. insère une ligne `resolutions`.

`CLOS` n’est pas produit par cet appel.

### 6.7 État de flux calculé

Jamais saisi. `runtime/flow-status.js` le projette à la lecture de `GET /v1/flows`.

| Condition | `status` | `status_reason` |
| --- | --- | --- |
| Aucun événement pour ce `flow_id` | `unknown` | `no_events` |
| Incident actif en `OUVERT`, `EN_ANALYSE`, `EN_CORRECTION` ou `EN_VALIDATION` | `down` | `incident_confirmed` |
| Incident `DETECTE` encore ouvert | `degraded` | `incident_detecte` |
| Anomalie ouverte, sans incident actif confirmé | `degraded` | `anomaly_open` |
| Sinon, au moins un événement | `ok` | `nominal` |

`RESOLU` et `CLOS` ne maintiennent pas le flux en `down`. Une anomalie encore ouverte, elle, le laisse `degraded`.

Il n’y a pas de seuil « données trop vieilles ». L’absence de nouvel événement ne dégrade pas le flux à elle seule.

---

## 7. Flux déclarés aujourd’hui

Trois contrats vivent dans `contracts/flows/`. Les producteurs correspondants ont leur drapeau d’émission **désactivé par défaut**. Le Hub est prêt à les recevoir ; l’émission ne part que si le projet producteur l’active explicitement.

### `CSV_OASSIS_01` — CSV OASSIS vers SQL PLUTO

| | |
| --- | --- |
| Producteur | `csv-to-sql` |
| Source | `SRC_SMB_OASSIS` |
| Connecteur | `CONN_CSV_TO_SQL` |
| Destination | `DST_SQL_PLUTO` |
| Clause | `availability` |
| Ouvre sur | `validation_failed`, `destination_error`, `timeout`, `execution_failed`, `connector_error` en `failure` |
| Ferme sur | `execution_completed` ou `data_received` en `success` |

`data_missing` n’ouvre rien. Aucun SLA « un fichier par heure ». Un événement par exécution, jamais par ligne. Un échec d’envoi Watchdog n’échoue pas l’import. Les échecs d’écriture SQL PLUTO sont des `destination_error` ou `timeout`, pas une supervision métier du contenu.

### `METEO_01` — Import Auto MeteoSwiss OGD

| | |
| --- | --- |
| Producteur | `api-meteo` |
| Source | `SRC_METEOSWISS_OGD` |
| Connecteur | `CONN_API_METEO` |
| Destination | `DST_SQL_METEO` |
| Clause | `availability` |
| Ouvre sur | `connector_error`, `timeout`, `destination_error`, `execution_failed`, `validation_failed` en `failure` |
| Ferme sur | `data_received` ou `execution_completed` en `success` |

Un événement par cycle Import Auto (les 10 stations), jamais par mesure. Le backfill et le daily ne sont pas ce flux. Le seuil de fraîcheur 20 min contre 30 min n’est pas décidé ici et n’est pas évalué. `T_METEO_ALERTS` continue de vivre de son côté.

### `METEO_STAT_DAILY` — statistiques quotidiennes Genève

| | |
| --- | --- |
| Producteur | `dju-daily` (projet `dju-autonome`) |
| Source | `SRC_SQLSERVER_METEO` |
| Connecteur | `CONN_DJU_DAILY` |
| Destination | `DST_SQL_GENEVE_METEO_STAT` |

Deux clauses, distinctes :

| Clause | Ouvre sur | Signature | Ferme sur |
| --- | --- | --- | --- |
| `availability` | `connector_error`, `destination_error`, `execution_failed`, `validation_failed` en `failure` | signature de l’événement | `execution_completed` / `success` |
| `source_completeness` | `data_missing` en `partial` | `source_data_incomplete`, fixe | `execution_completed` / `success` |

`data_missing` est un écart de données, pas une panne réécrite en `execution_failed`. Les répétitions du même écart incrémentent la même anomalie. Le payload ne liste pas les journées : `business_date` seulement si une seule journée du passage est incomplète, `incomplete_days` est un compte. Watchdog ne reconstitue pas les jours absents.

Le succès n’est émis par le worker que lorsque toutes les journées closes du passage sont confirmées (écriture relue ou valeurs déjà présentes). Une panne technique ne ferme pas l’anomalie de données. Une période encore ouverte côté métier (`period-open`) ne concerne pas cette clause. Pas d’heure obligatoire.

Le deuxième fait similaire peut ouvrir un incident `DETECTE`, que le succès du flux referme automatiquement tant qu’il n’a pas été pris en main.

---

## 8. API HTTP d’ingest

Serveur `runtime/server.js`. Corps JSON limité. `Content-Type: application/json` exigé pour les écritures.

Authentification de tout `/v1/*` dès que `WATCHDOG_INGEST_TOKEN` est non vide : header `X-Watchdog-Token` ou `Authorization: Bearer`. Comparaison indépendante du temps. `GET /healthz` reste ouvert (healthcheck).

| Méthode | Chemin | Effet |
| --- | --- | --- |
| GET | `/healthz` | Santé du registre |
| POST | `/v1/events` | Ingère un événement. 201 créé, 200 doublon, 400 invalide, 409 conflit d’`event_id` |
| GET | `/v1/events?limit=` | Derniers événements, plafond 100 |
| GET | `/v1/events/:id` | Un événement et son payload |
| GET | `/v1/anomalies?status=&limit=` | Anomalies, filtre `open` ou `closed` |
| GET | `/v1/anomalies/:id` | Une anomalie |
| GET | `/v1/flows` | Contrats décorés de `status` / `status_reason`, plus les règles dérivées |
| GET | `/v1/flows/:id` | Un flux décoré |
| GET | `/v1/incidents?state=&limit=` | Incidents, filtre sur un état du cycle |
| GET | `/v1/incidents/:id` | Incident, transitions autorisées, liens, historique, actions, résolutions |
| GET | `/v1/incidents/:id/actions` | Actions seules |
| GET | `/v1/incidents/:id/resolutions` | Résolutions seules |
| POST | `/v1/incidents/:id/actions` | Note ou transition. 201 |
| PATCH | `/v1/incidents/:id` | Transition. 200, ou 409 si interdite |
| POST | `/v1/incidents/:id/resolutions` | Résolution depuis `EN_VALIDATION`. 201 |

Erreurs stables : `unauthorized`, `invalid_json`, `invalid_limit`, `invalid_status`, `invalid_state`, `unsupported_media_type`, `payload_too_large`, `validation_failed`, `event_id_conflict`, `not_found`, `actor_required`, `comment_required`, `comment_too_long`, `invalid_transition`, `resolution_required`, `not_en_validation`, `registry_unavailable`.

Le pont UIbuilder traduit ces codes en messages français (`flows_error`, `anomalies_error`, `events_error`) sans recopier le token.

Actions UIbuilder du plan flux :

| Action | Appel |
| --- | --- |
| `flows_snapshot_get` / `flows_refresh_request` | `GET /v1/flows` puis `GET /v1/incidents?limit=100` |
| `flows_incident_get` | `GET /v1/incidents/:id` |
| `flows_incident_action` | `POST .../actions` |
| `flows_incident_patch` | `PATCH /v1/incidents/:id` |
| `flows_incident_resolve` | `POST .../resolutions` |
| `anomalies_snapshot_get` / `anomalies_get` | liste ou détail |
| `events_snapshot_get` / `events_get` | liste ou détail |

Après une mutation d’incident réussie, Node-RED recharge le snapshot. Si la modale est ouverte, le client redemande le détail.

---

## 9. Schéma SQLite

Fichier `runtime/schema.sql`, ouvert par `node:sqlite` en mode WAL. Version de schéma suivie jusqu’à 5 dans `schema_migrations`. Aucune table métier.

| Table | Contenu |
| --- | --- |
| `events` | Fait immuable + `payload_json` + `ingested_at` |
| `anomalies` | Écart ouvert ou fermé, compteur d’occurrences |
| `incidents` | Problème corrélé et son état courant |
| `incident_links` | Lien vers un `event` ou une `anomaly` |
| `incident_state_history` | Une ligne par transition |
| `actions` | Note ou transition, acteur, commentaire |
| `resolutions` | Constat validé vers `RESOLU` |

Les identifiants d’anomalie, d’incident, d’historique, d’action et de résolution sont des UUID v4 dérivés d’un hash du contenu seedé (`uuidV4FromSeed`). Rejouer le même fait produit donc le même identifiant dérivé, ce qui évite les doublons de liens.

---

## 10. Parcours concrets

### Appareil qui tombe

1. La gateway cesse d’émettre, ou Balena la voit hors ligne.
2. Au poll suivant, l’état observé change (`heartbeat_missing` ou `dead`). Le dashboard le montre, avec une confirmation en cours `1/2`.
3. Le poll d’après confirme. Une seule carte Teams part. L’historique de transition enregistre `from` / `to`.
4. Au retour, deux polls `ok` sont nécessaires avant `[RECOVERY]`.

Un appareil pré-déclaré sans heartbeat reste `unknown` et silencieux. Un appareil neuf a 5 minutes de grâce avant toute alerte.

### Import CSV qui échoue deux fois puis réussit

1. Premier `destination_error` / `failure` : événement stocké, anomalie `availability` ouverte, compteur 1. Pas d’incident.
2. Deuxième échec de même signature : compteur 2, incident `DETECTE`. Le flux passe `degraded` (`incident_detecte`).
3. Si personne ne prend l’incident et qu’un `execution_completed` / `success` arrive : l’anomalie se ferme, l’incident `DETECTE` passe `CLOS`, le flux revient `ok`.
4. Si un opérateur a déjà passé l’incident à `OUVERT`, le succès ferme l’anomalie mais **laisse** l’incident dans le cycle manuel. Le flux redevient `ok` seulement quand il n’y a plus ni incident confirmé ni anomalie ouverte. Un incident `OUVERT` maintient le flux `down` jusqu’à `RESOLU` ou `CLOS`.

### Données Genève incomplètes

1. `data_missing` / `partial` ouvre l’anomalie `source_completeness`, signature fixe `source_data_incomplete`. La clause `availability` ne bouge pas.
2. Le même écart le lendemain incrémente la même anomalie. Au deuxième fait, un incident `DETECTE` peut naître.
3. `execution_completed` / `success`, émis seulement quand toutes les journées closes du passage sont confirmées, ferme les deux clauses. L’incident encore `DETECTE` se clôt. Une panne `destination_error` ne ferme pas l’anomalie de données.

### Prise en charge opérateur

1. L’opérateur ouvre `#incidents/{id}`.
2. Il saisit son nom et passe `DETECTE` → `OUVERT`, puis avance étape par étape.
3. En `EN_VALIDATION`, il enregistre une résolution commentée : seul chemin vers `RESOLU`.
4. Il clôt ensuite en `CLOS` si la clôture administrative est voulue.
5. Une note peut être ajoutée à n’importe quel moment, sans changer l’état.

---

## 11. Sécurité et isolement

- L’éditeur Node-RED est authentifié. Les pages UIbuilder ne le sont pas forcément : le port 1884 doit rester sur le réseau siège ou derrière le proxy d’entreprise.
- Le port 8091 sans token accepte toute écriture `/v1/*`. En production le token est obligatoire avant toute exposition, et l’interface publiée doit rester restreinte.
- Les secrets Balena et Teams configurés dans l’UI sont masqués dans le snapshot.
- Le validateur refuse les propriétés inconnues et borne `metadata`, pour empêcher qu’un producteur glisse des lignes métier ou un secret dans l’événement.
- L’ingest et le calcul d’incident sont dans le conteneur. Les producteurs externes ne voient que `POST /v1/events`.

---

## 12. Kit d’intégration

`integration-kit/` (version de kit `1.0.0`) est le point d’entrée d’un nouveau producteur. Deux canaux indépendants :

- MQTT pour l’état périodique d’une gateway (template Node-RED BACnet ou Modbus, période recommandée 60 s, UUID Balena du device, pas d’UUID en dur) ;
- HTTP pour un fait de batch ou d’API (`POST /v1/events`, timeout court, un événement par exécution).

Avant activation : `npm test` dans ce dépôt, recette heartbeat (arrêt → `heartbeat_missing`, redémarrage → même UUID), recette HTTP (événement accepté, renvoi du même `event_id` sans doublon, coupure du Hub sans impact métier).

Une rupture de contrat demande une nouvelle version majeure du kit, liée à un tag immuable du dépôt.

---

## 13. Carte du code

| Zone | Rôle |
| --- | --- |
| `flows/04_Watchdog_Hub.json` | Moteur Fleet, ponts UI, Teams, MQTT, poll Balena |
| `runtime/server.js` | API HTTP |
| `runtime/ingest.js` | Validation, insert, enchaînement anomalie puis incident |
| `runtime/registry.js` + `schema.sql` | SQLite |
| `runtime/health-contracts.js` | Lecture des contrats et projection des règles |
| `runtime/anomalies.js` | Ouverture, incrément, fermeture |
| `runtime/incidents.js` | Corrélation et graphe d’états |
| `runtime/actions.js` | Notes et transitions |
| `runtime/resolutions.js` | Passage à `RESOLU` |
| `runtime/flow-status.js` | `ok` / `degraded` / `down` / `unknown` |
| `contracts/` | Schémas, fixtures valides et invalides, trois flux |
| `uibuilder/watchdog-hub/src/` | Dashboard Vue |
| `tests/watchdog.*.v1.test.js` | Contrats, runtime, UI et multi-flotte. Lancés par `npm test` |
| `Dockerfile`, `docker-compose.yml`, `start.sh`, `publish.ps1` | Image GHCR et stack Portainer |

L’UI est organisée en pages (`overview`, `flows`, `fleet`, `incidents`, `anomalies`, `events`, `admin`), stores, clients UIbuilder, et petits composants de présentation (badges, modales, filtres, pagination). L’état métier des flux n’est pas détenu par les composants : il vient des snapshots renvoyés par Node-RED.

---

## 14. Décisions tenues, et ce qui reste ouvert

Tenu par le code :

1. Watchdog est le siège des problèmes, pas une base métier.
2. Le flux Watchdog (`flow_id`) est l’objet central du plan problèmes.
3. L’événement est immuable. L’anomalie est un écart. L’incident est une corrélation.
4. Le transport des événements est HTTP. MQTT reste le transport des heartbeats device.
5. La corrélation de flux n’est pas l’anti-flap des appareils.
6. L’état de flux et l’état d’appareil sont calculés, jamais saisis.
7. `RESOLU` n’est accessible que par une résolution commentée depuis `EN_VALIDATION`.
8. Une indisponibilité du Hub ne doit pas casser le producteur.

Ouvert, et donc **non implémenté** :

- seuil de fraîcheur météo (20 min contre 30 min) ;
- obligation « un fichier OASSIS par heure » ;
- toute clause de santé autre que `event_failure` ;
- orchestration (redémarrage, correctif automatique) ;
- notification Teams sur les incidents de flux (Teams ne couvre aujourd’hui que les transitions d’appareils confirmées).

Le glossaire `contracts/glossary.md` décrit encore, dans sa section « Hors Lot 7 », une époque sans UI Flux. L’UI `#flows`, `#incidents`, `#anomalies` et `#events` existe désormais et consomme ces contrats sans en changer les règles.
