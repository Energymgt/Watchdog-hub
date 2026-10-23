# Audit d’interface — Watchdog Hub

Document pour analyse externe. Version applicative **1.2.3**. Date de lecture : **23 octobre 2026**.

Il décrit l’interface opérateur telle qu’elle est construite dans `uibuilder/watchdog-hub/src/`. Il ne décrit pas le moteur Node-RED, l’ingest HTTP, ni les contrats d’événements. Pour le rôle produit, voir `ANALYSE-APPLICATION.md`.

Méthode : lecture des templates Vue, du routeur, des stores et de la feuille `index.css` (environ 3 400 lignes). Aucune session navigateur n’a été réalisée pour ce document. Les constats visuels sont ceux que le CSS final produit après cascade, pas ceux des blocs plus anciens que des règles ultérieures écrasent.

---

## 1. Produit vu par l’interface

Watchdog Hub est un siège de supervision. L’opérateur y regarde deux plans, puis agit sur un seul :

| Plan | Question | Action possible dans l’UI |
| --- | --- | --- |
| Flux métier | La chaîne source → destination est-elle saine, et quel problème est corrélé ? | Lire, filtrer, ouvrir un diagnostic, traiter un incident (note, transition, résolution) |
| Appareils | La passerelle est-elle joignable, et son heartbeat est-il récent ? | Lire, filtrer, ouvrir une fiche. Pas de commande terrain |
| Configuration | Comment le siège se connecte-t-il à Balena, MQTT (texte d’onboarding) et Teams ? | Enregistrer des seuils, pré-déclarer un appareil, tester Teams |

L’interface ne publie rien, n’écrit pas en base métier, et ne redémarre aucun connecteur.

Langue de l’interface : français (`lang="fr"`). Quelques libellés restent en anglais. Ils sont listés en section 11.

---

## 2. Architecture technique de l’UI

Une seule page HTML, Vue 3.4 servi sans bundler par UIbuilder. Les scripts sont chargés dans l’ordre dans `index.html`. L’application est un composant racine (`app.js`) qui possède l’état et compose les pages.

```
index.html
  skip-link
  #app
    WatchdogHubApp (.app-shell)
      en-tête
      navigation
      main
      surcouches (modale, tiroir, assistant, palette)
```

Quatre stores indépendants, tous alimentés par le même canal UIbuilder, pas par des appels HTTP du navigateur :

| Store | Contenu |
| --- | --- |
| fleet | appareils, résumé, admin, appareil sélectionné |
| flows | flux, incidents, incident ouvert, règles |
| anomalies | anomalies, anomalie sélectionnée |
| events | événements, événement sélectionné |

La navigation d’écran vit dans le hash. La sélection d’un enregistrement, sauf l’incident, vit seulement en mémoire.

---

## 3. Architecture d’information

Trois familles, dans cet ordre mental :

1. **Regarder** — vue d’ensemble, flux, appareils.
2. **Traiter** — incidents, anomalies, événements. L’incident est le seul objet sur lequel l’opérateur écrit.
3. **Régler** — configuration du siège.

Hiérarchie des objets :

```
Système
├── Flux métier
│   ├── état calculé (opérationnel, dégradé, indisponible, inconnu)
│   ├── chaîne (source, connecteur, destination)
│   ├── anomalies liées
│   ├── événements liés
│   └── incidents liés
│       ├── historique d’états
│       ├── note
│       ├── transition
│       └── résolution
├── Appareil
│   ├── état calculé
│   ├── Balena, heartbeat, santé terrain, buffer, Node-RED
│   └── confirmation d’alerte en cours
└── Configuration
    ├── Balena, MQTT (affichage), Teams
    ├── seuils
    └── appareils pré-enregistrés
```

Relation que l’interface doit faire comprendre, et qu’elle ne nomme pas toujours de la même façon :

| Objet | Nature | Mutabilité dans l’UI |
| --- | --- | --- |
| Événement | Fait technique | Lecture seule |
| Anomalie | Écart agrégé (signature, clause, occurrences) | Lecture seule |
| Incident | Problème suivi | Note, changement d’état, résolution |
| Flux | Contrat supervisé | Lecture seule |
| Appareil | Passerelle | Lecture seule, hors enrôlement manuel |

États d’incident, dans l’ordre métier affiché : Détecté, Ouvert, En analyse, En correction, En validation, Résolu, Clos. Le filtre par défaut des incidents est « Actifs », c’est-à-dire tout sauf Résolu et Clos.

---

## 4. Navigation

### 4.1 Carte des routes

Routeur : hash. Une vue inconnue retombe sur la vue d’ensemble. L’accueil (`#` vide) est la vue d’ensemble.

| Contrôle visible | Hash | Vue interne | Compteur du bouton |
| --- | --- | --- | --- |
| Vue d’ensemble | *(vide)* | `overview` | aucun |
| Flux métier | `#flows` | `flows` | flux dégradés + indisponibles + inconnus |
| Appareils | `#fleet` | `fleet` | alertes flotte |
| Problèmes | `#incidents` | `incidents` | aucun sur le parent |
| Incidents | `#incidents` ou `#incidents/{id}` | `incidents` | incidents actifs |
| Anomalies | `#anomalies` | `anomalies` | anomalies ouvertes |
| Événements | `#events` | `events` | **tous** les événements du relevé |
| Configuration | `#admin` | `admin` | aucun |

