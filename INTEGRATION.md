# Contrat d'intégration - Gateway vers Watchdog Hub

Ce document décrit le lien entre la gateway edge et le dashboard fleet siège.
Pour tout nouveau développement BACnet, Modbus ou HTTP, utiliser le kit
versionné [`integration-kit/`](integration-kit/README.md). Il contient les
templates Node-RED, exemples, variables et tests de recette.

## Principe

- Chaque gateway publie périodiquement son état sur MQTT.
- Le watchdog fleet consomme ces heartbeats et les croise avec l'API Balena Cloud.
- Aucune communication HTTP directe entre les deux stacks.

## Topic MQTT

```
bacnet/gateway/{device_uuid}/heartbeat
```

- `{device_uuid}` : UUID Balena du device (`BALENA_DEVICE_UUID` ou équivalent supervisor).
- QoS : 1 (obligatoire pour les nouvelles intégrations).
- Retain : `true` (le fleet lit le dernier état connu au démarrage).

Le préfixe `bacnet/gateway/` est conservé pour les gateways Modbus afin de
rester compatible avec l'abonnement actuel du flow 04.

## Payload heartbeat (gateway → fleet)

Structure émise par le flow `03_Watchdog.json` :

```json
{
  "schema": "watchdog.heartbeat.v1",
  "ts": 1710000000000,
  "device": {
    "uuid": "abc123...",
    "name": "Gateway Site A",
    "protocol": "bacnet"
  },
  "health": { "ok": true },
  "mqtt": { "ok": true, "connected": true },
  "buffer": { "state": "ok", "pending": 0 },
  "snapshot": { "devices_count": 12 },
  "supervisor": { "unhealthy": [] }
}
```

| Champ | Description |
|-------|-------------|
| `ts` | Timestamp gateway (ms) — utilisé pour détecter heartbeat stale |
| `health` | Santé globale bacnet-service |
| `mqtt` | État connexion broker |
| `buffer` | État store-and-forward (flow 02) |
| `snapshot` | Compteurs devices/objects |
| `supervisor` | Services Balena défaillants |

Le contrat formel est
[`contracts/watchdog.heartbeat.v1.schema.json`](contracts/watchdog.heartbeat.v1.schema.json).
Le champ `schema` est recommandé pour les nouveaux producteurs mais reste
optionnel afin d'accepter les gateways historiques.

Pour BACnet, `device.protocol` vaut `bacnet`. Pour Modbus,
`device.protocol` et `health.protocol` valent `modbus`, et `health.modbus`
décrit au minimum l'état des lectures terrain. L'UUID du topic et
`device.uuid` doivent être identiques.

## États fleet (flow 04)

| État | Signification |
|------|---------------|
| `ok` | Device en ligne Balena + heartbeat récent |
| `cloud_down` | Balena signale offline |
| `heartbeat_missing` | En ligne Balena mais heartbeat absent ou trop ancien |
| `dead` | Défaut confirmé (N polls consécutifs, défaut 2) |
| `unknown` | Appareil pré-enregistré, en attente du premier heartbeat (pas d’alerte Teams) |
| `unknown_online` | Heartbeat OK mais appareil absent de l’API Balena |

La grâce heartbeat, la grâce nouvel appareil, N (polls anti-flap) et le TTL sont paramétrables depuis la vue Administration. Les variables d’environnement restent le repli si le champ UI est vide.

## Vue Administration

Le dashboard `/watchdog-hub#admin` envoie des actions UIbuilder. Node-RED persiste `fleetAdminConfig` et `fleetEnrolledDevices` dans le contexte flow (filesystem). Les secrets ne sont jamais renvoyés en clair (masque `••••xxxx`).

| Action | Effet |
|--------|--------|
| `fleet_snapshot_get` | Snapshot opérateur + bloc `admin` |
| `fleet_refresh_request` | Poll Balena forcé (anti-rebond 15 s) |
| `fleet_admin_save` | Enregistre la config UI, dont la liste des fleets, puis relance un poll |
| `fleet_device_enroll` | Pré-déclare un UUID (inventaire manuel) |
| `fleet_device_unenroll` | Retire un UUID manuel |
| `fleet_teams_test` | Carte Teams de test (même pipeline que le bouton flow) |

L’abonnement MQTT (broker réel) reste celui du nœud Node-RED. Les champs broker/topic de l’admin servent à l’onboarding (instructions copiables).

## Vue Flux et incidents

Le dashboard `/watchdog-hub#flows` utilise UIbuilder comme pont sécurisé vers l’API ingest locale. `WATCHDOG_INGEST_TOKEN` est lu uniquement par Node-RED et n’est jamais transmis au navigateur.

| Action UIbuilder | Appel ingest |
|------------------|--------------|
| `flows_snapshot_get` | `GET /v1/flows` puis `GET /v1/incidents?limit=100` |
| `flows_refresh_request` | Recharge le snapshot Flux |
| `flows_incident_get` | `GET /v1/incidents/:id` |
| `flows_incident_action` | `POST /v1/incidents/:id/actions` |
| `flows_incident_patch` | `PATCH /v1/incidents/:id` |
| `flows_incident_resolve` | `POST /v1/incidents/:id/resolutions` |

| Topic UIbuilder | Contenu |
|-----------------|---------|
| `flows_snapshot` | Flux, règles de santé, 100 incidents au maximum et notice opérateur |
| `flows_incident` | Incident, transitions autorisées, liens, historique, actions et résolutions |
| `flows_error` | Erreur normalisée sans secret, avec code HTTP et opération |

Après une action, une transition ou une résolution réussie, Node-RED recharge le snapshot. Si la modale reste ouverte, le client recharge ensuite le détail de l’incident.

