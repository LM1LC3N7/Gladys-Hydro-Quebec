// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys. Every text is a { en, fr } object.
// -----------------------------------------------------------------------------

export const T = {
  noPassword: {
    en: 'No Livebox password: type the admin password (by default the first 8 characters of the Wi-Fi key) in the configuration.',
    fr: 'Aucun mot de passe Livebox : saisissez le mot de passe admin (par défaut les 8 premiers caractères de la clé Wi-Fi) dans la configuration.',
  },
  badCredentials: {
    en: 'The Livebox refused the login: check the password (the one of http://livebox/, user "admin").',
    fr: 'La Livebox a refusé la connexion : vérifiez le mot de passe (celui de http://livebox/, utilisateur « admin »).',
  },
  unreachable: (host, message) => ({
    en: `The Livebox at ${host} does not answer: ${message}. Retrying at the next refresh.`,
    fr: `La Livebox à ${host} ne répond pas : ${message}. Nouvel essai au prochain rafraîchissement.`,
  }),
  ok: ({ model, online, tracked, internet }) => ({
    en: `${model ?? 'Livebox'}: internet ${internet ? 'up' : 'DOWN'}, ${online} device${online === 1 ? '' : 's'} online, ${tracked} tracked.`,
    fr: `${model ?? 'Livebox'} : internet ${internet ? 'OK' : 'COUPÉ'}, ${online} appareil${online > 1 ? 's' : ''} en ligne, ${tracked} suivi${tracked > 1 ? 's' : ''}.`,
  }),
  rebooting: {
    en: 'Reboot requested: the Livebox is restarting (about 2 minutes).',
    fr: 'Redémarrage demandé : la Livebox redémarre (environ 2 minutes).',
  },
  widget: {
    internet: { en: 'Internet', fr: 'Internet' },
    up: { en: 'Connected', fr: 'Connecté' },
    down: { en: 'Disconnected', fr: 'Coupé' },
    link: { en: 'Link', fr: 'Liaison' },
    ip: { en: 'Public IP', fr: 'IP publique' },
    uptime: { en: 'Uptime', fr: 'Allumée depuis' },
    wifi: { en: 'Wi-Fi', fr: 'Wi-Fi' },
    guest: { en: 'Guest Wi-Fi', fr: 'Wi-Fi invité' },
    on: { en: 'On', fr: 'Activé' },
    off: { en: 'Off', fr: 'Désactivé' },
    online: { en: 'Online', fr: 'En ligne' },
    wifiOnline: { en: 'On Wi-Fi', fr: 'En Wi-Fi' },
    missed: { en: 'Missed calls', fr: 'Appels manqués' },
    rate: { en: 'Line', fr: 'Ligne' },
    notLoaded: { en: 'Waiting for the first reading…', fr: 'En attente de la première lecture…' },
    noDevice: { en: 'No device online', fr: 'Aucun appareil en ligne' },
    devices: { en: 'Devices online', fr: 'Appareils en ligne' },
    wifiOn: { en: 'Wi-Fi on', fr: 'Wi-Fi on' },
    wifiOff: { en: 'Wi-Fi off', fr: 'Wi-Fi off' },
    guestOn: { en: 'Guest on', fr: 'Invité on' },
    guestOff: { en: 'Guest off', fr: 'Invité off' },
  },
};
