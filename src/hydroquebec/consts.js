// -----------------------------------------------------------------------------
// Hydro-Québec endpoints and Azure AD B2C constants.
//
// Ported from the `hydroqc` Python library (https://gitlab.com/hydroqc/hydroqc,
// hydroqc/hydro_api/consts.py) since no JavaScript client exists for the
// Hydro-Québec customer API. Keep this file in sync if Hydro-Québec changes
// its portal (the values below were extracted from hydroqc's source on
// 2026-08-20).
// -----------------------------------------------------------------------------

export const REQUESTS_TIMEOUT_MS = 30_000;

export const HOST_LOGIN = 'https://connexion.solutions.hydroquebec.com';
export const HOST_SESSION = 'https://session.hydroquebec.com';
export const HOST_SERVICES = 'https://services-cl.solutions.hydroquebec.com';
export const HOST_OUTAGES = 'https://services-bs.solutions.hydroquebec.com';
export const HOST_OPEN_DATA = 'https://donnees.solutions.hydroquebec.com';

// Azure B2C
export const AZB2C_TENANT_ID = '32bf9b91-0a36-4385-b231-d9a8fa3b05ab';
export const AZB2C_POLICY = 'B2C_1A_PRD_signup_signin';
export const AZB2C_CLIENT_ID_WEB = '09b0ae72-6db8-4ecc-a1be-041b67afc1cd';
export const AZB2C_SCOPE_WEB = 'openid https://connexionhq.onmicrosoft.com/hq-clientele/Espace.Client';
// Seconds removed from the token expiry to avoid calls failing right at the edge.
export const AZB2C_TIMEOUT_SKEW_SECONDS = 60;

export const AUTHORIZE_URL = `${HOST_LOGIN}/${AZB2C_TENANT_ID}/${AZB2C_POLICY.toLowerCase()}/oauth2/v2.0/authorize`;
export const AUTH_URL = `${HOST_LOGIN}/${AZB2C_TENANT_ID}/${AZB2C_POLICY}/SelfAsserted`;
export const AUTH_CALLBACK_URL = `${HOST_SESSION}/oauth2/callback`;
export const TOKEN_URL = `${HOST_LOGIN}/${AZB2C_TENANT_ID}/${AZB2C_POLICY.toLowerCase()}/oauth2/v2.0/token`;
export const CONFIRMED_URL = `${HOST_LOGIN}/${AZB2C_TENANT_ID}/${AZB2C_POLICY}/api/CombinedSigninAndSignup/confirmed`;

// Outages
export const OUTAGES_URL = `${HOST_OUTAGES}/pan/web/api/v1/lieux-conso/etats/`;

// Open data (no auth required)
export const OPEN_DATA_PEAK_URL = `${HOST_OPEN_DATA}/donnees-ouvertes/data/json/pointeshivernales.json`;

// Discovery / account
export const RELATION_URL = `${HOST_SERVICES}/wsapi/web/prive/api/v1_0/relations`;
export const CUSTOMER_INFO_URL = `${HOST_SERVICES}/wsapi/web/prive/api/v3_0/partenaires/infoCompte`;
export const CONTRACT_SUMMARY_URL = `${HOST_SERVICES}/wsapi/web/prive/api/v3_0/partenaires/calculerSommaireContractuel?indMAJNombres=true`;
export const CONTRACT_LIST_URL = `${HOST_SERVICES}/wsapi/web/prive/api/v3_0/partenaires/contrats`;

// Portal session (needed by the /portail/ style endpoints below)
export const SESSION_URL = `${HOST_SERVICES}/lsw/portail/prive/maj-session/`;
export const PORTRAIT_URL = `${HOST_SERVICES}/lsw/portail/fr/group/clientele/portrait-de-consommation`;
export const IS_HYDRO_PORTAL_UP_URL = `${HOST_SESSION}/portail/fr/group/clientele/gerer-mon-compte`;

// Consumption
export const PERIOD_DATA_URL = `${HOST_SERVICES}/lsw/portail/fr/group/clientele/portrait-de-consommation/resourceObtenirDonneesPeriodesConsommation`;
export const DAILY_CONSUMPTION_URL = `${HOST_SERVICES}/lsw/portail/fr/group/clientele/portrait-de-consommation/resourceObtenirDonneesQuotidiennesConsommation`;
export const MONTHLY_DATA_URL = `${HOST_SERVICES}/lsw/portail/fr/group/clientele/portrait-de-consommation/resourceObtenirDonneesConsommationMensuelles`;
export const ANNUAL_DATA_URL = `${HOST_SERVICES}/lsw/portail/fr/group/clientele/portrait-de-consommation/resourceObtenirDonneesConsommationAnnuelles`;
export const HOURLY_CONSUMPTION_URL = `${HOST_SERVICES}/lsw/portail/fr/group/clientele/portrait-de-consommation/resourceObtenirDonneesConsommationHoraires`;

// CPC (Winter Credit) / DPC (Flex D)
export const GET_CPC_API_URL = `${HOST_SERVICES}/wsapi/web/prive/api/v3_0/tarificationDynamique/creditPointeCritique`;
export const FLEXD_DATA_URL = `${HOST_SERVICES}/wsapi/web/prive/api/v3_0/tarificationDynamique/tarifPointeCritique`;
export const FLEXD_PEAK_URL = `${HOST_SERVICES}/conso/portraitweb/api/v3_0/conso`;

export const DEFAULT_PRE_HEAT_DURATION_MIN = 180;
