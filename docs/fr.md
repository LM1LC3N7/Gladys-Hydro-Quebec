# Hydro-Québec

Suivez votre compte Hydro-Québec directement dans Gladys : consommation par
demi-heure, coût calculé par Gladys selon votre tarif (Tarif D, Flex D),
température extérieure moyenne, solde du compte, pannes et, si vous êtes
inscrit aux options tarifaires dynamiques, les pointes du Crédit hivernal
(CPC) et de Flex D (DPC).

Nécessite **Gladys 5.2** ou plus récent.

## Ce que vous obtenez

Un appareil Gladys est créé **par contrat Hydro-Québec** sur votre compte
(un seul identifiant peut couvrir plusieurs contrats : résidence principale,
logement locatif, chalet...). Chaque appareil expose :

- **Consommation (30 min)** (kWh) : la consommation horaire d'Hydro-Québec,
  chaque heure répartie en deux demi-heures égales. Hydro-Québec publie une
  journée avec environ un jour de retard : chaque demi-heure est enregistrée
  à sa date réelle. Gladys y ajoute de lui-même une fonctionnalité **coût**,
  calculée par le contrat d'énergie que vous lui associez (voir plus bas).
- **Coût moyen par jour (période en cours)** ($) : la moyenne par jour de la
  période de facturation en cours, selon Hydro-Québec.
- **Température extérieure moyenne** de la dernière journée publiée par
  Hydro-Québec (enregistrée à la date de cette journée).
- **Solde du compte** ($).
- **Panne en cours** (oui/non), pour l'adresse de consommation du contrat.

Si le contrat est inscrit au **Crédit hivernal (tarif D, option CPC)**, vous
obtenez aussi : le crédit cumulé et projeté ($), l'état courant (normal /
ancre / ancre critique / pointe / pointe critique), si une pointe critique
approche, et si le préchauffage avant une pointe **critique** est en cours
(pas avant les pointes quotidiennes ordinaires).

Si le contrat est facturé au **tarif Flex D (DPC)**, vous obtenez aussi :
l'état courant (normal / pointe critique), si une pointe ou un préchauffage
est en cours, les heures critiques appelées depuis le début de l'hiver, et le
gain/la perte par rapport au tarif de base.

Les états de pointe basculent **à la minute près** quand un préchauffage ou
une pointe critique commence ou se termine, et non au rafraîchissement
suivant. Pendant les heures où Hydro-Québec annonce les pointes du
lendemain (de 10 h 30 à 15 h, heure de l'Est), l'intégration vérifie les
nouvelles annonces toutes les 15 minutes.

## Coût de votre électricité

L'intégration fournit à Gladys deux modèles de contrat, **Hydro-Québec –
Tarif D** et **Hydro-Québec – Flex D** (grille du 1er avril 2026), ainsi
que le calendrier des pointes Flex D. Pour obtenir le coût de votre
consommation :

1. Ajoutez l'appareil de votre contrat depuis l'onglet **Découverte** (ou
   cliquez sur **Mettre à jour** s'il existait déjà).
2. Dans Gladys, ouvrez **Intégrations → Suivi de l'énergie → Contrats** et
   créez un contrat : choisissez comme compteur l'appareil de votre contrat
   Hydro-Québec, puis le modèle **Tarif D** ou **Flex D**. Au Crédit
   hivernal, choisissez **Tarif D** : le crédit lui-même reste suivi par les
   fonctionnalités « Crédit hivernal » de l'appareil.
3. C'est tout : Gladys calcule le coût de chaque demi-heure, l'affiche dans
   ses graphiques d'énergie et dans le widget **Prix de l'électricité**, et
   le déclencheur de scène **Changement de prix de l'électricité** suit les
   changements de palier et les pointes.

Pour Flex D, les demi-heures des pointes critiques sont lues sur les données
ouvertes d'Hydro-Québec et publiées dans le calendrier `hq-critical-peaks` :
leur énergie est facturée au prix de pointe et ne compte pas dans le palier
de 40 kWh par jour. Une pointe annulée avant son début redevient normale.

À la première connexion, l'intégration récupère la consommation depuis le
1er du mois en cours, afin que les paliers du mois soient comptés en entier
(10 jours par rafraîchissement : le rattrapage peut prendre quelques heures).

## Déclencheurs de scène

Dans l'éditeur de scènes, rubrique **Intégrations** :

- **Pointe critique Hydro-Québec annoncée** : Hydro-Québec a annoncé une
  pointe critique, généralement la veille ;
- **Préchauffage Hydro-Québec commencé** : le préchauffage avant une pointe
  critique vient de commencer (sa durée est le réglage « Durée de
  préchauffage ») ;
- **Pointe critique Hydro-Québec commencée** / **terminée**.

Chacun peut être limité à un contrat et aux pointes du matin ou du soir, et
transmet aux actions de la scène le jour, l'heure de début et l'heure de fin
de la pointe, par exemple pour un message : « Pointe critique demain de
6 h à 10 h ». La première lecture après le démarrage de l'intégration ne les
déclenche jamais : un redémarrage ne réannonce pas les pointes déjà connues.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Entrez le même **courriel/identifiant** et **mot de passe** que pour vous
   connecter à `session.hydroquebec.com`.
3. Ajustez l'**intervalle de rafraîchissement** au besoin (Hydro-Québec ne
   publie la consommation qu'avec environ un jour de délai : interroger plus
   vite que toutes les 30-60 minutes n'apporte pas de données
   supplémentaires).
4. Enregistrez : vos contrats apparaissent dans l'onglet **Découverte**.

## Actions

- **Tester la connexion** — tente une vraie connexion à Hydro-Québec et
  affiche le succès ou la raison exacte de l'échec sous le bouton.

## Testé et confirmé fonctionnel

Cette intégration a été validée avec un vrai compte Hydro-Québec et une
vraie instance Gladys, pas seulement des tests automatisés :

- La connexion, la découverte des contrats, et l'ajout d'un appareil découvert
  depuis l'onglet Découverte.
- Un compte avec **plus d'un compteur sous le même abonnement** (un contrat
  principal et un secondaire) — chacun rapportant correctement ses propres
  données distinctes.
