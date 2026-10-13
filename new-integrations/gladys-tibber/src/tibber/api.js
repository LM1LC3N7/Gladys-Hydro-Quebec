// -----------------------------------------------------------------------------
// The Tibber GraphQL queries, as raw data. Turning them into values is
// src/tibber/model.js's job.
// -----------------------------------------------------------------------------

import { graphql } from '../http.js';

const PRICE_FIELDS = 'total energy tax startsAt currency level';

export const QUERIES = {
  viewer: `{ viewer { login name websocketSubscriptionUrl homes {
    id timeZone appNickname type address { address1 postalCode city country }
    meteringPointData { priceAreaCode gridCompany }
    features { realTimeConsumptionEnabled }
    currentSubscription { status priceInfo { current { ${PRICE_FIELDS} } } }
  } } }`,
  prices: `query ($homeId: ID!) { viewer { home(id: $homeId) {
    currentSubscription { priceInfo {
      current { ${PRICE_FIELDS} }
      today { ${PRICE_FIELDS} }
      tomorrow { ${PRICE_FIELDS} }
    } }
  } } }`,
  consumption: `query ($homeId: ID!, $last: Int!) { viewer { home(id: $homeId) {
    consumption(resolution: HOURLY, last: $last) { nodes {
      from to consumption consumptionUnit cost unitPrice unitPriceVAT currency
    } }
  } } }`,
  priceRange: `query ($homeId: ID!, $first: Int!, $after: String) { viewer { home(id: $homeId) {
    currentSubscription { priceInfoRange(resolution: HOURLY, first: $first, after: $after) {
      edges { node { ${PRICE_FIELDS} } }
    } }
  } } }`,
};

/** A cursor of the Tibber pagination: the base64 of an ISO instant. */
export const cursor = (iso) => Buffer.from(iso).toString('base64');

export class TibberClient {
  constructor({ token }) {
    this.token = token;
  }

  /** The account and its homes (with the current price of each). */
  async viewer() {
    return (await graphql(this.token, QUERIES.viewer)).viewer;
  }

  /** The prices of today and tomorrow of a home. */
  async prices(homeId) {
    const data = await graphql(this.token, QUERIES.prices, { homeId });
    return (
      data.viewer.home?.currentSubscription?.priceInfo ?? { current: null, today: [], tomorrow: [] }
    );
  }

  /** The last `last` hourly consumption nodes of a home. */
  async consumption(homeId, last) {
    const data = await graphql(this.token, QUERIES.consumption, { homeId, last });
    return data.viewer.home?.consumption?.nodes ?? [];
  }

  /** Up to `first` hourly prices after the instant `from` (ISO). */
  async priceRange(homeId, from, first) {
    const data = await graphql(this.token, QUERIES.priceRange, {
      homeId,
      first,
      after: cursor(from),
    });
    return (data.viewer.home?.currentSubscription?.priceInfoRange?.edges ?? []).map((e) => e.node);
  }
}
