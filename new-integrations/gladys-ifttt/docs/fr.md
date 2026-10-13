# IFTTT

**Connecteur non officiel, sans lien avec IFTTT.** Il relie les scènes de
Gladys au [service Webhooks d'IFTTT](https://ifttt.com/maker_webhooks) : une
scène peut déclencher n'importe quel applet à l'écoute d'un nom d'événement et,
avec Gladys Plus, un applet peut lancer une scène Gladys. IFTTT est une marque
d'IFTTT Inc.

## Ce que vous obtenez

| Surface                                                  | Contenu                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Action de scène **Déclencher un événement IFTTT**        | nom d'événement + `value1`, `value2`, `value3` (les ingrédients de l'applet)                                                                                       |
| Action de scène **Déclencher un événement IFTTT (JSON)** | nom d'événement + un objet JSON (l'ingrédient « JSON payload » de l'applet)                                                                                        |
| Déclencheur de scène **Événement IFTTT reçu**            | se déclenche quand un applet (ou tout client HTTP) appelle le webhook entrant relayé par Gladys Plus, avec le nom de l'événement, `value1..3` et les autres champs |
| Widget **Bouton IFTTT**                                  | un bouton qui déclenche un événement, avec confirmation facultative                                                                                                |
| Bouton **Envoyer un événement de test**                  | vérifie la clé et affiche l'URL entrante                                                                                                                           |

Rien ne tourne en arrière-plan : l'intégration ne parle à IFTTT que quand une
scène, un bouton ou un webhook le lui demande.

## Installation

1. Sur [ifttt.com/maker_webhooks](https://ifttt.com/maker_webhooks), cliquez
   sur **Documentation** : la page affiche votre clé (« Your key is: ... »).
2. Installez l'intégration, collez la clé dans **Clé Webhooks IFTTT**,
   enregistrez, puis cliquez sur **Envoyer un événement de test**.
3. Dans IFTTT, créez un applet dont le **If This** est **Webhooks → Receive a
   web request** avec le nom d'événement de votre choix (lettres, chiffres et
   tirets bas, par exemple `cafe_on`), et le **Then That** que vous voulez.
4. Dans une scène Gladys, ajoutez l'action **Déclencher un événement IFTTT**
   avec ce nom. `value1`, `value2` et `value3` acceptent les variables de
   scène (`{{device.salon.temperature}}`).

Un compte IFTTT gratuit limite le nombre d'applets ; le service Webhooks
lui-même ne limite pas le nombre d'événements.

## D'IFTTT vers Gladys (Gladys Plus)

Une Gladys à la maison n'est pas joignable depuis Internet : Gladys Plus
relaie les requêtes entrantes.

1. Liez Gladys Plus, ouvrez l'intégration et collez votre **clé Open API**
   dans le bloc **Webhooks Gladys Plus** : Gladys affiche l'URL publique du
   webhook « Événements IFTTT entrants » (le bouton **Envoyer un événement de
   test** la répète).
2. Dans IFTTT, créez un applet avec l'action **Webhooks → Make a web
   request** : URL = cette URL, méthode **POST**, content type
   **application/json**, corps :

   ```json
   { "event": "depart_maison", "value1": "{{OccurredAt}}" }
   ```

   Toute autre clé du corps est relayée dans la variable `payload` (en JSON).
   Un `GET` avec `?event=depart_maison&value1=...` fonctionne aussi.

3. Dans Gladys, créez une scène avec le déclencheur **Événement IFTTT reçu**
   et le nom de l'événement comme filtre (laissez vide pour réagir à tous).
   Les variables `{{triggerEvent.data.value1}}`, etc. sont disponibles dans
   les actions suivantes.

L'URL est un secret. Pour une vérification supplémentaire, renseignez un
**secret partagé** dans la configuration et ajoutez `"secret": "<valeur>"` au
corps envoyé par IFTTT : les requêtes sans lui sont ignorées.

## Tableau de bord

Le widget **Bouton IFTTT** affiche un titre, une légende et un bouton qui
déclenche l'événement de ses réglages (avec une `value1` facultative). Cochez
**Demander une confirmation** pour une action à conséquences.

## Dépannage

- **« IFTTT a refusé la clé Webhooks »** : la clé est fausse ou révoquée ;
  recopiez-la depuis la page Documentation du service Webhooks.
- **L'applet ne s'exécute pas** : le nom d'événement doit être exactement
  celui saisi dans l'applet (sensible à la casse) ; vérifiez l'activité de
  l'applet sur IFTTT.
- **« Les événements entrants nécessitent Gladys Plus »** : sans Plus, le
  sens sortant fonctionne toujours ; seul le déclencheur a besoin du relais.
- Logs : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL` (`debug` montre chaque appel).

## Confidentialité

L'intégration n'envoie à IFTTT que ce que vos scènes mettent dans les
événements. La clé est stockée chiffrée par Gladys et ne quitte jamais votre
instance, sauf pour joindre `maker.ifttt.com`.
