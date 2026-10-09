# Hydro-Québec

Suivez votre compte Hydro-Québec directement dans Gladys : consommation
quotidienne, température extérieure moyenne, solde du compte, pannes et, si
vous êtes inscrit aux options tarifaires dynamiques, les pointes du Crédit
Hivernal (CPC) et de Flex D (DPC).

## Ce que vous obtenez

Un appareil Gladys est créé **par contrat Hydro-Québec** sur votre compte
(un seul identifiant peut couvrir plusieurs contrats : résidence principale,
logement locatif, chalet...). Chaque appareil expose :

- **Consommation quotidienne** (kWh) et **coût quotidien moyen** de la
  période de facturation en cours ($). Hydro-Québec publie la consommation
  d'une journée avec 1 à 2 jours de retard : chaque valeur est enregistrée
  une seule fois, à la date de la journée mesurée, pour apparaître au bon
  jour dans les graphiques.
- **Température extérieure moyenne** de la dernière journée publiée par
  Hydro-Québec (enregistrée elle aussi à la date de cette journée).
- **Solde du compte** ($).
- **Panne en cours** (oui/non), pour l'adresse de consommation du contrat.

Si le contrat est inscrit au **Crédit Hivernal (tarif D, option CPC)**, vous
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

## Déclencheurs de scène

Nécessite Gladys 5.1 ou plus récent. Dans l'éditeur de scènes, rubrique
**Intégrations** :

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
   met à jour la consommation quotidienne qu'une fois par jour, avec 1 à 2
   jours de délai : interroger plus vite que toutes les 30-60 minutes
   n'apporte pas de données supplémentaires).
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
  compteur secondaire ou récemment ajouté) : la consommation, la
  température, le solde et l'état des pannes continuent d'être publiés,
  seul le coût quotidien reste vide pour celui-ci.
- La consommation, la température, le solde et les pannes au tarif de base
  « D », sur plusieurs cycles de rafraîchissement successifs.

**Pas encore confirmé de façon indépendante** : les valeurs des pointes
Crédit Hivernal (CPC) et Flex D (DPC) sont calculées directement à partir
des mêmes valeurs déjà calculées qu'utilise l'intégration Home Assistant
pour Hydro-Québec, mais aucun compte inscrit à l'une de ces options n'a
encore utilisé cette intégration — si c'est votre cas et que quelque chose
semble incorrect, merci d'ouvrir une issue.

## Notes importantes

- Cette intégration est développée de façon indépendante et **n'est pas
  supportée par Hydro-Québec** : ne contactez pas le service à la clientèle
  d'Hydro-Québec à son sujet. Si Hydro-Québec modifie son portail,
  l'authentification ou l'API peuvent cesser de fonctionner ; merci d'ouvrir
  une issue sur le dépôt le cas échéant.
- Votre mot de passe est stocké chiffré par Gladys (champ `secret`) et n'est
  transmis qu'aux serveurs d'Hydro-Québec.
- Le « coût quotidien moyen » est la moyenne $/jour de la période de
  facturation en cours, pas un détail exact jour par jour : l'API gratuite
  d'Hydro-Québec n'en expose pas pour le tarif de base « D ».

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
