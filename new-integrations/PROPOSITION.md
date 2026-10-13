# Nouveaux modules Gladys : proposition et priorités (13 octobre 2026)

Ce dossier `new-integrations/` est une **zone de préparation** : chaque
sous-dossier est un futur dépôt GitHub autonome (`LM1LC3N7/<nom>`), prêt à être
copié tel quel dans un dépôt vide (voir « Créer les dépôts » en bas). Rien ici
n'est utilisé par l'intégration Hydro-Québec elle-même.

## Sources croisées

| Source | Ce qui en a été tiré |
| --- | --- |
| [Gist de Pierre-Gilles](https://gist.github.com/Pierre-Gilles/9c4ba77a0faa47c4ea67c74351db9094) (12 oct.) | 1 190 idées, 115 P1, statut « en cours » et usage Home Assistant |
| [Catalogue du store](https://gladysassistant.com/docs/integrations/external/) (13 oct.) | 146 intégrations publiées, aucune ne doit être refaite |
| Forum, [fil des revendications](https://community.gladysassistant.com/t/10385) (85 messages) et catégorie Développement (297 sujets) | qui a pris quoi, y compris les 25 intégrations publiées par guim31 les 12 et 13 octobre |
| Mes 20 dépôts `gladys-*` | conventions (SDK 0.15, `node --test`, Release workflow, CLAUDE.md, docs fr/en), et mes propres revendications |

Retirés de la liste parce que **déjà publiés ou en cours** (P1) : MET Norway,
Wake on LAN + Ping, FRITZ!Box, Brother, Sonoff/eWeLink, Workday + jours
fériés, ONVIF, Waste Collection (Will_71), DWD, WiZ, Bambu Lab, Google Nest,
HomeWizard, Denon HEOS (via mon Denon/Marantz), Sony Bravia, Ecowitt
(cicoub13), Nord Pool, Lutron (moi, matériel attendu), Buienradar, Philips
TV, Remote calendar ICS, Wemo (prohand), Pi-hole, OctoPrint, GitHub, Glances,
Rachio, Kodi, Uptime Kuma, Viessmann (bertrandda), Gotify, Team Tracker
(prohand), Linky TIC (sujet LiXee), MétéoSuisse (valentinhttr), transports
GTFS génériques (ruegerth/Transitous), Music Assistant (abandonné, API
instable).

Écartés après vérification technique :

- **Google Calendar** (P1 n° 8, 7,5 % HA) : le type `calendar` de Gladys 5.2
  refuse `oauth2`/`account_link` dans `account_schema` (OAuth par utilisateur
  « milestone ultérieur »). Un seul compte Google pour tout le foyer n'a pas
  de sens, et la lecture est déjà couverte par « Agendas ICS ». À reprendre
  dès que le cœur accepte l'OAuth par utilisateur.
- **Vigicrues** (P1 n° 107) : `vigicrues.gouv.fr/services/*` coupe la
  connexion depuis un conteneur cloud (WAF) ; impossible de valider les
  réponses. Hub'Eau (hauteurs d'eau) répond, mais sans la vigilance, qui est
  tout l'intérêt. Remplacé par la SNCB (API iRail publique, testée).
- **Xbox** (P1 n° 23) : chaque utilisateur devrait créer une application
  Azure ; l'API console (SmartGlass) est en fin de vie.
- **Waze Travel Time** et **Solcast** (mes revendications du 13 oct.) :
  recoupent « Mapbox Traffic » (qleg) et « Forecast.Solar » (prohand).
  Pierre-Gilles accepte la concurrence, mais la consigne « sans doublons »
  les met en bas de liste ; à faire si tu veux honorer la revendication.

## Classement : impact pour la communauté × attrait pour les nouveaux

Critères : usage Home Assistant (proxy de la demande), poids dans les pays
francophones / de ma couverture (CA, DE, NL, BE), possibilité de l'utiliser
**sans matériel ni compte payant** (le premier contact d'un nouveau venu), et
ce que le module apporte aux **scènes** et au **tableau de bord** de Gladys
(déclencheurs, actions avec sorties, widgets, contrats d'énergie).

| # | Module | Dépôt à créer | Pourquoi | Scènes / dashboard | Complexité |
| --- | --- | --- | --- | --- | --- |
| 1 | **tado°** | `gladys-tado` | P1 n° 32, 2,6 % HA, n° 1 du chauffage connecté en Europe (FR, BE, CH, DE) ; aucune autre intégration de chauffage « grand public » n'est libre dans la liste | thermostats (consigne, mode, chauffe), présence du foyer, eau chaude, déclencheurs « fenêtre ouverte », « tout le monde est parti », actions « consigne pendant N minutes », widget maison | élevée : OAuth « device code » (`account_link`), API v2 + tado X, construit à l'aveugle |
| 2 | **IFTTT** | `gladys-ifttt` | P1 n° 64, 1,5 % HA, mondial, gratuit : le pont vers des milliers de services (Alexa, Google Home, SmartThings, Philips Hue, Notion…) que personne ne développera un à un | action de scène « déclencher un événement IFTTT » (3 valeurs + JSON), déclencheur « événement IFTTT reçu » via Gladys Plus, bouton de test | faible |
| 3 | **Tibber** | `gladys-tibber` | P1 n° 40, 2,3 % HA, NO/SE/DE/NL ; jumeau logique de Nord Pool, avec en plus la conso réelle et le Pulse en temps réel | prix courant/niveau, heures creuses, puissance live, coût du jour ; déclencheurs « niveau de prix », « période creuse », « puissance au-dessus de » ; widget ; contrat d'énergie délégué | moyenne (GraphQL + websocket) |
| 4 | **SNCB / NMBS** | `gladys-sncb` | P1 n° 114 (STIB) et P2 n° 393 : la Belgique, 2e communauté francophone, n'a **aucun** transport dans le store ; API iRail publique, sans clé ni compte | prochains départs par gare (retard, quai, annulé), perturbations ; déclencheurs « train retardé/annulé », « perturbation sur ma ligne » ; widget « Prochains trains » | faible (même patron que mes 7 intégrations canadiennes) |
| 5 | **Orange Livebox** | `gladys-livebox` | P1 n° 103, FAI n° 1 en France (≈ 40 % des foyers) ; la Freebox a la sienne depuis juillet, la Livebox rien | présence par appareil Wi-Fi (le détecteur de présence le plus demandé), état WAN/débits, Wi-Fi invité on/off, appels manqués ; déclencheurs « appareil connecté/déconnecté », « appel manqué » | moyenne, à l'aveugle (API sysbus) |
| 6 | STIB-MIVB Bruxelles | `gladys-stib` | P1 n° 114, Bruxelles ; complète la SNCB | départs temps réel, perturbations | faible, clé API gratuite |
| 7 | Tankerkönig | `gladys-tankerkoenig` | P1 n° 75, prix carburants Allemagne (le « Prix carburants » FR est le module le plus noté du store) | station la moins chère, déclencheur « prix sous un seuil », widget | faible, clé gratuite |
| 8 | Bring! | `gladys-bring` | P1 n° 72, liste de courses familiale ; très visuel pour un nouveau | widget liste avec formulaire « ajouter », action « ajouter un article », déclencheur « article ajouté » | faible, API non officielle |
| 9 | Blitzortung | `gladys-blitzortung` | P1 n° 87, foudre à proximité ; effet « waouh » | déclencheur « éclair à moins de X km », widget | moyenne, dépend d'un relais MQTT communautaire |
| 10 | Flux RSS | `gladys-rss` | P2 n° 187, universel, zéro compte ; les actualités sur le tableau de bord | widget liste, déclencheur « nouvel article » | faible |
| 11 | MQTT discovery (format HA) | `gladys-mqtt-discovery` | P1 n° 110 : fait entrer d'un coup Tasmota, OpenMQTTGateway, Valetudo, rtl_433… | appareils génériques | élevée |
| 12 | Discord | `gladys-discord` | P2 n° 215, canal de discussion bidirectionnel gratuit | chat avec Gladys, notifications | moyenne |

Les cinq premiers sont construits dans ce dossier (ordre de livraison : IFTTT,
tado°, Tibber, SNCB, Livebox). Les sept suivants sont prêts à être pris dans
la foulée, sans doublon connu au 13 octobre.

## Description à donner à chaque dépôt GitHub

- `gladys-tado` — Gladys Assistant external integration for tado° heating
  (V3+, V3, V2 and tado X): thermostats, hot water, home presence, open
  window detection, scene triggers and actions. Unofficial, not affiliated
  with tado.
- `gladys-ifttt` — Gladys Assistant external integration for IFTTT: trigger
  IFTTT applets from scenes (Webhooks service) and start Gladys scenes from
  IFTTT through Gladys Plus webhooks. Unofficial, not affiliated with IFTTT.
- `gladys-tibber` — Gladys Assistant external integration for Tibber:
  electricity prices and levels, cheap hours, consumption and cost, Tibber
  Pulse live power, scene triggers, dashboard widget and energy contract.
  Unofficial, not affiliated with Tibber.
- `gladys-sncb` — Gladys Assistant external integration for the Belgian
  railways (SNCB/NMBS) through the iRail API: next departures per station,
  delays, cancellations, platform changes, disturbances, scene triggers and a
  dashboard widget. Unofficial, not affiliated with SNCB or iRail.
- `gladys-livebox` — Gladys Assistant external integration for the Orange
  Livebox (3, 4, 5, 6, 7): Wi-Fi presence of your devices, internet link
  state and rates, guest Wi-Fi, missed calls, scene triggers. Local, no
  cloud. Unofficial, not affiliated with Orange.

## Créer les dépôts

Pour chaque module, dans l'ordre :

1. Créer le dépôt public `LM1LC3N7/<nom>` (description ci-dessus, licence
   Apache-2.0, « Private vulnerability reporting » activé).
2. Copier le contenu de `new-integrations/<nom>/` à la racine du dépôt
   (fichiers cachés `.github/`, `.gitignore`, `.dockerignore`,
   `.prettierrc.json` compris), puis `npm install`, `npm test`, commit.
3. Lancer **Actions → Release → patch** : premier tag `0.1.0` → image sur
   ghcr.io ; rendre le paquet public.
4. Ajouter le topic `gladys-assistant-integration`, poster le fil
   « Intégration externe - … » dans Développement, et répondre « je prends X »
   dans le fil 10385 (tado°, IFTTT, Tibber, SNCB, Livebox).

Chaque module a son `TODO.md` avec ce qu'il reste à vérifier sur une vraie
instance et, pour les trois construits à l'aveugle (tado°, Livebox, Tibber
Pulse), les points à confirmer avec un testeur.