Le bouton parent « Problèmes » n’est pas un simple titre de groupe. Un clic ouvre les incidents. Il reçoit la classe active dès que la vue courante est incidents, anomalies ou événements, sans `aria-current`. Les enfants portent `aria-current="page"`.

Le compteur Événements n’est pas un compteur de problèmes. Il a le même dessin que les compteurs d’alerte.

### 4.2 Arbre de navigation

```
Watchdog Hub
├── Vue d’ensemble
├── Flux métier
├── Appareils
├── Problèmes
│   ├── Incidents
│   │   └── #incidents/{id}  (seul profond lien)
│   ├── Anomalies
│   └── Événements
├── Configuration
└── Palette Ctrl+K
    ├── sans texte : les 7 destinations
    └── avec texte : 15 résultats locaux maximum
```

### 4.3 Ce qui est adressable

| Cible | Dans l’URL | Survit à un rechargement |
| --- | --- | --- |
| Écran | oui | oui |
| Incident ouvert | oui, `#incidents/{id}` | oui, si l’identifiant est redemandé |
| Flux sélectionné | non | non |
| Anomalie sélectionnée | non | non |
| Événement sélectionné | non | non |
| Appareil ouvert | non | non |
| Filtres, page, tri | non | non |
| Thème | `localStorage` `watchdog-theme` | oui |

Conséquence : on peut envoyer un lien vers un incident. On ne peut pas envoyer un lien vers un flux, une anomalie, un événement ou un appareil.

### 4.4 Passerelles entre écrans

| Depuis | Action | Arrive sur |
| --- | --- | --- |
| Vue d’ensemble | Ouvrir les flux / les appareils / les incidents | écran correspondant |
| Vue d’ensemble | Ligne « À traiter » | fiche incident (tiroir), diagnostic de flux, ou fiche appareil (modale) |
| Vue d’ensemble | Ligne d’activité | écran de l’objet, et sélection si la navigation le porte |
| Liste de flux | Nom ou Ouvrir | panneau de diagnostic à droite, même écran |
| Liste de flux | « N incident(s) actif(s) » | écran Incidents, recherche préremplie avec l’identifiant du flux |
| Diagnostic de flux | Incident / anomalie / événement lié | tiroir incident, ou écran Anomalies / Événements avec sélection |
| Incident | Nom du flux, lien « flow » | écran Flux avec ce flux sélectionné |
| Anomalie ou événement | Lien flux | écran Flux |
| Anomalie | Dernier événement | écran Événements |
| Palette | Résultat | écran + sélection (incident, flux, anomalie, événement, appareil) |
| Flotte vide | « Ouvrir l’administration » | Configuration |

La recherche des flux et celle des incidents sont **la même chaîne**. Passer d’un flux à ses incidents écrit l’identifiant du flux dans cette recherche partagée. Elle reste ensuite sur les deux écrans jusqu’à une réinitialisation.

La barre de filtres est aussi partagée. Sur Flux, le filtre « État des incidents » est visible alors que la liste d’incidents ne l’est pas. Sur Incidents, le filtre « État du flux » est visible alors que la liste de flux ne l’est pas.

### 4.5 Palette

Ouverture : bouton « Rechercher » dans l’en-tête, ou Ctrl+K / Cmd+K.

Sans saisie, la palette liste les destinations, pas les données. Avec saisie, elle cherche dans les incidents, flux, anomalies, événements et appareils **déjà chargés dans le navigateur**, 15 résultats. Le sous-texte le dit : « Résultats locaux dans les données chargées ».

Titre affiché : `Command Center Navigation`. Placeholder : `Rechercher un flux, incident, device...`. Les types de résultat sont des pastilles anglaises : `INCIDENT`, `FLOW`, `ANOMALY`, `EVENT`, `DEVICE`.

---

## 5. Shell — arborescence visuelle globale

Grille plein écran (`100dvh`) : l’en-tête occupe la première rangée sur les deux colonnes. En dessous, navigation à gauche, contenu à droite. Le contenu défile dans `main`, pas dans la page.

```
.app-shell                         grille 210px | reste, hauteur 100dvh
├── header.page-header             sticky, pleine largeur, z-index 20
│   ├── identité
│   │   ├── eyebrow « Supervision »
│   │   └── h1 = nom de flotte (défaut « Watchdog Hub »)
│   ├── méta
│   │   ├── « Dernier relevé » + temps relatif
│   │   ├── pastille Connecté | Hors ligne
│   │   ├── bouton de thème
│   │   └── bouton Rechercher + kbd Ctrl K
│   └── details « Sources et télémétrie »     replié par défaut
│       ├── pastilles Balena, MQTT, Teams, et « Données anciennes » si périmé
│       ├── définition : relevé, évaluation, dernier poll, dernier heartbeat, prochain poll
│       └── erreurs Balena / Teams
├── nav.app-nav                    colonne, ~210px, sous l’en-tête
│   ├── marque « WATCHDOG »
│   ├── groupe Regarder
│   │   ├── Vue d’ensemble
│   │   ├── Flux métier + compteur
│   │   └── Appareils + compteur
│   ├── groupe Problèmes
│   │   ├── bouton Problèmes
│   │   └── sous-liste indentée (filet gauche)
│   │       ├── Incidents + compteur
│   │       ├── Anomalies + compteur
│   │       └── Événements + compteur
│   └── groupe Configuration       poussé en bas de la colonne
└── main#main-content.dashboard    défilement interne
    ├── live region (sr-only)      annonces de chargement
    ├── bannières globales         connexion, erreur flotte, notice
    └── une vue (voir section 6)

Surcouches, sœurs de main, pas dans le flux :
├── device-detail      modale centrée          z-index 50
├── enroll-wizard      modale centrée          z-index 50
├── incident-detail    tiroir droit            z-index 60
└── command-palette    dialogue haut d’écran   z-index 70
```

