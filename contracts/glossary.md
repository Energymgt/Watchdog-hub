# Glossaire Watchdog-Fleet — Lot 0

Ce glossaire est le vocabulaire **verrouillé** du plan problèmes.  
Il ne décrit pas les tables métier (SQL METEO, SQL PLUTO, Influx, ledger CSV, gateway.db).

## Plans

| Plan | Contenu | Propriétaire |
|------|---------|--------------|
| **Données** | Source → Connecteur → Flux → Traitement → Destination | Applications existantes |
| **Problèmes** | Événement → Anomalie → Incident → Action → Résolution | Watchdog-Fleet |

Les deux plans ne se mélangent pas. Watchdog n’est pas une base métier et n’est pas un broker MQTT.

## Entités

### Source
Origine d’une donnée (OGD MeteoSwiss, partage SMB OASSIS, réseau BACnet).  
**N’est pas** le connecteur qui la lit.

### Connector (connecteur)
Composant technique qui récupère les données (API Météo, CSV to SQL, gateway BACnet).  
**N’est pas** le flux. Un connecteur peut alimenter plusieurs flux.

### Flow (flux Watchdog)
Objet **central** de supervision : une chaîne source → destination avec un contrat de santé.  
Identifiant Watchdog (`METEO_01`, `CSV_OASSIS_01`), distinct d’un *flow* Node-RED et des IDs CSV (`src-oassis`, etc.).  
L’état (`ok` / `degraded` / `down` / `unknown`) est **calculé**, jamais saisi.

### Flow Treatment (traitement)
Étape déclarative du flux (fetch, parse, validate, write…).  
Documente la chaîne. N’exécute pas le métier.

### Destination
Cible métier (SQL METEO, SQL PLUTO, MQTT, Influx). Watchdog n’y copie pas les lignes.

### Execution (exécution)
Une course du flux (un cycle d’import, un scan fichier).  
Pont vers les événements. Pas un incident.

### Event (événement)
**Fait technique immuable**, contrat `watchdog.event.v1`.  
Ce n’est pas une anomalie, pas un incident, pas une mesure.

### Health Contract (contrat de santé)
Configuration **déclarative** de ce que signifie « ce flux fonctionne ».  
Source de vérité : `flows.health_contract`.  
Les `supervision_rules` (lots ultérieurs) sont des règles **activées / versionnées**, dérivées de ce contrat, **pas** une seconde copie modifiable indépendamment.

### Supervision Rule (règle)
Projection exécutable d’une clause du contrat (fraîcheur, disponibilité…).  
Produit une anomalie. Ne crée pas l’incident directement.

### Anomaly (anomalie)
Écart à une règle / au contrat de santé.  
Peut se fermer toute seule. N’est pas encore un problème opérationnel confirmé.

### Incident
Problème **corrélé** (plusieurs faits similaires → un incident).  
Cycle : DETECTE → OUVERT → EN_ANALYSE → EN_CORRECTION → EN_VALIDATION → RESOLU → CLOS.  
Moteur **nouveau et distinct** de l’anti-flap Fleet BACnet.

### Incident Link
Lien N événements / N anomalies → 1 incident.

### Incident State History
Une ligne par transition d’état. Obligatoire.

### Action
Intervention humaine ou automatique **enregistrée**. Watchdog n’orchestre pas le redémarrage des connecteurs au prototype.

### Resolution (résolution)
Constat de retour au nominal, avec validation.  
Seule voie vers `RESOLU`, uniquement depuis `EN_VALIDATION`. `CLOS` n’est pas une résolution.

## Ce que Watchdog n’est pas

| Concept existant | Rôle réel |
|------------------|-----------|
| Heartbeat MQTT gateway | Transport d’état **device** Fleet, pas Event v1 |
| `T_METEO_ALERTS` / seuils gel-canicule | Alerte **métier météo**, pas incident de flux |
| Ledger SQLite CSV | Journal de **traitement fichier**, reste dans CSV to SQL |
| `gateway.db` | Buffer / inventaire edge |
| `auth.db` météo | Auth API Météo |
| SQL METEO / PLUTO | Données métier |
| InfluxDB | Séries énergétiques |
| Node-RED flow | Runtime, pas l’objet Flow Watchdog |

## Décisions verrouillées (Lot 0)

1. Watchdog = siège des problèmes.
2. Les données métier restent dans leurs bases.
3. Flow = objet central.
4. Event = fait technique immuable.
5. Anomaly = écart à une règle.
6. Incident = problème corrélé.
7. SQLite siège = registre Watchdog dédié (tables `events`, `anomalies`, `incidents`, `actions`, `resolutions` + liens + historique d’état).
8. Transport prototype = **HTTP interne** `POST /v1/events` (`npm run start:ingest`). MQTT n’est pas le transport du contrat Event v1.
9. Seuils météo 20 min vs 30 min : **non décidés** — Watchdog observe, il ne remplace pas les règles API Météo.
10. « Un fichier OASSIS / heure » : **non décidé** — scan 60 min ≠ obligation métier.
11. Vue Fleet BACnet : **intouchable** pendant le prototype.
12. Corrélation flux : moteur **indépendant** de l’anti-flap device.
13. Big bang interdit.

