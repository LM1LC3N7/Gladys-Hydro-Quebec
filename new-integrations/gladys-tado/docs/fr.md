# tado°

**Connecteur non officiel, sans lien avec tado.** Il amène votre chauffage
tado° dans Gladys : les thermostats et têtes thermostatiques des générations
V3+, V3 et V2, l'eau chaude, la climatisation, et les pièces de tado X. tado
est une marque de tado GmbH.

## Ce que vous obtenez

| Surface                                               | Contenu                                                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Un appareil par **maison**                            | à la maison (capteur de présence), mode de présence (automatique / maison / absent), température extérieure, intensité solaire, météo                                                                  |
| Un appareil par **zone de chauffage**                 | consigne, mode (arrêt / manuel / programmation), état et puissance de chauffe, température, humidité, fenêtre ouverte détectée, batterie faible                                                        |
| Un appareil par zone **eau chaude**                   | marche/arrêt, mode, consigne si le système le permet                                                                                                                                                   |
| Un appareil par zone **climatisation**                | marche/arrêt, mode (auto, froid, chaud, déshumidification, ventilation), consigne, température, humidité                                                                                               |
| En option : un appareil par **téléphone** géolocalisé | à la maison / absent                                                                                                                                                                                   |
| Déclencheurs de scène                                 | présence modifiée, fenêtre ouverte détectée, chauffe démarrée / arrêtée, batterie faible                                                                                                               |
| Actions de scène                                      | régler une température (jusqu'au prochain bloc, pour une durée, ou jusqu'à modification), retour à la programmation, régler la présence, lire une zone                                                 |
| Widgets                                               | **Maison tado°** (présence, extérieur, toutes les zones, boutons Maison / Absent / Auto) et **Zone tado°** (température, humidité, consigne, jauge de chauffe, mode, +/− 0,5 °C, programmation, arrêt) |

## Installation

1. Installez l'intégration et ouvrez son écran **Configuration**.
2. Cliquez sur **Lier mon compte tado°** : une page de connexion tado s'ouvre
   dans un nouvel onglet. Connectez-vous et approuvez l'accès. Aucun mot de
   passe n'est stocké dans Gladys : tado remet à l'intégration une session
   qu'elle renouvelle elle-même.
3. De retour dans Gladys, l'état passe au vert en quelques secondes et les
   maisons et zones apparaissent dans **Découverte** : ajoutez les appareils
   voulus.
4. Placez les widgets sur un tableau de bord, choisissez la maison ou la zone.

La session reste valable tant que l'intégration tourne au moins une fois par
mois. Après un long arrêt, l'état vous demande de lier à nouveau le compte.

## Consignes

Une consigne envoyée depuis Gladys (le widget thermostat, une scène, le
widget de zone) est un **réglage manuel** dans tado, comme sur l'appareil.
L'option **Une consigne manuelle dure** décide quand il se termine : au
prochain bloc de la programmation tado (par défaut), après une durée fixe, ou
à la prochaine modification. L'action de scène **régler une température**
peut le changer scène par scène.

Passer le mode sur **Programmation** termine le réglage manuel (tado reprend
son programme) ; **Arrêt** éteint la zone (la protection hors gel reste du
côté de tado).

## Scènes

- **Présence modifiée** : la maison est passée Maison → Absent ou Absent →
  Maison, par géolocalisation ou changement manuel. Baisser les lumières,
  armer l'alarme.
- **Fenêtre ouverte détectée** : tado a mis en pause le chauffage d'une zone
  parce qu'une fenêtre est ouverte. Envoyer une notification.
- **Chauffe démarrée / arrêtée** : la puissance de chauffe est passée
  au-dessus de zéro ou revenue à zéro. Piloter un circulateur, compter les
  heures de chauffe.
- **Batterie faible** : un thermostat ou une tête de la zone signale une
  batterie faible.

Les actions **régler une température** et **retour à la programmation**
renvoient les valeurs de la zone ; **lire une zone** les donne pour une
condition qui suit (`{{temperature}}`, `{{heating}}`, `{{open_window}}`…).

## Confidentialité

L'intégration ne parle qu'aux serveurs de tado (`login.tado.com`,
`my.tado.com`, `hops.tado.com`). Les capteurs de présence des téléphones
sont désactivés par défaut : ils exposent où se trouvent les membres du
foyer.

## Dépannage

- **« tado° a refusé la session enregistrée »** : la session a expiré
  (30 jours sans usage) ou a été révoquée dans l'application tado. Cliquez à
  nouveau sur **Lier mon compte tado°**.
- **L'état dit « en attente de votre approbation »** : terminez la
  connexion dans l'onglet ouvert ; le lien est valable 5 minutes.
- **Les valeurs bougent lentement** : tado est lu toutes les 2 minutes par
  défaut (option **Intervalle de rafraîchissement**). Une commande rafraîchit
  sa maison immédiatement.
- **Une zone eau chaude n'a pas de consigne** : votre installation ne gère
  que marche/arrêt (tado le signale).
- **tado X** : construit d'après la documentation publique de l'API hops,
  sans le matériel ; signalez ce qui ne correspond pas dans le fil du forum.
