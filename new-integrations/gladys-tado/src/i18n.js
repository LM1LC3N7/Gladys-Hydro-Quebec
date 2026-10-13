// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widgets).
// Every text is a { en, fr } object: Gladys picks the user's language.
// -----------------------------------------------------------------------------

export const T = {
  notLinked: {
    en: 'No tado° account linked: click "Link my tado° account" in the configuration.',
    fr: 'Aucun compte tado° lié : cliquez sur « Lier mon compte tado° » dans la configuration.',
  },
  linking: (url) => ({
    en: `Waiting for your approval: open ${url} and sign in to tado°.`,
    fr: `En attente de votre approbation : ouvrez ${url} et connectez-vous à tado°.`,
  }),
  linkExpired: {
    en: 'The sign-in link expired: click "Link my tado° account" again.',
    fr: 'Le lien de connexion a expiré : cliquez à nouveau sur « Lier mon compte tado° ».',
  },
  tokenExpired: {
    en: 'tado° refused the saved session (it expires after 30 days without use): link the account again.',
    fr: 'tado° a refusé la session enregistrée (elle expire après 30 jours sans usage) : liez le compte à nouveau.',
  },
  ok: (homes, zones) => ({
    en: `Connected: ${homes} home${homes > 1 ? 's' : ''}, ${zones} zone${zones > 1 ? 's' : ''}.`,
    fr: `Connecté : ${homes} maison${homes > 1 ? 's' : ''}, ${zones} zone${zones > 1 ? 's' : ''}.`,
  }),
  unreachable: (message) => ({
    en: `tado° is unreachable: ${message}. Retrying at the next refresh.`,
    fr: `tado° est injoignable : ${message}. Nouvel essai au prochain rafraîchissement.`,
  }),
  unlinked: {
    en: 'Account unlinked. The devices stay in Gladys until you delete them.',
    fr: 'Compte délié. Les appareils restent dans Gladys tant que vous ne les supprimez pas.',
  },
  presence: {
    home: { en: 'Home', fr: 'Maison' },
    away: { en: 'Away', fr: 'Absent' },
    auto: { en: 'Automatic', fr: 'Automatique' },
    unknown: { en: 'Unknown', fr: 'Inconnu' },
  },
  mode: {
    off: { en: 'Off', fr: 'Arrêt' },
    manual: { en: 'Manual', fr: 'Manuel' },
    schedule: { en: 'Schedule', fr: 'Programmation' },
    timer: { en: 'Timer', fr: 'Minuterie' },
    untilNext: { en: 'Until next block', fr: "Jusqu'au prochain bloc" },
  },
  widget: {
    target: { en: 'Target', fr: 'Consigne' },
    temperature: { en: 'Temperature', fr: 'Température' },
    humidity: { en: 'Humidity', fr: 'Humidité' },
    heatingPower: { en: 'Heating', fr: 'Chauffe' },
    outside: { en: 'Outside', fr: 'Extérieur' },
    presence: { en: 'Presence', fr: 'Présence' },
    openWindow: { en: 'Open window', fr: 'Fenêtre ouverte' },
    lowBattery: { en: 'Low battery', fr: 'Batterie faible' },
    offline: { en: 'Offline', fr: 'Hors ligne' },
    mode: { en: 'Mode', fr: 'Mode' },
    nextChange: { en: 'Next change', fr: 'Prochain changement' },
    resume: { en: 'Schedule', fr: 'Programmation' },
    off: { en: 'Off', fr: 'Arrêt' },
    warmer: { en: '+0.5 °C', fr: '+0,5 °C' },
    cooler: { en: '−0.5 °C', fr: '−0,5 °C' },
    home: { en: 'Home', fr: 'Maison' },
    away: { en: 'Away', fr: 'Absent' },
    auto: { en: 'Auto', fr: 'Auto' },
    yes: { en: 'Yes', fr: 'Oui' },
    no: { en: 'No', fr: 'Non' },
    noZone: {
      en: 'Pick a zone in the widget settings',
      fr: 'Choisissez une zone dans les réglages du widget',
    },
    noHome: {
      en: 'Pick a home in the widget settings',
      fr: 'Choisissez une maison dans les réglages du widget',
    },
    notLoaded: { en: 'Waiting for the first reading…', fr: 'En attente de la première lecture…' },
    done: { en: 'Done', fr: 'Fait' },
    failed: (message) => ({ en: `tado°: ${message}`, fr: `tado° : ${message}` }),
  },
};

export function weatherLabel(state) {
  const labels = {
    SUN: { en: 'Sunny', fr: 'Ensoleillé' },
    CLOUDY: { en: 'Cloudy', fr: 'Nuageux' },
    CLOUDY_PARTLY: { en: 'Partly cloudy', fr: 'Partiellement nuageux' },
    CLOUDY_MOSTLY: { en: 'Mostly cloudy', fr: 'Très nuageux' },
    NIGHT_CLEAR: { en: 'Clear night', fr: 'Nuit claire' },
    NIGHT_CLOUDY: { en: 'Cloudy night', fr: 'Nuit nuageuse' },
    RAIN: { en: 'Rain', fr: 'Pluie' },
    DRIZZLE: { en: 'Drizzle', fr: 'Bruine' },
    SNOW: { en: 'Snow', fr: 'Neige' },
    FOGGY: { en: 'Fog', fr: 'Brouillard' },
    THUNDERSTORMS: { en: 'Thunderstorms', fr: 'Orages' },
    WINDY: { en: 'Windy', fr: 'Venteux' },
    SCATTERED_RAIN: { en: 'Scattered rain', fr: 'Averses' },
    SCATTERED_SNOW: { en: 'Scattered snow', fr: 'Averses de neige' },
  };
  return labels[state] ?? { en: state ?? '-', fr: state ?? '-' };
}