Quand une surcouche est ouverte, l’en-tête, la navigation et `main` passent `inert`. Le focus est piégé dans la surcouche et rendu à l’élément ouvrant à la fermeture. Échap ferme. Les panneaux latéraux de flux, d’anomalie et d’événement ne sont pas des surcouches : ils restent dans `main`.

Largeur utile : les premières règles limitaient le contenu à 1 440 px puis 1 560 px. La règle de shell plus bas impose `width: 100%`. Le dashboard courant est donc pleine largeur, à droite de la navigation.

### Rythme vertical des pages

Le patron répété, avec des variations de nom de classe :

```
page
├── hero ou workspace-heading
│   ├── eyebrow (sauf vue d’ensemble)
│   ├── h2
│   └── phrase de cadrage
├── bannières d’état
├── barre d’outils (sauf vue d’ensemble et configuration, qui ont leur propre forme)
├── résumé de résultats
└── corps
    ├── liste ou tableau
    └── panneau de détail (flux, anomalies, événements)
        ou activité (appareils)
        ou cartes de réglage (configuration)
```

---

## 6. Arborescence par écran

### 6.1 Vue d’ensemble

Pas d’eyebrow. Pas de barre de filtres. Pas de bouton d’actualisation local : le relevé vient des abonnements.

```
section.overview-page
├── h2 « Vue d’ensemble »
├── phrase de cadrage
├── p.overview-reliability          seulement si la fraîcheur ou la connexion l’exige
├── .health-grid                    2 colonnes
│   ├── article Flux métier
│   │   ├── titre + pastille de synthèse
│   │   ├── phrase (« N flux indisponibles », etc.)
│   │   ├── 4 compteurs : opérationnels, dégradés, indisponibles, inconnus
│   │   └── lien « Ouvrir les flux »
│   └── article Appareils
│       ├── titre + pastille
│       ├── phrase
│       ├── 4 compteurs : opérationnels, à surveiller, hors service, inconnus
│       └── lien « Ouvrir les appareils »
├── section « À traiter » + compte
│   ├── vide : « Aucun incident actif, flux en défaut ou appareil en défaut. »
│   └── ol.priority-list
│       └── ligne
│           ├── bouton principal
│           │   ├── type (incident, flux, appareil) + état + ancienneté
│           │   ├── nom
│           │   └── cause
│           └── actions : libellé contextuel, et « Voir le flux » si incident lié
│   └── lien « Ouvrir les incidents »
└── section « Activité récente »
    ├── avertissement si une source manque
    └── ol.activity-timeline        8 entrées maximum
        └── temps relatif + catégorie + titre + description
```

Ordre de la liste « À traiter », calculé dans la page : incidents actifs, puis flux en défaut sans incident actif, puis appareils en défaut. Un incident déjà actif n’est pas doublé par l’état du flux qui le porte.

Synthèse d’un plan : le pire l’emporte. Indisponible ou hors service passe avant dégradé ou à surveiller, qui passe avant inconnu, qui passe avant opérationnel. Si le plan est nominal mais la connexion est coupée, le libellé nominal est retenu et remplacé par « Non confirmé ». Un plan non reçu n’affiche pas un zéro : « Lecture en cours », « Erreur de chargement » ou « Snapshot absent ».

Filet gauche coloré sur les blocs de santé et sur les lignes prioritaires. Ce filet est le signal de sévérité principal de cet écran, en plus de la pastille.

### 6.2 Flux métier — `#flows`

```
.flows-page
├── bannière erreur / succès
├── panneau chargement ou erreur si pas de relevé
└── sinon
    ├── hero
    │   ├── eyebrow « Supervision »
    │   ├── h2 « Flux métier »
    │   ├── phrase
    │   └── « Dernière lecture : » date absolue
    ├── barre de filtres
    │   ├── recherche
    │   ├── état du flux
    │   ├── état des incidents          visible ici aussi
    │   ├── Actualiser
    │   └── Réinitialiser
    ├── résumé « N flux affiché(s). »
    ├── bannière info si tous les flux filtrés sont inconnus faute d’événements
    └── .flow-workspace                 2 colonnes : liste | détail sticky
        ├── table Flux
        │   colonnes : Flux, État, Justification, Problèmes, Action
        │   ligne : nom (bouton), identifiant monospace, pastille,
        │           raison, incidents actifs (bouton), anomalies ouvertes, « Ouvrir »
        └── aside.flow-detail
            ├── vide : « Sélectionnez un flux pour afficher son diagnostic. »
            └── rempli
                ├── eyebrow « Diagnostic du flux » + h3 nom + identifiant + pastille
                ├── Pourquoi ?
                ├── Chaîne supervisée : Source, Connecteur, Destination
                ├── Dernier événement
                ├── Règles de santé
                ├── Incidents liés
                ├── Anomalies liées          seulement s’il y en a
                └── Events liés              seulement s’il y en a
```

Le composant `flows-kpis` (cinq cartes : supervisés, opérationnels, dégradés, indisponibles, incidents actifs) est chargé et n’est monté sur aucun écran. La synthèse chiffrée des flux n’existe que dans la vue d’ensemble.

