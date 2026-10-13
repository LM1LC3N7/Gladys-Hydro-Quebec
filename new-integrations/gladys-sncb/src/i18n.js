// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widgets).
// -----------------------------------------------------------------------------

export const T = {
  ok: (stations) => ({
    en: `Watching ${stations} station${stations === 1 ? '' : 's'} through iRail.`,
    fr: `${stations} gare${stations > 1 ? 's' : ''} suivie${stations > 1 ? 's' : ''} via iRail.`,
  }),
  noStation: {
    en: 'No station yet: open Discovery and add a station, or type stations in the configuration.',
    fr: 'Aucune gare : ouvrez Découverte et ajoutez une gare, ou saisissez des gares dans la configuration.',
  },
  unreachable: (message) => ({
    en: `iRail is unreachable: ${message}. Retrying at the next refresh.`,
    fr: `iRail est injoignable : ${message}. Nouvel essai au prochain rafraîchissement.`,
  }),
  unknownStation: (query) => ({
    en: `Unknown station "${query}": check the spelling (the "Search stations" button helps).`,
    fr: `Gare inconnue « ${query} » : vérifiez l'orthographe (le bouton « Chercher des gares » aide).`,
  }),
  widget: {
    noStation: {
      en: 'Pick a station in the widget settings',
      fr: 'Choisissez une gare dans les réglages du widget',
    },
    notLoaded: { en: 'Waiting for the first reading…', fr: 'En attente de la première lecture…' },
    noDeparture: { en: 'No departure in the next hour', fr: 'Aucun départ dans l’heure' },
    none: { en: 'No disturbance on the network', fr: 'Aucune perturbation sur le réseau' },
    inMinutes: (m) => ({
      en: m === 0 ? 'now' : `in ${m} min`,
      fr: m === 0 ? 'maintenant' : `dans ${m} min`,
    }),
    disturbances: { en: 'SNCB disturbances', fr: 'Perturbations SNCB' },
    planned: { en: 'Planned works', fr: 'Travaux prévus' },
    disturbance: { en: 'Disturbance', fr: 'Perturbation' },
    readAt: { en: 'Updated', fr: 'Mis à jour' },
  },
};
