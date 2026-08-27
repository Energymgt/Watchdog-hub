# Contrat d'intégration — Gateway ↔ Watchdog Hub

Ce document décrit le lien entre la gateway edge et le dashboard fleet siège.

## Principe

- Chaque gateway publie périodiquement son état sur MQTT.
- Le watchdog fleet consomme ces heartbeats et les croise avec l'API Balena Cloud.
- Aucune communication HTTP directe entre les deux stacks.

## Topic MQTT

```
bacnet/gateway/{device_uuid}/heartbeat
```

- `{device_uuid}` : UUID Balena du device (`BALENA_DEVICE_UUID` ou équivalent supervisor).
- QoS : 1 (recommandé).
- Retain : `true` (le fleet lit le dernier état connu au démarrage).

## Payload heartbeat (gateway → fleet)

Structure émise par le flow `03_Watchdog.json` :

```json
{
  "ts": 1710000000000,
  "device": {
    "uuid": "abc123...",
    "name": "Gateway Site A"
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

Fichiers : `tests/watchdog.*.v1.test.js` (contrat `watchdog.event.v1`, ingest HTTP, anomalies, incidents, actions, résolutions). Il n'existe pas de `tests/contract.test.js`.

## Ingest HTTP (producteurs CSV / Météo)

Les stacks CSV et Météo sont séparées du siège. Pour viser Watchdog sans activer l'émission :

- `WATCHDOG_URL=http://<watchdog-host>:8091/v1/events`
- `WATCHDOG_TOKEN` (ou `WATCHDOG_INGEST_TOKEN`) = même secret que `WATCHDOG_INGEST_TOKEN` côté siège
- Flags d'émission : CSV `watchdog.enabled` et Météo `WATCHDOG_ENABLED` restent **OFF** tant que l'activation n'est pas explicite

`GET /healthz` n'exige pas de token. `/v1/*` l'exige dès que le secret siège est non vide.