### 6.3 Incidents — `#incidents`

Même composant que les flux (`flows-page`, `section === 'incidents'`). Le hero change de titre. La liste de flux et le panneau de diagnostic ne sont pas rendus. La liste d’incidents l’est.

```
.flows-page
├── hero « Incidents »
├── même barre de filtres que les flux
├── résumé « N incident(s) affiché(s). »
└── section Incidents
    ├── groupes par état (Détecté, Ouvert, …)
    │   └── ol de boutons .incident-row
    │       ├── identifiant + flux
    │       ├── signature
    │       └── pastille + date d’ouverture
    └── vide : « Aucun incident »
```

Ouverture : tiroir droit, pas un panneau dans la page.

```
ui-drawer.side-drawer
├── eyebrow « Gestion d’incident »
├── h2 = identifiant de flux (lien) ou « Incident »
├── identifiant d’incident
├── lecture
│   ├── état actuel
│   ├── dernière action
│   └── prochaine transition autorisée
├── historique des transitions
├── faits : signature, clause, clé de corrélation, ouvert le, fermé le
├── champ Opérateur (obligatoire pour agir)
├── cartes d’action
│   ├── Ajouter une note
│   ├── Changer l’état          si une transition ordinaire existe
│   └── Résoudre l’incident     si la résolution est autorisée
├── journal opérateur
└── éléments liés               le flux est un bouton, le reste est du texte
```

Le tiroir est la seule surface d’écriture métier de l’application.

### 6.4 Anomalies — `#anomalies`

```
.anomalies-page
├── hero eyebrow « Problèmes », h2, compte ouvertes / fermées, bouton Actualiser
├── filtres : recherche, état, flux, clause, Réinitialiser
├── résumé de résultats
└── .anomalies-workspace                liste | diagnostic
    ├── groupes Ouvertes, Fermées, et « État non reconnu » si besoin
    │   └── table : État, Anomalie (signature + id), Flux, Occurrences
    └── aside
        ├── vide : « Sélectionnez une anomalie pour afficher son diagnostic. »
        └── faits : état, flux (lien), clause, signature, occurrences,
            ouverte, fermée, dernier événement (lien)
```

Pas de pagination. Toute la liste filtrée est peinte. La table a une largeur minimale de 720 px et défile horizontalement dans son conteneur.

### 6.5 Événements — `#events`

Même patron que les anomalies, avec une liste en lignes plutôt qu’une table.

```
.events-page
├── hero + Actualiser
├── filtres : recherche, type, source, flux
└── .events-workspace
    ├── « Timeline des événements »
    │   └── bouton .event-row : horodatage absolu | type | nom de flux
    └── aside
        ├── faits : timestamp, type, statut, source, flux, connecteur,
        │   destination, producteur, signature
        └── details « Payload » replié, JSON en pre
```

Le payload n’est pas visible tant que l’opérateur n’ouvre pas le bloc. C’est le seul JSON brut de l’interface.

### 6.6 Appareils — `#fleet`

Pas de composant de page dédié : le corps est inline dans `app.js`, affiché pour toute vue qui n’est pas admin, overview, flows, incidents, anomalies ou events, dès qu’un snapshot flotte existe. En pratique la vue est `fleet`.

```
section.fleet-command-center
├── eyebrow « Infrastructure »
├── h2 « Appareils surveillés »
├── phrase
├── .kpi-grid                         5 cartes
│   ├── Appareils          bouton → filtre tous
│   ├── Opérationnels      bouton → filtre ok
│   ├── Alertes            pas un bouton
│   ├── Heartbeat absent   bouton → filtre heartbeat_missing
│   └── Hors service       bouton → filtre dead
├── h2 « Appareils à surveiller »
├── phrase quasi identique à la première
├── barre : recherche, source en défaut, état, tri, réinitialiser, actualiser
├── « N appareils affichés sur M »
├── table (et, sous 700 px, cartes en plus — voir section 10)
│   colonnes : Appareil, État, Heartbeat, Action « Détail »
│   tri cliquable sur Appareil et État
├── pagination : page, taille (défaut 50)
└── section « Activité flotte »
    ├── transitions récentes
    └── confirmations en attente
```

Fiche appareil : modale centrée, environ 680 px.

```
ui-modal
├── eyebrow « Détail appareil », h2 nom, fermer
├── phrase de détail
├── pastille d’état
├── bandeau si confirmation Teams en cours (compte / seuil)
├── bannière si grâce de démarrage gateway
└── grille de faits
    ├── UUID + copier
    ├── Balena, heartbeat, dates, retained, horodatage fiable
    ├── état confirmé, statut global, sévérité
    ├── santé du protocole, et bloc Modbus si protocole modbus
    ├── Node-RED, MQTT, buffer, services supervisor
    └── historique de transitions de cet appareil
```

Deux activités coexistent. La vue d’ensemble fusionne événements, incidents, anomalies et transitions d’appareils (8 lignes). La page Appareils ne montre que l’activité flotte.

Les cartes KPI de la flotte ne passent pas par le composant `kpi-card`. Elles dupliquent le markup. `kpi-card` n’est utilisé que par `flows-kpis`, qui n’est monté nulle part.

### 6.7 Configuration — `#admin`

