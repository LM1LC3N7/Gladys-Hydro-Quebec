# Hydro-Québec

Monitor your Hydro-Québec electricity account directly in Gladys: daily
consumption, average outdoor temperature, account balance, outages, and — if
you are enrolled in the dynamic rate options — Winter Credit (CPC) and Flex D
(DPC) peak events.

## What you get

One Gladys device is created **per Hydro-Québec contract** on your account
(a single login can have several: a primary residence, a rental, a cottage...).
Every device exposes:

- **Daily consumption** (kWh) and **average daily cost** for the current
  billing period ($).
- **Average outdoor temperature** for the most recent day Hydro-Québec has
  published.
- **Account balance** ($).
- **Power outage in progress** (on/off), for the contract's service address.

If the contract is enrolled in **Winter Credit (tarif D + option CPC)**, you
also get: cumulated and projected credit ($), the current state (normal /
anchor / critical anchor / peak / critical peak) and whether a critical peak
or a pre-heat period is coming up.

If the contract is billed under **Flex D (tarif DPC)**, you also get: the
current state (normal / critical peak), whether a peak or a pre-heat period
is in progress, the critical hours called so far this winter, and the
savings/loss compared to the base rate.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the same **email/username** and **password** you use to sign in at
   `session.hydroquebec.com`.
3. Adjust the **refresh interval** if needed (Hydro-Québec only refreshes
   daily consumption about once a day, with a 1-2 day delay — polling faster
   than every 30-60 minutes brings no extra data).
4. Save: your contracts appear in the **Discovery** tab.

## Actions

- **Test the connection** — attempts a real login to Hydro-Québec and reports
  success or the exact failure reason under the button.

## Tested and confirmed working

This integration has been validated against a real Hydro-Québec account and
a real Gladys instance, not just automated tests:

- Login, contract discovery, and adding a discovered device from the
  Discovery tab.
- An account with **more than one meter under the same subscription**
  (a primary contract and a secondary one) — both correctly reporting their
  own, distinct data.
- The refresh loop, including the first reading appearing right after saving
  the configuration.
- A contract with no current billing period yet on Hydro-Québec's side (e.g.
  a newly added or secondary meter): consumption, temperature, balance and
  outage status still come through, only the daily cost is left blank for it.
- Base "D" rate consumption, temperature, balance and outage figures, over
  repeated refresh cycles.

**Not yet independently confirmed**: the Winter Credit (CPC) and Flex D
(DPC) peak-event figures are implemented directly against the same
already-computed values the Home Assistant Hydro-Québec integration uses,
but no account enrolled in either option has used this integration yet —
if you are and something looks off, please open an issue.

## Important notes

- This integration is developed independently and is **not supported by
  Hydro-Québec** — do not contact Hydro-Québec customer service about it. If
  Hydro-Québec changes its portal, authentication or API can break; please
  open an issue on the repository.
- Your password is stored encrypted by Gladys (`secret` field) and is only
  ever sent to Hydro-Québec's own servers.
- The "average daily cost" figure is the current billing period's average
  $/day, not an exact per-day breakdown: Hydro-Québec's free API does not
  expose one for the base "D" rate.

## Troubleshooting

Check the integration logs from the Gladys UI (or `docker logs` on the host)
with `LOG_LEVEL=debug` for the full detail of every request made to
Hydro-Québec.
