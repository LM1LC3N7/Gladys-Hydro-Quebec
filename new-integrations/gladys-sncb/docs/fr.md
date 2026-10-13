# SNCB / NMBS

**Connecteur non officiel, sans lien avec la SNCB/NMBS ni iRail.** Il amène
les trains belges dans Gladys via [iRail](https://docs.irail.be/), l'API
communautaire au-dessus des données ouvertes de la SNCB : sans compte ni clé.
SNCB/NMBS est une marque de la Société nationale des chemins de fer belges.

## Ce que vous obtenez

| Surface                         | Contenu                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un appareil par **gare suivie** | minutes avant le prochain départ, trains retardés et supprimés, et pour chacun des prochains départs (3 par défaut) : le compte à rebours, le retard et une ligne de texte « IC 2514 → Dinant · voie 6 · +4 min » |
| L'appareil **Réseau SNCB**      | le nombre de perturbations et de travaux prévus, la dernière perturbation                                                                                                                                         |
| Déclencheurs de scène           | **train imminent** (1 à 15 minutes avant le départ), **train retardé, supprimé ou déplacé** (retard d'au moins 5 à 30 minutes, suppression, changement de voie), **perturbation publiée**                         |
| Actions de scène                | **prochains départs** d'une gare (liste, prochain train, destination, compte à rebours, retard, voie), **perturbations** du réseau                                                                                |
| Widgets                         | **Départs SNCB** (une gare) et **Perturbations SNCB** (le réseau, avec les textes et liens de la SNCB)                                                                                                            |

## Installation

1. Installez l'intégration. Les gares les plus proches de votre maison (la
   position de la maison dans Gladys) sont proposées dans **Découverte** tout
   de suite : ajoutez celles que vous utilisez.
2. Pour suivre d'autres gares, saisissez-les dans **Gares à suivre**,
   séparées par des virgules : un nom (`Namur`, `Brussel-Centraal` et
   `Bruxelles-Central` fonctionnent tous deux) ou un identifiant iRail
   (`BE.NMBS.008863008`). Le bouton **Chercher des gares** donne les noms
   exacts.
3. Facultatif, par gare : un **filtre de destination** après `@` ne garde que
   les trains allant vers ces lieux (`Bruxelles-Central@Namur|Dinant`), et un
   **nom personnalisé** après `:` nomme l'appareil (`...:Train du retour`).
   Enregistrez, puis rouvrez **Découverte** et ajoutez les appareils.
4. Placez le widget **Départs SNCB** sur un tableau de bord et choisissez une
   gare.

Chaque gare suivie est lue toutes les 60 secondes (option **Intervalle de
rafraîchissement**), les perturbations toutes les 5 minutes. Un départ
disparaît dès que le train est parti.

## Scènes

- **Train imminent** : choisissez la gare et le nombre de minutes ; la scène
  s'exécute quand un train de cette gare atteint ce seuil. Avec un filtre de
  destination sur la gare, seuls vos trains comptent. Variables : le train,
  la destination, la voie, le retard, les minutes restantes.
- **Train retardé, supprimé ou déplacé** : choisissez la gare et
  l'événement. Pour « Retardé », aussi le retard minimum : la scène
  s'exécute une fois par train quand son retard l'atteint, pas à chaque
  rafraîchissement.
- **Perturbation publiée** : la SNCB a publié un nouvel avis. Nécessite
  l'appareil Réseau SNCB. Variables : le titre, la description, le lien.

L'action **prochains départs** donne `{{list}}` (une ligne par train) et
`{{next_train}}`, `{{next_destination}}`, `{{next_minutes}}`,
`{{next_delay}}`, `{{next_platform}}` pour un message ou une condition ;
**perturbations** donne `{{count}}`, `{{titles}}` et `{{latest}}`.

## Dépannage

- **Une gare n'est pas trouvée** : iRail connaît les gares par leurs noms
  officiels dans chaque langue ; utilisez **Chercher des gares** avec une
  partie du nom.
- **« iRail est injoignable »** : iRail est un service tenu par des
  bénévoles ; il revient de lui-même, l'intégration réessaie à chaque
  rafraîchissement.
- **Aucun départ dans l'heure** : iRail liste environ une heure de départs ;
  une petite gare peut n'avoir rien le soir.
- Logs : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL`.

## Confidentialité

L'intégration n'envoie à iRail que les identifiants des gares qu'elle lit.
La position de la maison sert, dans l'intégration, à choisir les gares les
plus proches et ne la quitte jamais.