```
section.admin-page
├── hero eyebrow « Configuration », h2, phrase sur les secrets
├── bouton « Connecter un appareil »
├── bannière d’avertissement (Portainer = repli)
├── bannières succès / erreur
├── h3 « Connexions »
├── grille 3 colonnes
│   ├── Balena Cloud + pastille
│   │   ├── fleets / app IDs (textarea)
│   │   └── token (password, vide = conserver)
│   ├── MQTT heartbeat + pastille
│   │   ├── broker, port, topic
│   │   └── texte : l’abonnement réel reste le nœud Node-RED
│   └── Microsoft Teams + pastille
│       ├── URL webhook (password)
│       └── « Tester l’intégration »
├── h3 « Seuils »
│   └── carte « Identité et seuils »
│       ├── nom de flotte, grâces, polls, rétention, intervalle de poll
│       └── Annuler (si modifié) + Enregistrer
└── h3 « Inventaire manuel »
    └── table nom, UUID, date, « Retirer »
        ou vide
```

Assistant d’enrôlement, modale en deux étapes annoncées :

```
étape 1 Méthode
├── Balena Cloud
├── Heartbeat MQTT
└── Enregistrement manuel
étape 2 Paramètres
└── selon la méthode : consignes copiables, ou nom + UUID
```

« Retirer » demande une confirmation avant l’envoi. Les secrets ne sont jamais réaffichés en clair : jeton masqué, webhook réduit à son hôte. Un champ secret vide conserve la valeur déjà enregistrée. Le formulaire le dit dans les hints.

---

## 7. Système visuel

### 7.1 Ton

Interface dense de supervision, pas un site marketing. Fond gris bleuté, surfaces blanches, filets 1 px, rayons 0,28 à 0,65 rem, ombre très légère. L’accent est un bleu (`--primary`). La sévérité est un codage à cinq tons, repris partout : pastille, filet de carte, filet de liste, parfois couleur de texte.

Typographie : `"Segoe UI Variable Text", "Segoe UI", Inter, Arial, sans-serif`. Corps 15 px. Les identifiants techniques sont en `ui-monospace`. Les chiffres de KPI et de compteurs sont tabulaires.

Échelle réelle :

| Rôle | Traitement |
| --- | --- |
| h1 nom de flotte | titre d’application, dans l’en-tête, pas le titre de page |
| h2 | titre d’écran, autour de 1,05 à 1,25 rem selon les surcharges |
| eyebrow | 0,68 rem, capitales, tracking large, couleur primaire |
| meta / résumé | 0,75 à 0,88 rem, couleur `--muted` |
| pastille | 0,72 rem, graisse 700, point coloré `::before` |
| compteur de nav | pilule 0,66–0,70 rem |

Le h1 n’annonce pas la page. Chaque écran a son h2. Sur Flux, un second h2 « Flux métier » répète le titre dans la liste.

### 7.2 Jetons

Deux noms pour les mêmes idées. Les jetons historiques (`--bg`, `--surface`, `--text`, `--primary`, `--ok`, `--warning`, `--high`, `--critical`, `--unknown`) sont ceux que la majorité des règles utilisent. Un alias plus récent (`--color-bg`, `--color-surface`, `--space-1` … `--space-8`, `--radius-sm|md|lg`) ne couvre qu’une partie des écrans (palette, tiroir, workspace flux).

Tons sémantiques prévus :

| Jeton | Rôle produit | Exemples |
| --- | --- | --- |
| ok | nominal | opérationnel, résolu, connecté |
| warning | à surveiller | dégradé, détecté, cloud indisponible, anomalie ouverte |
| high | sérieux non terminal | heartbeat absent, incident ouvert ou en analyse |
| critical | rupture | indisponible, hors service, en correction |
| unknown | non qualifié | inconnu, clos, anomalie fermée |

Écart de sens à connaître : une anomalie **fermée** et un incident **clos** partagent le ton `unknown`, le même que « on ne sait pas ». Le gris ne distingue pas « terminé » et « non déterminé ».

Les fonds de ton (`--ok-bg`, etc.) existent. Le second bloc sombre (`prefers-color-scheme: dark`, vers la ligne 852) **ne les redéfinit pas**. Il redéfinit fond, surface, texte, bordure, primaire et ombre. Les couleurs d’état du premier bloc sombre, plus haut dans le fichier, restent celles qui s’appliquent si aucune règle plus spécifique ne les écrase.

### 7.3 Thème

Trois mécanismes se superposent.

1. `<meta name="color-scheme" content="dark">` demande des contrôles de formulaire sombres au navigateur.
2. Le premier `:root` déclare `color-scheme: light` et une palette claire. Un bloc « polish » plus bas **réécrit la palette claire sans condition**. Puis une media query `prefers-color-scheme: dark` réécrit une partie des jetons.
3. Le bouton d’en-tête pose `data-theme="light"` ou `data-theme="dark"` sur `<html>`, et mémorise le choix. Seul `data-theme="light"` a une règle de jetons. **Il n’existe pas de bloc `data-theme="dark"`.**

Conséquence pour un expert qui ouvre l’écran :

| Système | Bouton affiché | Résultat réel |
| --- | --- | --- |
| OS clair, aucun choix enregistré | « Thème sombre » | palette claire du `:root` inconditionnel |
| OS clair, clic pour passer au sombre | le bouton passe à « Thème clair » | `data-theme="dark"` ne change aucun jeton. L’écran reste clair |
| OS sombre, aucun choix | « Thème sombre » | media query sombre, partielle |
| OS sombre, choix « clair » | « Thème clair » | la règle `data-theme="light"` gagne sur la media query |