- La boucle de rafraîchissement, y compris le premier relevé qui apparaît
  juste après l'enregistrement de la configuration.
- Un contrat sans période de facturation en cours côté Hydro-Québec (ex. un
  compteur secondaire ou récemment ajouté) : la température, le solde et
  l'état des pannes continuent d'être publiés, seul le coût moyen par jour
  reste vide pour celui-ci.

**Pas encore confirmé sur un vrai compte** :

- la consommation par demi-heure et son coût calculé par Gladys (nouveau
  dans cette version) ;
- les valeurs des pointes Crédit hivernal (CPC) et Flex D (DPC) : elles sont
  calculées à partir des mêmes valeurs qu'utilise l'intégration Home
  Assistant pour Hydro-Québec, mais aucun compte inscrit à l'une de ces
  options n'a encore utilisé cette intégration.

Si quelque chose semble incorrect, merci d'ouvrir une issue.

## Notes importantes

- Cette intégration est développée de façon indépendante et **n'est pas
  supportée par Hydro-Québec** : ne contactez pas le service à la clientèle
  d'Hydro-Québec à son sujet. Si Hydro-Québec modifie son portail,
  l'authentification ou l'API peuvent cesser de fonctionner ; merci d'ouvrir
  une issue sur le dépôt le cas échéant.
- Votre mot de passe est stocké chiffré par Gladys (champ `secret`) et n'est
  transmis qu'aux serveurs d'Hydro-Québec.
- Le coût calculé par Gladys est une estimation : Hydro-Québec facture
  environ tous les deux mois, Gladys compte les paliers par mois. L'écart
  n'apparaît que si un mois très gourmand et un mois léger tombent dans la
  même facture. Le Crédit hivernal n'est pas déduit de ce coût.
- Les tarifs changent chaque 1er avril : une nouvelle version des modèles
  suivra, et Gladys vous proposera de mettre votre contrat à jour.

## Mise à jour depuis une version précédente

L'onglet **Découverte** signale un changement de structure : cliquez sur
**Mettre à jour**. La **consommation quotidienne** est remplacée par la
consommation par demi-heure (son historique est supprimé), et le « coût
quotidien moyen » devient le **coût moyen par jour (période en cours)**, un
simple montant en dollars (son historique est conservé).

## Dépannage

Le statut de connexion affiché dans l'écran de configuration passe au rouge,
avec la raison, lorsque **tous** les contrats du compte ont échoué à leur
dernier rafraîchissement (Hydro-Québec injoignable, mot de passe changé...).
Il redevient vert de lui-même au prochain rafraîchissement réussi : inutile
de réenregistrer la configuration. Un seul contrat en échec sur un compte qui
en a plusieurs n'est signalé que dans les logs.

Consultez les logs de l'intégration depuis l'interface Gladys (ou
`docker logs` sur l'hôte) avec `LOG_LEVEL=debug` pour le détail complet de
chaque requête envoyée à Hydro-Québec.