## Transport prototype (Lot 1)

```text
CSV to SQL ──HTTP──┐
API Météo ───HTTP──┼──→ POST /v1/events  (watchdog.event.v1)
autres ─────HTTP───┘
```

L’ingest écoute `127.0.0.1`.

## Adaptateur CSV (Lot 2)

Le producteur `csv-to-sql` émet `watchdog.event.v1` pour **un seul** flux pilote : `CSV_OASSIS_01` (`src-oassis`).  
Flag `settings.watchdog.enabled` **OFF** par défaut. Fire-and-forget : un échec Watchdog n’échoue pas l’import.  
Un événement par exécution, jamais par ligne. CSV n’ouvre pas `registry.sqlite`.  
Lot 2.1 : un échec d’écriture SQL PLUTO émet `destination_error` ou `timeout`. Pas d’anomalie, pas d’incident, pas de SLA fichier.

## Adaptateur API Météo (Lot 3)

Le producteur `api-meteo` émet `watchdog.event.v1` pour **un seul** flux pilote : `METEO_01` (cycle Import Auto, pas le backfill, pas le daily).  
Flag `WATCHDOG_ENABLED` **OFF** par défaut. Fire-and-forget. Un événement par cycle (10 stations), jamais par mesure.  
Ne remplace pas `T_METEO_ALERTS` (alerte métier gel/canicule). Ne décide pas le seuil de fraîcheur 20/30 min.

## Anomalies (Lot 4)

Les contrats de santé déclaratifs vivent dans `contracts/flows/*.json`.  
Les `supervision_rules` sont une **projection versionnée**, jamais une seconde copie éditable.  
Clause unique du prototype : `kind: event_failure`.  
Une anomalie s’ouvre sur `status=failure` d’un `event_type` de la clause, se ferme sur `status=success` du flux.  
`partial` et `data_missing` ne créent pas d’anomalie. Aucune clause de fraîcheur (20/30 min non décidé). Aucun SLA « un fichier / heure ».

## Incidents (Lot 5)

Un incident naît de **plusieurs faits similaires** (même `correlation_key` = `flow_id|clause_id|error_signature`), pas d’un seul événement.  
Moteur **distinct** de l’anti-flap Fleet (ce n’est pas « 2 polls Balena »). Pas de fenêtre temporelle inventée.  
Cycle : DETECTE → OUVERT → EN_ANALYSE → EN_CORRECTION → EN_VALIDATION → RESOLU → CLOS. Pas de saut.  
DETECTE peut passer à CLOS tout seul si le flux revient au succès. À partir de OUVERT, le cycle est manuel (`PATCH /v1/incidents/:id`).  
Chaque transition écrit une ligne d’historique. Les liens relient N événements / N anomalies → 1 incident.

## Actions (Lot 6)

Une Action est une **intervention enregistrée** (note ou transition manuelle).  
Watchdog n’orchestre pas le redémarrage des connecteurs, ni SSH, ni Docker.  
`POST /v1/incidents/:id/actions` : `{ "actor", "comment" }` pour une note ; `to_state` pour avancer le cycle.  
Un PATCH d’incident enregistre aussi une action `transition`.  
`to_state: RESOLU` est refusé ici : la voie est `POST /v1/incidents/:id/resolutions`.  
Pas d’UI Flux, pas de notification Teams.

## Résolutions (Lot 7)

Une Résolution est le **constat validé** du retour au nominal, pas une clôture administrative.  
Uniquement depuis `EN_VALIDATION`, avec `actor` et `comment` obligatoires.  
C’est la seule voie vers `RESOLU`. `CLOS` reste une clôture manuelle après coup.  
L’état de flux (`unknown` / `ok` / `degraded` / `down`) est une **projection** : pas de saisie, pas de seuil de fraîcheur.  
`GET /v1/flows` et `GET /v1/flows/:id` exposent `status` et `status_reason`. Pas d’UI Flux.

## Hors Lot 7

UI Flux, modification Fleet BACnet, seuils de fraîcheur météo, SLA fichier OASSIS.

## Extension post-Lot 7

La vue opérateur `/watchdog-hub#flows` consomme les contrats Lots 4 à 7 sans modifier leurs règles métier. Elle permet la consultation, les notes, les transitions autorisées, la résolution commentée et la clôture. Node-RED conserve le token ingest et sert de pont UIbuilder.