Le texte du bouton nomme le thème courant. Le `aria-label` nomme l’action inverse (« Activer le thème clair » quand le bouton affiche « Thème sombre »). Les deux ne disent pas la même chose.

La navigation a été écrite un temps avec un fond fixe `#0e141b`. Une règle plus bas la repasse à `background: var(--surface)`. Le rail n’est pas un bandeau sombre distinct du contenu, sauf si la surface elle-même est sombre.

Le fond de page porte un `radial-gradient` bleu très léger en haut à gauche. En thème sombre OS, les cartes KPI, panneaux et tableaux reçoivent en plus un `linear-gradient` sur la surface.

### 7.4 Composants de base

| Composant | Rôle | Variantes |
| --- | --- | --- |
| `ui-button` | action | primary (défaut), secondary, ghost, loading |
| `ui-banner` | message de page | info, warning, error, success |
| `ui-field` | label, hint, erreur, `aria-describedby` | — |
| `ui-skeleton` | placeholder | existe ; les pages utilisent plutôt `state-panel` |
| `status-badge` | état | tons ci-dessus ; `announce-state` ajoute le libellé métier en sr-only quand le texte visible est un nom de source |
| `state-panel` | vide, erreur, chargement | titre, message, action optionnelle |
| `filter-bar` | flotte seulement | — |
| `flows-filter-bar` | flux et incidents | — |
| `pagination-controls` | flotte seulement | — |
| `ui-modal` | dialogue centré, focus trap | appareil, enrôlement |
| `ui-drawer` | panneau droit, focus trap | incident |
| `command-palette` | dialogue de commande | — |
| `kpi-card` | carte chiffre | monté nulle part via l’écran courant |

Boutons de liste (« Détail », « Ouvrir », noms cliquables) : classe `detail-button`, lien souligné, pas un bouton primaire. C’est le geste d’ouverture standard des tableaux.

Pastilles de source (Balena, MQTT, Teams) : le mot visible est le nom du système. La couleur porte l’état. Un texte sr-only ajoute « Opérationnel », « Hors service », etc. quand `announce-state` est posé. Ailleurs, la pastille dit l’état en toutes lettres (« Dégradé », « Hors service »).

### 7.5 Densité et alignement

Grilles récurrentes :

| Zone | Colonnes au large |
| --- | --- |
| Santé vue d’ensemble | 2 |
| Compteurs dans un bloc de santé | 4 |
| KPI flotte | 5, puis 3 / 2 / 1 |
| Workspace flux | liste + colonne 18–24 rem |
| Workspace anomalies | liste + colonne 18–26 rem |
| Workspace événements | liste + colonne 20–28 rem |
| Connexions admin | 3 |
| Seuils admin | 2 |
| Faits de modale | label 0,7 fr + valeur 1,5 fr |
| Tiroir | une colonne d’actions |

Les workspaces passent à une colonne vers 900 px (flux) ou 1 100 px (anomalies, événements). Le détail sticky redevient un bloc sous la liste.

---

## 8. États d’interface

| Situation | Traitement |
| --- | --- |
| Premier chargement sans relevé | `state-panel` « Chargement… », `aria-busy` |
| Relevé absent après échec | panneau erreur + Réessayer |
| Erreur alors qu’un relevé est déjà là | bannière, les données restent |
| Connexion coupée | bannière warning sous l’en-tête, sur toutes les vues |
| Relevé périmé | pastille « Données anciennes » dans le bloc replié Sources |
| Actualisation | bouton en `loading`, `aria-busy` sur la région, texte « Actualisation… » dans le résumé flotte |
| Liste filtrée vide | panneau « Aucun résultat » + réinitialiser |
| Collection vraiment vide | panneau dédié (flotte vide renvoie vers Configuration) |
| Source partielle sur la vue d’ensemble | la synthèse du plan manquant ne tombe pas à zéro ; l’activité le dit |
| Mutation d’incident | `aria-busy` sur main, annonce live « Enregistrement… » |
| Secret déjà enregistré | hint « laisser vide pour conserver », jamais la valeur |

Annonces live (`aria-live="polite"`) : nombre d’appareils, de flux, d’anomalies, d’événements, et les phrases d’action. Une seule région, dans `main`. Un chargement en chasse le précédent.

Échap au niveau fenêtre, dans cet ordre, et un seul à la fois : événement sélectionné, puis appareil, puis anomalie. Le tiroir, la modale et la palette ont leur propre écoute. Ces écoutes ne stoppent pas la propagation. Échap dans la palette ferme donc aussi le détail d’événement, d’appareil ou d’anomalie qui était ouvert derrière, si l’un d’eux l’était. L’anomalie et l’événement ne rendent pas la page `inert` : la palette peut s’ouvrir par-dessus.

---

## 9. Accessibilité déjà en place

Constats de code, pas un audit de lecteur d’écran.

- `lang="fr"`, skip link « Aller au contenu » vers `#main-content` (`z-index: 100`).
- Navigation `aria-label="Navigation principale"`, page courante en `aria-current="page"` sur les enfants.
- Régions nommées (`aria-labelledby`) sur les sections d’écran.
- Tableaux avec `caption` sr-only et `scope="col"`.
- Tri de la table appareils : `aria-sort`.
- Champs : label visible, hint relié, `aria-invalid` sur plusieurs champs admin.
- Dialogues : `role="dialog"`, `aria-modal`, titre, focus initial, rappel du focus, piège Tab, Échap.
- `inert` sur le shell pendant modale, tiroir, assistant, palette.
- Pastille : la couleur n’est pas le seul canal quand le libellé d’état est écrit, ou quand `announce-state` complète un nom de source.
- `prefers-reduced-motion` : animations coupées.
- `prefers-contrast: more` : bordures épaissies sur pastille, carte, bannière, bouton.
- `pointer: coarse` : cibles d’au moins 44 px sur bouton, champ, lien de détail, fermeture, tri.
- Temps relatifs avec `title` ou `<time datetime>` en absolu sur une partie des listes. Pas partout : certains âges de la vue d’ensemble n’ont l’absolu qu’en `title`.

