# Watchdog Hub - déploiement siège

Dashboard de supervision centralisée des gateways BACnet et Modbus. Node-RED
conserve les règles d'état et les transitions Teams ; l'interface UIbuilder
est en lecture seule.

> **Projet gateway edge :** [README.md](../README.md) à la racine du dépôt.
> **Contrat MQTT :** [INTEGRATION.md](INTEGRATION.md)
> **Nouveaux producteurs :** [kit d'intégration versionné](integration-kit/README.md)

## Structure

```
watchdog-hub/
├── flows/
│   └── 04_Watchdog_Hub.json    # Flow Node-RED fleet
├── contracts/                    # Contrats MQTT et HTTP
├── integration-kit/              # Kit BACnet, Modbus et HTTP
├── uibuilder/watchdog-hub/src/ # UI Vue 3 (lecture seule)
├── Dockerfile                    # Image GHCR
├── docker-compose.yml            # Stack Portainer/Swarm
├── settings.js                   # Config Node-RED
├── start.sh                      # Entrypoint (init flows + UI)
├── publish.ps1                   # Build + push GHCR
├── tests/watchdog.*.v1.test.js   # Contrats et runtime (npm test)
├── INTEGRATION.md                # Contrat MQTT gateway ↔ fleet
└── .env.example                  # Variables Portainer
```

Le kit est versionné par `integration-kit/VERSION`. Une version publiée est
associée au tag immuable correspondant du dépôt Watchdog Hub. Les nouveaux
projets doivent partir des templates du kit et réussir ses tests de conformité
avant activation en production.

## Construire et publier (GHCR → Portainer)

Flux cible : dépôt Git propre → tests et build local → push du commit vers GitHub
→ push de l'image GHCR issue du même commit → déploiement via Portainer
(pas de build sur le siège).

### Phase développement (tag mutable)

Portainer reste sur `WATCHDOG_HUB_IMAGE=ghcr.io/energymgt/watchdog-hub:dev`.

Pas besoin de changer la version à chaque déploiement.

```powershell
# depuis C:\DEV_local\watchdog-hub
.\publish.ps1

# depuis C:\DEV_local
.\watchdog-hub\publish.ps1
```

Le script refuse les modifications non commitées et vérifie que `origin` pointe vers
`Energymgt/Watchdog-hub`. Il exécute les tests et le build avant toute publication,
puis pousse la branche courante et l'image associée au même commit.
`-SkipTests` est réservé aux validations déjà effectuées explicitement.
`-SkipPush` construit uniquement l'image locale sans pousser le code ni l'image.

Puis sur Portainer : **Update the stack** + **Pull and redeploy** (re-pull du tag `dev`).

### Release (tag immuable)

```powershell
.\watchdog-hub\publish.ps1 -Version 1.2.4
```

Changer alors `WATCHDOG_HUB_IMAGE` dans Portainer. Ne pas réutiliser un tag de release déjà poussé.

Équivalent manuel en développement :

```bash
cd watchdog-hub
docker build --platform linux/amd64 \
  --build-arg WATCHDOG_VERSION=dev \
  -t ghcr.io/energymgt/watchdog-hub:dev .
docker push ghcr.io/energymgt/watchdog-hub:dev
```

L'image doit être `linux/amd64` pour le nœud Swarm siège.
Runtime : Node-RED **5.0.4**, publié sur le port hôte **1884**. Ingest : port hôte **8091**.

### Serveur distant (Portainer)

1. Stack basée sur `watchdog-hub/docker-compose.yml`.
2. Phase développement : `WATCHDOG_HUB_IMAGE=ghcr.io/energymgt/watchdog-hub:dev` (une seule fois).
3. Si le package GHCR est privé : configurer dans Portainer les identifiants d'un compte autorisé à lire les packages `energymgt`.
4. **Update the stack** avec pull de l'image (re-pull / Pull and redeploy).
5. Vérifier `http://<serveur>:1884/watchdog-hub` et `http://<serveur>:8091/healthz`.

### Migration depuis Watchdog Fleet

Le renommage change le service, l'image, la route UIbuilder et le volume Docker.
Avant de mettre à jour la stack, migrer les données persistantes :

```bash
# Remplacer <stack> par le nom réel de la stack Portainer.
docker volume inspect <stack>_watchdog_fleet_data
docker run --rm \
  -v <stack>_watchdog_fleet_data:/from:ro \
  -v ${PWD}:/backup \
  alpine tar czf /backup/watchdog_fleet_data-before-hub.tgz -C /from .

docker volume create <stack>_watchdog_hub_data
docker run --rm \
  -v <stack>_watchdog_fleet_data:/from:ro \
  -v <stack>_watchdog_hub_data:/to \
  alpine sh -c 'cd /from && cp -a . /to/'
```

Ensuite :

1. Remplacer `WATCHDOG_FLEET_IMAGE` par `WATCHDOG_HUB_IMAGE`.
2. Utiliser l'image `ghcr.io/energymgt/watchdog-hub:<tag>`.
3. Mettre à jour la stack avec le nouveau `docker-compose.yml`.
4. Vérifier `/watchdog-hub`, l'ingest, Balena, MQTT et Teams.
5. Conserver l'ancien volume jusqu'à validation complète du nouveau déploiement.

## Variables Portainer

Voir `.env.example`. Principales :

- `WATCHDOG_HUB_IMAGE` : `ghcr.io/energymgt/watchdog-hub:dev` en développement ; tag immuable `x.y.z` en release.
- `USERNAME`, `PASSWORD` : authentification de l'éditeur Node-RED.
- `ENCRYPTION_KEY` : secret fixe de chiffrement des credentials.
- `TEAMS_WEBHOOK_URL` : URL du Workflow Teams.
- `BALENA_API_TOKEN` : token Balena en lecture seule.
- `BALENA_APP_IDS` : liste d'IDs fleet, slugs ou UUID de devices, séparés par une virgule ou un retour à la ligne.
- `BALENA_APP_ID` : repli rétrocompatible lorsqu'une seule fleet est supervisée.
- `FLEET_HEARTBEAT_TTL_DAYS` : rétention mémoire des heartbeats (défaut 30).
- `FORCE_COPY_FLOWS` : `true` remplace `/data/flows.json` par le flow de l'image.
- `WATCHDOG_INGEST_TOKEN` : secret partagé pour `/v1/*` (header `X-Watchdog-Token` ou `Authorization: Bearer`). Vide = pas d'auth. Production : à poser avant de publier le port 8091.
- Producteurs CSV / Météo : `WATCHDOG_URL=http://<watchdog-host>:8091/v1/events` et le même secret (`WATCHDOG_TOKEN` ou `WATCHDOG_INGEST_TOKEN`). Les flags d'émission restent **OFF** par défaut.

Ne jamais committer les valeurs de secrets.

## Première mise en service

1. Sauvegarder le volume `watchdog_hub_data`.
2. Déployer `docker-compose.yml` avec l'image versionnée.
3. Sur un volume neuf, le flow et les sources UIbuilder sont initialisés automatiquement.
4. Sur un volume existant, `flows.json` est préservé : importer explicitement
   `flows/04_Watchdog_Hub.json`, puis déployer.
5. Vérifier l'éditeur sur `http://SERVEUR:1884` et le dashboard sur
   `http://SERVEUR:1884/watchdog-hub`.
6. Vérifier le test Teams, le poll de toutes les fleets Balena et les heartbeats MQTT.

Le poll Balena fusionne les devices par UUID. Si une fleet échoue, les autres
restent actualisées et le dernier inventaire connu de la fleet en échec est conservé.
L'erreur partielle reste visible dans le dashboard.

## Validation des alertes

1. Une fluctuation Balena d'un seul poll ne doit pas créer de carte Teams.
2. Une panne confirmée sur deux polls successifs doit produire une seule carte.
3. Le retour à la normale doit aussi attendre deux polls avant `[RECOVERY]`.
4. Un nouvel appareil reste visible dans le dashboard, sans alerte, pendant 5 minutes.
5. Un webhook 4xx doit afficher l'erreur Teams dans le dashboard ; 429/5xx sont retentés deux fois.

## Tests

```bash
npm test
```

Contrats ingest : `tests/watchdog.*.v1.test.js` (pas de `tests/contract.test.js`).  
Lot 0 — contrat `watchdog.event.v1`.  
Lot 1 — ingest HTTP + registre SQLite (`runtime/`, aucun impact Fleet BACnet).  
Lot 2 — adaptateur CSV `CSV_OASSIS_01` (flag `watchdog.enabled` **OFF** par défaut dans CSV to SQL).  
Lot 2.1 — échecs SQL destination (`destination_error` / `timeout`) via Catch Node-RED, sans supervision métier.  
Lot 3 — adaptateur API Météo `METEO_01` (flag `WATCHDOG_ENABLED` **OFF** par défaut).  
Lot 4 — contrats de santé déclaratifs + anomalies `event_failure` (`GET /v1/anomalies`, `GET /v1/flows`).  
Lot 5 — incidents corrélés (`GET /v1/incidents`, `PATCH /v1/incidents/:id`), historique d’état obligatoire.  
Lot 6 — actions enregistrées (`POST /v1/incidents/:id/actions`). Pas d’orchestration, pas d’UI Flux.  
Lot 7 — résolutions (`POST /v1/incidents/:id/resolutions`) + état de flux calculé (`GET /v1/flows`, `GET /v1/flows/:id`). Pas d’UI Flux.

Post-Lot 7 — vue `/watchdog-hub#flows` : consultation des flux et incidents, notes opérateur, transitions, résolutions et clôture via un pont UIbuilder sécurisé. Le token ingest reste côté Node-RED.

Ingest siège (tag `dev`, port hôte **8091**) après Pull and redeploy Portainer :

```text
GET  http://<serveur>:8091/healthz
GET  http://<serveur>:8091/v1/flows
GET  http://<serveur>:8091/v1/anomalies
GET  http://<serveur>:8091/v1/incidents
POST http://<serveur>:8091/v1/events
```

Registre SQLite : `/data/watchdog-registry.sqlite` dans le volume.  
Variables : `WATCHDOG_INGEST_PORT`, `WATCHDOG_INGEST_BIND`, `WATCHDOG_REGISTRY_PATH`, `WATCHDOG_INGEST_TOKEN`.  
Healthcheck Swarm : éditeur Node-RED (`:1880`, 200 ou 401) **et** `GET http://127.0.0.1:8091/healthz` (200, sans token).  
Le contrat MQTT gateway ↔ fleet reste dans `INTEGRATION.md`.  
Adaptateurs : CSV OASSIS (flag `watchdog.enabled`) et Import Auto météo (flag `WATCHDOG_ENABLED`). Flags **OFF**.  
La vue Fleet BACnet (`:1884/watchdog-hub`) n’est pas modifiée.

## Mise à jour

**Développement :** `.\publish.ps1` puis Pull and redeploy. Ne pas changer `WATCHDOG_HUB_IMAGE`.

**Release :** pousser un tag immuable `x.y.z`, puis modifier `WATCHDOG_HUB_IMAGE` une fois.

Swarm surveille le healthcheck et revient à l'image précédente si la tâche ne devient pas saine.  
Si le flow Fleet a changé : sauvegarder le volume, puis soit importer `flows/04_Watchdog_Hub.json`, soit poser `FORCE_COPY_FLOWS=true` le temps d'un redéploiement.

## Sauvegarde

```bash
docker run --rm -v <stack>_watchdog_hub_data:/data -v ${PWD}:/backup alpine \
  tar czf /backup/watchdog_hub_data.tgz /data
```

## Sécurité

`adminAuth` protège l'éditeur Node-RED, pas nécessairement les pages UIbuilder.
Le port 1884 doit rester limité au réseau siège ou être placé derrière le proxy
d'authentification de l'entreprise avant toute exposition externe.

Le port 8091 (ingest) n'a pas d'auth si `WATCHDOG_INGEST_TOKEN` est vide.
En production : poser le token et/ou restreindre l'interface hôte publiée.
`GET /healthz` reste sans authentification (healthcheck Docker).
