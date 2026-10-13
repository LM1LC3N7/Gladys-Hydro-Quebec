// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widget).
// Every text is a { en, fr } object: Gladys picks the user's language.
// -----------------------------------------------------------------------------

export const T = {
  noKey: {
    en: 'No IFTTT Webhooks key: paste it in the configuration (ifttt.com/maker_webhooks/settings).',
    fr: 'Aucune clé Webhooks IFTTT : collez-la dans la configuration (ifttt.com/maker_webhooks/settings).',
  },
  ready: (inbound) => ({
    en: `Ready to trigger IFTTT applets.${inbound ? ' Inbound webhook relayed by Gladys Plus.' : ' Inbound events need Gladys Plus.'}`,
    fr: `Prêt à déclencher des applets IFTTT.${inbound ? ' Webhook entrant relayé par Gladys Plus.' : ' Les événements entrants nécessitent Gladys Plus.'}`,
  }),
  testOk: (event, answer) => ({
    en: `IFTTT accepted the event "${event}": ${answer}`,
    fr: `IFTTT a accepté l'événement « ${event} » : ${answer}`,
  }),
  testFailed: (code, message) => ({
    en: `IFTTT refused the test (${code}): ${message}`,
    fr: `IFTTT a refusé le test (${code}) : ${message}`,
  }),
  inboundUrl: (url) => ({
    en: `\nInbound URL for IFTTT (Make a web request): ${url}`,
    fr: `\nURL entrante pour IFTTT (Make a web request) : ${url}`,
  }),
  inboundMissing: {
    en: '\nNo inbound URL: link Gladys Plus and paste your Open API key in the webhooks block above.',
    fr: '\nPas d’URL entrante : liez Gladys Plus et collez votre clé Open API dans le bloc webhooks ci-dessus.',
  },
  widget: {
    sent: (event) => ({
      en: `Event "${event}" sent to IFTTT`,
      fr: `Événement « ${event} » envoyé à IFTTT`,
    }),
    failed: (message) => ({ en: `IFTTT: ${message}`, fr: `IFTTT : ${message}` }),
    noEvent: {
      en: 'Set the event name in the widget settings',
      fr: 'Indiquez le nom de l’événement dans les réglages du widget',
    },
    caption: { en: 'IFTTT applet', fr: 'Applet IFTTT' },
  },
};