Écarts utiles à un expert :

- Le parent « Problèmes » n’expose pas un état développé / courant distinct de ses enfants. Il est à la fois lien et titre de groupe.
- Les groupes de navigation n’ont pas de libellé visible « Regarder » / « Traiter ». L’eyebrow de section prévu (`.app-nav__label`) n’est pas dans le template.
- Titres de palette, types de résultat et une annonce sr-only (« WebSocket connected ») sont en anglais dans une page française.
- Section « Events liés » dans le diagnostic de flux.
- Sous 700 px, la liste appareils affiche la table **et** les cartes. Aucune règle ne masque la table. L’information est doublée, et le nom accessible l’est deux fois.
- Les listes flux, incidents, anomalies et événements ne sont pas paginées. Le DOM suit la taille du relevé.
- Le focus de tri et de filtre n’est pas déplacé après un changement de hash, sauf Incidents et Flux qui tentent de focaliser `#flows-search` quand on y arrive depuis la palette par une commande de navigation.

---

## 10. Responsive

Points de rupture réellement utilisés : **1 100, 900, 800, 700, 430**. Ils ne forment pas une échelle unique. Plusieurs media queries répètent les mêmes ajustements parce que la feuille a été étendue par couches.

| Seuil | Shell |
| --- | --- |
| > 1 100 px | grille 210 px + contenu, workspaces en deux colonnes, KPI flotte sur 5 |
| ≤ 1 100 px | navigation 168 px, workspaces anomalies et événements en une colonne, connexions admin en une colonne |
| ≤ 900 px | workspace flux en une colonne, tiroir à 72 vw, compteurs de santé encore en ligne |
| ≤ 800 px | blocs de santé et leurs compteurs passent en 2 colonnes |
| ≤ 700 px | le shell quitte la grille : colonne, hauteur automatique, scroll de page. Navigation horizontale qui passe à la ligne, marque « WATCHDOG » masquée. En-tête empilé. Héros empilés. KPI flotte en 2. Cartes appareils **en plus** de la table |
| ≤ 430 px | KPI flotte en 1 colonne, faits de modale en 1 colonne, actions de barre en pleine largeur |

Le tiroir passe à 100 % de largeur sous 700 px, sans bord gauche. La modale était déjà `min(680px, 100%)`.

La navigation sous 700 px reste une suite de boutons qui wrap, pas un menu. « Problèmes » et ses trois enfants restent tous visibles. Rien n’est caché derrière un bouton menu.

---

## 11. Incohérences à traiter en priorité

Classement pour un expert UI : d’abord ce qui change la compréhension, ensuite ce qui change le dessin.

### Compréhension

1. **Trois patrons pour ouvrir un objet.** Appareil = modale. Incident = tiroir. Flux, anomalie, événement = colonne à droite de la liste. Le geste mental « voir le détail » n’a pas une seule forme. Sous 900 px les colonnes tombent sous la liste, donc le détail de flux ressemble soudain à une page, alors que l’incident reste un tiroir.
2. **Un seul lien profond.** L’incident est partageable. Le flux, l’anomalie, l’événement et l’appareil ne le sont pas. Toute discussion d’URL ou de retour arrière doit partir de là.
3. **Filtres et recherche partagés entre Flux et Incidents.** Un filtre sans effet visible sur l’écran courant. Une recherche posée sur un écran suit l’opérateur sur l’autre.
4. **Compteur Événements.** Même pilule que les alertes, valeur = volume du journal, pas un nombre de problèmes.
5. **Bouton « Problèmes ».** Il navigue vers les incidents et s’allume aussi sur Anomalies et Événements. Le groupe n’a pas de libellé de section distinct du lien.
6. **Carte « Alertes » de la flotte.** Ses voisines filtrent la table. Elle non. Le clic attendu n’existe pas.
7. **Deux h2 et deux phrases presque identiques** sur Appareils : « Appareils surveillés » puis « Appareils à surveiller ».
8. **Deux chronologies.** Vue d’ensemble = mélange plafonné à 8. Page Appareils = transitions de flotte seulement. Aucune des deux ne dit son périmètre dans le titre autant que le contenu le mérite (« Activité récente » versus « Activité flotte » est le seul indice).
9. **Ton `unknown` pour « clos » et pour « on ne sait pas ».** Fermé, clos et inconnu se ressemblent.
10. **Vocabulaire mélange.** Français produit (appareil, flux, incident) et anglais d’implémentation (device, Events liés, Command Center Navigation, FLOW, WebSocket connected). Le filtre flotte dit « Service terrain » là où la fiche dit encore le protocole.
11. **Thème.** Le bouton promet un thème sombre que les jetons ne réalisent pas quand l’OS est clair. Le meta `color-scheme` et les deux palettes ne décrivent pas le même défaut.

### Dessin et système

