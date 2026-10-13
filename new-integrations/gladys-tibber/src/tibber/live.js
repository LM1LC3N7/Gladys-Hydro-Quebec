// -----------------------------------------------------------------------------
// The real-time measurements of a Tibber Pulse / Watty: a GraphQL
// subscription over the graphql-transport-ws protocol. One connection per
// home, reconnected with backoff, measurements throttled by the app.
//
// Protocol (https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md):
//   -> connection_init { payload: { token } }
//   <- connection_ack
//   -> subscribe { id, payload: { query } }
//   <- next { id, payload: { data } } ... | error | complete
//   <-> ping / pong
// -----------------------------------------------------------------------------

import { LIVE_RECONNECT, TIBBER_WS_URL, USER_AGENT } from '../constants.js';

const SUBSCRIPTION = (homeId) => `subscription { liveMeasurement(homeId: "${homeId}") {
  timestamp power powerProduction accumulatedConsumption accumulatedProduction accumulatedCost currency
  minPower averagePower maxPower voltagePhase1 voltagePhase2 voltagePhase3 currentL1 currentL2 currentL3
  signalStrength lastMeterConsumption
} }`;

/** The default socket factory: Node's global WebSocket (undici). */
function defaultSocketFactory(url) {
  return new globalThis.WebSocket(url, ['graphql-transport-ws'], {
    headers: { 'User-Agent': USER_AGENT },
  });
}

export class LiveSubscription {
  constructor({
    homeId,
    token,
    url = TIBBER_WS_URL,
    onMeasurement,
    onStatus = () => {},
    logger = console,
    socketFactory = defaultSocketFactory,
    timers = { setTimeout, clearTimeout },
  }) {
    this.homeId = homeId;
    this.token = token;
    this.url = url;
    this.onMeasurement = onMeasurement;
    this.onStatus = onStatus;
    this.logger = logger;
    this.socketFactory = socketFactory;
    this.timers = timers;
    this.socket = undefined;
    this.attempts = 0;
    this.retryTimer = undefined;
    this.stopped = true;
    this.connected = false;
  }

  start() {
    this.stopped = false;
    this.attempts = 0;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.close();
  }

  close() {
    if (this.socket) {
      const socket = this.socket;
      this.socket = undefined;
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
    if (this.connected) {
      this.connected = false;
      this.onStatus(false);
    }
  }

  open() {
    if (this.stopped) {
      return;
    }
    let socket;
    try {
      socket = this.socketFactory(this.url);
    } catch (err) {
      this.logger.warn(`Live socket of ${this.homeId} failed to open: ${err.message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.send(socket, { type: 'connection_init', payload: { token: this.token } });
    };
    socket.onmessage = (event) => this.handle(socket, String(event.data));
    socket.onerror = (event) => {
      this.logger.warn(`Live socket of ${this.homeId} error: ${event?.message ?? 'unknown'}`);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) {
        return; // closed by us
      }
      this.socket = undefined;
      if (this.connected) {
        this.connected = false;
        this.onStatus(false);
      }
      this.logger.warn(`Live socket of ${this.homeId} closed (${event?.code ?? '?'})`);
      this.scheduleReconnect();
    };
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      this.logger.warn(`Live socket send failed: ${err.message}`);
    }
  }

  handle(socket, raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    switch (message.type) {
      case 'connection_ack':
        this.attempts = 0;
        this.connected = true;
        this.onStatus(true);
        this.send(socket, {
          id: '1',
          type: 'subscribe',
          payload: { query: SUBSCRIPTION(this.homeId) },
        });
        break;
      case 'ping':
        this.send(socket, { type: 'pong' });
        break;
      case 'next': {
        const measurement = message.payload?.data?.liveMeasurement;
        if (measurement) {
          this.onMeasurement(measurement);
        }
        break;
      }
      case 'error':
        this.logger.warn(
          `Live subscription of ${this.homeId} error: ${JSON.stringify(message.payload).slice(0, 200)}`,
        );
        this.close();
        this.scheduleReconnect();
        break;
      case 'complete':
        this.close();
        this.scheduleReconnect();
        break;
      default:
        break;
    }
  }

  scheduleReconnect() {
    if (this.stopped || this.retryTimer) {
      return;
    }
    const delay = Math.min(LIVE_RECONNECT.max, LIVE_RECONNECT.base * 2 ** this.attempts);
    this.attempts += 1;
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = undefined;
      this.open();
    }, delay);
  }
}
