# TODO

## Before announcing

- [ ] Test on a real Gladys 5.2+ with a real Tibber account: discovery,
      prices and the tick over a day, tomorrow's announcement at 13:00, the
      consumption feature filled, a Tibber contract priced, the two widgets.
- [ ] With a Pulse: the websocket stays connected for days, the throttled
      states, the power marks.
- [ ] Reserve "Tibber" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm on a real instance (built without a Tibber subscription)

- [ ] `priceInfo.today` carries 15-minute slots on some markets (NO/SE moved
      to 15-minute day-ahead in 2025): the slot model handles any length,
      the cheap-hours count follows the slot length.
- [ ] `priceInfoRange` cursors (`after` = base64 of an ISO instant) and the
      maximum `first` the API accepts for a 31-day period (744 hours).
- [ ] Node's global `WebSocket` accepts the `headers` option on this Node
      version (checked on 22.22) and Tibber accepts the User-Agent.
- [ ] `publishEnergyConsumption` accepts the two halves of the latest
      complete hour (the core refuses intervals that are too recent).

## Ideas

- A price calendar (`rules` mode) per price area as an alternative to the
  delegated contract, like gladys-nord-pool.
- Production (solar) consumption nodes and `accumulatedReward`.
- The `testMeasurement` subscription behind a "demo" switch for users
  without a Pulse.
