# Kit d'intégration Watchdog Hub

Version du kit : `1.0.0`

Ce dossier est le point d'entrée des nouveaux producteurs Watchdog. Il couvre
deux canaux indépendants :

- MQTT pour l'état technique périodique des gateways BACnet et Modbus ;
- HTTP pour les faits techniques d'un batch, d'une API ou d'un connecteur.

Une indisponibilité de Watchdog Hub ne doit jamais interrompre le traitement
métier du producteur.

## 1. Gateway MQTT

### Contrat

- Broker de production actuel : `iot.energymgt.io:1883`
- Topic : `bacnet/gateway/{BALENA_DEVICE_UUID}/heartbeat`
- QoS : `1`
- Retain : `true`
- Période recommandée : `60 s`
- Transport HTTP edge vers siège : interdit

Le préfixe `bacnet/gateway/` est historique et reste obligatoire pour les
gateways Modbus tant que le consommateur Fleet n'a pas été migré.

Le contrat formel se trouve dans
`../contracts/watchdog.heartbeat.v1.schema.json`. Le champ `schema` est
recommandé aux nouveaux producteurs mais reste optionnel pour accepter les
heartbeats historiques.

### Identité

`device.uuid` doit provenir de `BALENA_DEVICE_UUID` et doit être identique à
l'UUID du topic. Un UUID, un nom de site ou un secret codé en dur est interdit.
`device.protocol` doit valoir `bacnet` ou `modbus`.

### Import Node-RED

1. Importer le template correspondant depuis `node-red/`.
2. Configurer les credentials du broker dans Node-RED ou par le mécanisme de
   secrets du déploiement. Ne pas les exporter avec le flow.
3. Relier l'état technique normalisé à l'entrée link du template.
4. Déployer puis vérifier le message retained dans Watchdog Hub.

Le message transmis à l'entrée link doit fournir :

```json
{
  "health": { "ok": true },
  "mqtt": { "ok": true, "connected": true },
  "buffer": { "state": "ok", "pending": 0 },
  "snapshot": null,
  "supervisor": null
}
```

Pour Modbus, `health.protocol` et `health.modbus` sont obligatoires. Les
exemples complets se trouvent dans `examples/`. `buffer.pending` peut valoir
`null` lorsque le compteur est indisponible ; ne pas inventer une valeur zéro.

## 2. Producteur HTTP

### Endpoint

```text
POST http://<watchdog-host>:8091/v1/events
Content-Type: application/json
X-Watchdog-Token: <secret>
```

Le contrat est `../contracts/watchdog.event.v1.schema.json`. Le producteur
émet un événement par exécution ou cycle, jamais un événement par mesure ou
ligne métier.

Règles principales :

- `event_id` est un UUID v4 ou un ULID mondialement unique ;
- `flow_id`, `source_id`, `connector_id` et `destination_id` sont stables ;
- `timestamp` est en UTC avec suffixe `Z` ;
- `execution_id` est obligatoire pour les événements d'exécution ;
- `error_signature` est obligatoire pour un échec et ne contient pas d'UUID
  de run ni de timestamp ;
- l'envoi est fire-and-forget avec un timeout court ;
- aucun secret ou contenu métier n'est placé dans `metadata`.

Copier `env/http-producer.env.example`, adapter `examples/http-event.json` et
ajouter au Hub une déclaration inspirée de
`flow-contracts/FLOW_ID.example.json`. Le flag d'émission reste désactivé
jusqu'à la recette.

## 3. Recette obligatoire

Avant mise en production :

1. Exécuter `npm test` dans le dépôt Watchdog Hub.
2. Vérifier l'UUID, QoS 1, retain et la période du heartbeat.
3. Arrêter l'émission et vérifier l'état `heartbeat_missing`.
4. Redémarrer la gateway et vérifier que son UUID ne change pas.
5. Envoyer un événement HTTP valide et vérifier la réponse.
6. Renvoyer le même `event_id` et vérifier l'absence de doublon.
7. Couper Watchdog Hub et vérifier que le traitement métier continue.
8. Contrôler qu'aucun secret ni donnée métier n'est émis.

## 4. Versionnement

La version est indiquée dans `VERSION`. Une version publiée du kit est liée au
tag immuable correspondant du dépôt Watchdog Hub. Toute rupture de contrat
nécessite une nouvelle version majeure et une période de compatibilité.
