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
  période de facturation en cours ($).
- **Température extérieure moyenne** de la dernière journée publiée par
  Hydro-Québec.
- **Solde du compte** ($).
- **Panne en cours** (oui/non), pour l'adresse de consommation du contrat.

Si le contrat est inscrit au **Crédit Hivernal (tarif D, option CPC)**, vous
obtenez aussi : le crédit cumulé et projeté ($), l'état courant (normal /
ancre / ancre critique / pointe / pointe critique) et si une pointe critique
ou une période de préchauffage approche.

Si le contrat est facturé au **tarif Flex D (DPC)**, vous obtenez aussi :
l'état courant (normal / pointe critique), si une pointe ou un préchauffage
est en cours, les heures critiques appelées depuis le début de l'hiver, et le
gain/la perte par rapport au tarif de base.

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

Consultez les logs de l'intégration depuis l'interface Gladys (ou
`docker logs` sur l'hôte) avec `LOG_LEVEL=debug` pour le détail complet de
chaque requête envoyée à Hydro-Québec.
