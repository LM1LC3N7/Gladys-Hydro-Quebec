# Tibber

**Connecteur non officiel, sans lien avec Tibber.** Il amène votre compte
Tibber dans Gladys : les prix horaires de l'électricité de votre maison
(aujourd'hui et demain), le niveau de prix Tibber, votre consommation et,
avec un Tibber Pulse ou Watty, la puissance en direct. Tibber est une marque
de Tibber AS. Disponible là où Tibber vend de l'électricité : Norvège, Suède,
Allemagne et Pays-Bas.

## Ce que vous obtenez

| Surface                         | Contenu                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un appareil par **maison**      | prix actuel, prix suivant, moyenne, minimum et maximum du jour (par kWh, TVA incluse), le niveau Tibber (très bon marché à très cher), un capteur « période creuse », la consommation par demi-heure pour le suivi énergétique de Gladys, la consommation et le coût d'hier |
| Avec un **Pulse / Watty**       | puissance en direct, production, consommation et coût du jour, tensions et courants des trois phases                                                                                                                                                                        |
| Déclencheurs de scène           | **début / fin des heures creuses** (les N heures les moins chères du jour), **niveau de prix modifié**, **prix de demain publiés**, **seuil de puissance franchi** (500 W à 11 kW, à la hausse ou à la baisse)                                                              |
| Actions de scène                | **prix actuel** (prix, niveau, heures creuses, prix suivant, chiffres du jour, fenêtre la moins chère) et **heures les moins chères** (les N heures consécutives les moins chères des 24 prochaines heures, d'aujourd'hui ou de demain)                                     |
| Widgets                         | **Prix Tibber** (maintenant, ensuite, moyennes, niveau, heures creuses, courbe d'aujourd'hui et de demain) et **Puissance Tibber en direct** (jauge, kWh et coût du jour, pic, tensions, courants)                                                                          |
| Contrat d'énergie (Gladys 5.2+) | un modèle **Tibber** par pays : chaque demi-heure de votre compteur est tarifée depuis vos prix horaires Tibber, plus l'abonnement mensuel                                                                                                                                  |

## Installation

1. Sur [developer.tibber.com](https://developer.tibber.com/settings/access-token),
   connectez-vous avec votre compte Tibber et créez un **jeton d'accès
   personnel**.
2. Installez l'intégration, collez le jeton dans **Jeton d'accès**,
   enregistrez, puis cliquez sur **Tester la connexion** : vos maisons et leur
   prix actuel s'affichent.
3. Ouvrez **Découverte** et ajoutez l'appareil de chaque maison.
4. Placez le widget **Prix Tibber** (et **Puissance Tibber en direct** avec
   un Pulse) sur un tableau de bord, choisissez la maison.

Les prix sont lus au démarrage et toutes les heures ; ceux de demain sont
demandés à partir de 12 h 45 toutes les 10 minutes jusqu'à leur publication
(vers 13 h). Les capteurs bougent à chaque créneau de prix (horaire, ou
toutes les 15 minutes là où Tibber y est passé). La consommation est lue
toutes les heures.

## Scènes

- **Début / fin des heures creuses** : le créneau actuel entre dans les N
  heures les moins chères du jour ou en sort (N = **Heures creuses par
  jour**, 4 par défaut). Lancer le chauffe-eau, la recharge de la voiture, le
  lave-linge.
- **Niveau de prix modifié** : le niveau Tibber du prix (par rapport à la
  moyenne des derniers jours) a changé ; filtrez sur les nouveaux niveaux.
- **Prix de demain publiés** : une fois par jour, avec la moyenne, les
  extrêmes et la fenêtre la moins chère de demain, pour une notification.
- **Seuil de puissance franchi** : la puissance du Pulse est passée au-dessus
  ou en dessous du nombre de watts choisi. Prévenir quand le four et la
  recharge tournent en même temps.

Deux actions de scène pour une condition ou un message qui suit : **prix
actuel** donne `{{price}}`, `{{level}}`, `{{cheap}}`, `{{next_price}}`,
`{{avg_price}}`, `{{window_start_time}}`… ; **heures les moins chères**
donne le début et la fin (`{{start_time}}`, `{{end_time}}`, `{{start}}` et
`{{end}}` en dates ISO pour un « attendre jusqu'à »), `{{minutes_until_start}}`
et l'économie par rapport à la période.

## Suivi énergétique (Gladys 5.2 ou plus récent)

Dans **Suivi de l'énergie → Contrats**, créez un contrat depuis le modèle
**Tibber** de votre pays, choisissez l'appareil de la maison Tibber comme
compteur et renseignez l'abonnement mensuel. Gladys demande alors à
l'intégration de tarifer chaque demi-heure depuis votre propre historique de
prix Tibber (prix de l'énergie, TVA incluse) ; les coûts apparaissent à côté
de la consommation comme pour tout contrat. La **consommation** de
l'appareil est la consommation horaire rapportée par Tibber, répartie en
deux demi-heures égales, publiée avec environ une heure de retard.

Avec un Pulse, Gladys affiche aussi la puissance en direct et le coût du
jour directement depuis Tibber.

## Dépannage

- **« Tibber a refusé le jeton »** : le jeton a été révoqué ou mal copié ;
  créez-en un nouveau sur developer.tibber.com.
- **« Aucune maison avec un abonnement actif »** : le compte n'a pas encore
  de contrat Tibber en cours.
- **Pas de puissance en direct** : la maison doit avoir un Tibber Pulse ou
  Watty avec la consommation en temps réel activée dans l'application
  Tibber, et l'option **Puissance en direct** cochée. La ligne d'état dit
  « puissance en direct sur <maison> » quand le flux est connecté.
- **Prix de demain absents** : Tibber les publie vers 13 h heure locale ;
  l'intégration redemande toutes les 10 minutes.
- Logs : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL`.

## Confidentialité

Le jeton est stocké chiffré par Gladys et envoyé uniquement aux serveurs de
Tibber (`api.tibber.com`, `websocket-api.tibber.com`). Votre adresse ne sert
qu'à nommer l'appareil quand la maison n'a pas de surnom.
