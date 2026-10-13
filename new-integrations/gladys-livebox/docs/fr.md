# Livebox Orange

**Connecteur non officiel, sans lien avec Orange.** Il parle à votre Livebox
sur le réseau local, via la même API que la page d'administration de la box
(http://livebox/) : rien ne sort de chez vous. Fonctionne avec les Livebox 3,
4, 5, 6 et 7 (firmware Sagemcom / Sercomm). Livebox est une marque d'Orange.

## Ce que vous obtenez

| Surface                                 | Contenu                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L'appareil **Livebox**                  | internet connecté, type de liaison (fibre, ADSL/VDSL), IP publique, durée de fonctionnement, interrupteurs **Wi-Fi** et **Wi-Fi invité**, appareils en ligne (total et en Wi-Fi), appels manqués et dernier appel de la ligne fixe, et sur une box xDSL les débits descendant / montant |
| Un **capteur de présence par appareil** | chaque téléphone, tablette, TV ou ordinateur que la box connaît en Wi-Fi (et en Ethernet si vous le demandez), nommé comme dans la Livebox : la détection « qui est à la maison » la plus simple                                                                                        |
| Déclencheurs de scène                   | **appareil connecté**, **appareil déconnecté**, **appel manqué**, **internet rétabli ou coupé**                                                                                                                                                                                         |
| Actions de scène                        | **appareils en ligne** (nombre et noms), **Wi-Fi on / off** (principal ou invité), **redémarrer**                                                                                                                                                                                       |
| Widgets                                 | **Livebox** (état, liaison, durée, compteurs, boutons Wi-Fi) et **Appareils Livebox** (qui est en ligne)                                                                                                                                                                                |

## Installation

1. Installez l'intégration. L'adresse `192.168.1.1` et l'utilisateur
   `admin` conviennent à une Livebox standard ; changez-les si besoin.
2. Saisissez le **mot de passe d'administration** : celui de
   http://livebox/. Par défaut, ce sont les 8 premiers caractères de la clé
   Wi-Fi imprimée sur la box (ou celui que vous avez défini dans les
   réglages de la Livebox).
3. Enregistrez, cliquez sur **Tester la connexion** : le modèle, le
   firmware et l'état d'internet s'affichent.
4. Ouvrez **Découverte** : la Livebox et tous les appareils Wi-Fi qu'elle
   connaît sont proposés. Ajoutez la box et les appareils à suivre (vos
   téléphones pour la présence, la TV pour « quand la TV s'allume »…).
   Cochez **appareils filaires** dans la configuration pour proposer aussi
   ceux en Ethernet.
5. Placez les widgets sur un tableau de bord.

Tout est lu toutes les 30 secondes par défaut (**Intervalle de
rafraîchissement**) ; les informations de la box toutes les 10 minutes, la
ligne xDSL toutes les 5.

## Scènes

- **Appareil connecté / déconnecté** : choisissez un appareil suivi, ou
  laissez vide pour tous. « Téléphone connecté » est le « je suis rentré »
  classique ; ajoutez un délai à la déconnexion pour absorber un téléphone
  qui s'endort.
- **Appel manqué** : la ligne fixe a sonné sans réponse ; les variables
  portent le numéro et le nom de l'appelant (quand la box le connaît).
  Envoyez une notification avec `{{triggerEvent.data.number}}`.
- **Internet rétabli ou coupé** : pour une notification, ou une scène de
  surveillance : après 10 minutes de coupure, lancer l'action
  **redémarrer**.
- L'action **appareils en ligne** donne `{{online}}`, `{{wifi_online}}` et
  `{{names}}` ; **Wi-Fi on / off** bascule le réseau principal ou invité
  (mode nuit, arrivée d'invités).

Les capteurs de présence sont des capteurs de présence Gladys ordinaires :
ils fonctionnent avec les déclencheurs natifs « maison vide » et
« quelqu'un est rentré », et avec l'alarme.

## Dépannage

- **« La Livebox a refusé la connexion »** : le mot de passe est celui de
  la page d'administration, pas la clé Wi-Fi elle-même (ses 8 premiers
  caractères par défaut). Certaines box bloquent la connexion quelques
  minutes après plusieurs échecs.
- **« La Livebox ne répond pas »** : vérifiez l'adresse ; l'intégration
  tourne dans un conteneur sur l'hôte Gladys, qui doit joindre la box (même
  réseau, ou une route vers elle).
- **Un appareil ne passe jamais « absent »** : la Livebox garde un appareil
  « actif » un moment après son départ (plusieurs minutes en Wi-Fi) ; un
  téléphone en veille profonde peut aussi disparaître et revenir. Utilisez
  un délai dans la scène.
- **Pas de débit descendant / montant** : ils viennent de la ligne xDSL ;
  une box fibre ne rapporte que l'état d'internet et l'IP.
- **Pas d'appels manqués** : la ligne fixe doit être sur la box (VoIP) et
  le journal lisible avec ce compte ; décochez **Lire le journal d'appels**
  sinon.
- Logs : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL`.

## Confidentialité

Le mot de passe est stocké chiffré par Gladys et envoyé uniquement à la box
sur votre réseau local. Les noms d'appareils, adresses et le journal
d'appels restent dans Gladys.
