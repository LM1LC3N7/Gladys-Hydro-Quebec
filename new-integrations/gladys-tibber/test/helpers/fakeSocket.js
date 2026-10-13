// -----------------------------------------------------------------------------
// A fake WebSocket for the live subscription: the test plays Tibber's side.
// -----------------------------------------------------------------------------

export class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(text) {
    this.sent.push(JSON.parse(text));
  }

  close() {
    this.closed = true;
  }

  // --- Tibber's side ---------------------------------------------------------
  open() {
    this.onopen?.();
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop(code = 1006) {
    this.onclose?.({ code });
  }
}

export function createSocketFactory() {
  const sockets = [];
  return {
    sockets,
    factory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
}