12. **`index.css` est une pile de shells.** Bandeau du haut, puis polish, puis admin, puis « shell opérationnel », puis « command center V2 », puis rail, puis santé. La règle qui gagne est la dernière de spécificité égale. Un expert qui maquette doit lire la feuille depuis la fin. Des classes ne sont plus dans les templates : `overview-hero`, `overview-kpis`, `overview-grid`, `overview-situation`, `watch-table`, `watch-scopes`, `app-nav__journal`, `app-nav__label`.
13. **Deux échelles de jetons** (`--bg` et `--color-bg`, espacements en dur et `--space-*`). Les écrans ne sont pas tous sur la même échelle.
14. **`flows-kpis` et `kpi-card` ne sont pas utilisés** par les écrans montés. La flotte redessine ses cartes à la main. La vue d’ensemble utilise `health-block`, pas ces KPI.
15. **Table et cartes appareils ensemble sous 700 px.**
16. **Points de rupture non alignés** (1 100, 900, 800, 700, 430) et media queries dupliquées.
17. **Dégradés** réservés au fond de page et, en sombre OS, aux cartes. Le reste est plat. Un refonte doit décider si ce dégradé reste.
18. **z-index** : skip link 100, palette 70, tiroir 60, modale 50, en-tête 20. Une modale ouverte en même temps qu’un tiroir passerait dessous. Le flux normal évite ce cas via `inert`, pas via une règle d’exclusivité visuelle.

---

## 12. Parcours à juger

Pour une revue experte, ces parcours suffisent à voir l’architecture. Ils ne sont pas une recette de test.

1. Arrivée sans hash. Lire l’en-tête, le bloc replié Sources, les deux blocs de santé, la liste À traiter, l’activité. Vérifier qu’un plan absent ne s’affiche pas comme un zéro.
2. Ouvrir un incident depuis À traiter. Enchaîner note, transition, résolution. Fermer. Contrôler le retour de focus et le hash.
3. Depuis le tiroir, passer au flux. Lire Pourquoi, la chaîne, les liens. Revenir aux incidents de ce flux et observer la recherche préremplie.
4. Ouvrir une anomalie, puis son événement, puis le payload. Enchaîner vers le flux.
5. Appareils : cliquer chaque KPI, le filtre Source en défaut, le tri, la pagination, la fiche, la copie d’UUID. Descendre jusqu’à l’activité flotte.
6. Configuration : lire les trois connexions, modifier un seuil, annuler, enregistrer. Ouvrir l’assistant jusqu’à l’étape 2 sans valider. Regarder un secret déjà hinté et non réaffiché.
7. Ctrl+K sans texte, puis avec un identifiant. Fermer avec Échap en ayant un détail d’anomalie ouvert derrière.
8. Réduire à 1 000 px, 800 px, 700 px et 400 px. Regarder le passage du rail au wrap, la chute des workspaces, et le double rendu table + cartes.
9. OS clair et OS sombre, puis le bouton de thème dans les deux cas. Comparer en-tête, navigation, pastilles, champs password.

---

## 13. Hors périmètre

- Moteur d’états, anti-flap Teams, projection Modbus : comportement produit, pas dessin. Résumé dans `ANALYSE-APPLICATION.md`.
- Node-RED, ports, authentification de l’éditeur.
- Performance mesurée. Le code pagine la flotte à 50 et peint les autres listes en entier. Aucune mesure de frame ou de volume n’accompagne cet audit.
- Conformité RGAA formelle. La section 9 liste ce que le code pose, pas un constat de lecteur d’écran.

---

## 14. Fichiers lus

| Fichier | Rôle pour l’audit |
| --- | --- |
| `uibuilder/watchdog-hub/src/index.html` | coquille, ordre des scripts, `color-scheme` |
| `uibuilder/watchdog-hub/src/index.css` | jetons, shell, écrans, cascade |
| `uibuilder/watchdog-hub/src/app.js` | composition, routes vers composants, flotte inline, surcouches |
| `uibuilder/watchdog-hub/src/utils/hash-router.js` | carte des hash |
| `uibuilder/watchdog-hub/src/components/fleet/app-nav.js` | navigation |
| `uibuilder/watchdog-hub/src/components/fleet/fleet-header.js` | en-tête et thème |
| `uibuilder/watchdog-hub/src/components/overview-page.js` | vue d’ensemble |
| `uibuilder/watchdog-hub/src/components/flows/flows-page.js` | flux et incidents |
| `uibuilder/watchdog-hub/src/components/flows/flow-list.js` | table flux |
| `uibuilder/watchdog-hub/src/components/flows/flow-detail.js` | diagnostic |
| `uibuilder/watchdog-hub/src/components/flows/incident-list.js` | liste incidents |
| `uibuilder/watchdog-hub/src/components/flows/incident-detail.js` | tiroir |
| `uibuilder/watchdog-hub/src/components/anomalies/anomalies-page.js` | anomalies |
| `uibuilder/watchdog-hub/src/components/events/events-page.js` | événements |
| `uibuilder/watchdog-hub/src/components/admin/admin-page.js` | configuration |
| `uibuilder/watchdog-hub/src/components/admin/enroll-wizard.js` | assistant |
| `uibuilder/watchdog-hub/src/components/ui/*` | primitives |
| `uibuilder/watchdog-hub/src/utils/formatters.js` | tons appareils |
| `uibuilder/watchdog-hub/src/utils/flows-formatters.js` | tons flux et incidents |
| `uibuilder/watchdog-hub/src/utils/command-palette-selector.js` | périmètre de recherche |