## Anti-flap Teams

Les alertes Teams ne partent qu'après **N polls Balena consécutifs** (défaut **2**) confirmant le même défaut ou la même recovery.

## Variables communes

| Variable | Gateway | Fleet |
|----------|---------|-------|
| `TEAMS_WEBHOOK_URL` | Alertes device (flow 03) | Alertes fleet (flow 04) |
| Broker MQTT | Configuré dans nodes MQTT | Idem |

Variables fleet uniquement : `BALENA_API_TOKEN`, `BALENA_APP_IDS`, `BALENA_APP_ID` (repli) et `FLEET_HEARTBEAT_TTL_DAYS`.

`BALENA_APP_IDS` accepte plusieurs IDs numériques, slugs ou UUID de devices,
séparés par une virgule ou un retour à la ligne. Les résultats sont fusionnés et
dédupliqués par UUID. Une erreur sur une fleet n'annule pas les résultats des autres.

## Tests de contrat

```bash
npm test
```

Fichiers : `tests/watchdog.*.v1.test.js` (contrats
`watchdog.heartbeat.v1` et `watchdog.event.v1`, kit d'intégration, ingest
HTTP, anomalies, incidents, actions, résolutions). Il n'existe pas de
`tests/contract.test.js`.

## Ingest HTTP (producteurs CSV / Météo)

Les stacks CSV et Météo sont séparées du siège. Pour viser Watchdog sans activer l'émission :

- `WATCHDOG_URL=http://<watchdog-host>:8091/v1/events`
- `WATCHDOG_TOKEN` (ou `WATCHDOG_INGEST_TOKEN`) = même secret que `WATCHDOG_INGEST_TOKEN` côté siège
- Flags d'émission : CSV `watchdog.enabled` et Météo `WATCHDOG_ENABLED` restent **OFF** tant que l'activation n'est pas explicite

`GET /healthz` n'exige pas de token. `/v1/*` l'exige dès que le secret siège est non vide.

## Producteur dju-daily (`METEO_STAT_DAILY`)

Flux distinct de `METEO_01`. Il décrit le worker quotidien de `dju-autonome`, qui calcule et écrit les statistiques de Genève. Watchdog n'est pas la base de ces statistiques.

| Identifiant | Valeur |
| --- | --- |
| `flow_id` | `METEO_STAT_DAILY` |
| `producer` | `dju-daily` |
| `source_id` | `SRC_SQLSERVER_METEO` |
| `connector_id` | `CONN_DJU_DAILY` |
| `destination_id` | `DST_SQL_GENEVE_METEO_STAT` |

Contrat inchangé : `watchdog.event.v1`. Un événement terminal par passage qui a réellement traité des journées closes. Le corps ne contient ni ligne de `dbo.Geneve_Meteo_STAT`, ni mesure, ni secret.

| Situation | `event_type` | `status` |
| --- | --- | --- |
| Écriture relue ou valeurs déjà confirmées en base | `execution_completed` | `success` |
| Source incomplète, écriture refusée par le worker | `data_missing` | `partial` |
| Lecture source, écriture, relecture ou validation en échec | `connector_error`, `destination_error`, `validation_failed` ou `execution_failed` | `failure` |

Deux clauses `event_failure`, dérivées du contrat, sans copie indépendante :

| Clause | Ouverture | Signature | Fermeture |
| --- | --- | --- | --- |
| `availability` | `connector_error`, `destination_error`, `execution_failed`, `validation_failed` avec `status: failure` | signature de l'événement | `execution_completed` / `success` |
| `source_completeness` | `data_missing` avec `status: partial` | `source_data_incomplete`, déclarée sur la clause | `execution_completed` / `success` |

`data_missing` reste un écart de données. Il n'est pas réécrit en `execution_failed`. La signature ne contient ni date ni message SQL. Les répétitions du même écart incrémentent la même anomalie. Les événements d'origine restent dans le registre.

Le worker n'envoie pas la liste des journées. `business_date` n'est présent que lorsqu'une seule journée du passage est incomplète, et `incomplete_days` est un compte. Watchdog ne reconstitue pas les journées absentes du payload.

`execution_completed` / `success` ferme cette anomalie. Le worker ne produit ce succès que lorsque toutes les journées closes du passage sont confirmées, par écriture relue ou par valeurs déjà présentes. Une panne technique ne ferme pas l'anomalie de données. Une semaine ou un mois encore ouvert (`period-open`) n'empêche pas ce succès et ne concerne pas cette clause.

Il n'y a pas de règle de fraîcheur ni d'heure obligatoire. `METEO_01` et `CSV_OASSIS_01` ne déclarent pas `open_statuses` : leur défaut reste `failure`, et leur `data_missing` n'ouvre rien. Le second fait similaire peut ouvrir un incident `DETECTE` par le moteur déjà en place. Ce `DETECTE` passe à `CLOS` sur le succès du flux. Les états suivants restent manuels.

Côté producteur, le défaut est `WATCHDOG_ENABLED=false`. Pour l'activer après le déploiement de ce contrat :

- `WATCHDOG_URL=http://<watchdog-host>:8091/v1/events`
- `WATCHDOG_TOKEN`, identique à `WATCHDOG_INGEST_TOKEN`, transmis dans `X-Watchdog-Token`
- `WATCHDOG_TIMEOUT_MS` optionnel, défaut 3000, borné de 200 à 10000

Le drapeau désactivé ne change pas le calcul ni l'écriture. Un Hub injoignable ne change pas le résultat SQL. Watchdog ne relance pas le worker et n'écrit pas dans les tables métier.
