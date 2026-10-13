# IFTTT

**Unofficial connector, not affiliated with IFTTT.** It links Gladys scenes to
the [IFTTT Webhooks service](https://ifttt.com/maker_webhooks): a scene can
trigger any applet listening to an event name, and, with Gladys Plus, an
applet can start a Gladys scene. IFTTT is a trademark of IFTTT Inc.

## What you get

| Surface                                        | Content                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene action **Trigger an IFTTT event**        | event name + `value1`, `value2`, `value3` (the applet's ingredients)                                                                              |
| Scene action **Trigger an IFTTT event (JSON)** | event name + a JSON object (the applet's "JSON payload" ingredient)                                                                               |
| Scene trigger **IFTTT event received**         | fires when an applet (or any HTTP client) calls the inbound webhook relayed by Gladys Plus, with the event name, `value1..3` and the other fields |
| Dashboard widget **IFTTT button**              | one button that triggers an event, with an optional confirmation                                                                                  |
| **Send a test event** button                   | checks the key and shows the inbound URL                                                                                                          |

Nothing runs in the background: the integration only talks to IFTTT when a
scene, a button or a webhook asks it to.

## Setup

1. On [ifttt.com/maker_webhooks](https://ifttt.com/maker_webhooks), click
   **Documentation**: the page shows your key ("Your key is: ...").
2. Install the integration, paste the key in **IFTTT Webhooks key**, save,
   then click **Send a test event**.
3. In IFTTT, create an applet whose **If This** is **Webhooks → Receive a web
   request** with the event name of your choice (letters, digits and
   underscores, e.g. `coffee_on`), and whatever **Then That** you like.
4. In a Gladys scene, add the action **Trigger an IFTTT event** with that
   name. `value1`, `value2` and `value3` accept scene variables
   (`{{device.living_room.temperature}}`).

A free IFTTT account allows a few applets; the Webhooks service itself has no
limit on the number of events.

## From IFTTT to Gladys (Gladys Plus)

A Gladys at home is not reachable from the Internet: Gladys Plus relays the
inbound requests.

1. Link Gladys Plus, open the integration and paste your **Open API key** in
   the **Gladys Plus webhooks** block: Gladys shows the public URL of the
   "IFTTT inbound events" webhook (the **Send a test event** button repeats
   it).
2. In IFTTT, create an applet with the action **Webhooks → Make a web
   request**: URL = that URL, method **POST**, content type
   **application/json**, body:

   ```json
   { "event": "leaving_home", "value1": "{{OccurredAt}}" }
   ```

   Any other key of the body is relayed in the `payload` variable (as JSON).
   A `GET` with `?event=leaving_home&value1=...` works too.

3. In Gladys, create a scene with the trigger **IFTTT event received** and
   the event name as filter (leave it empty to react to every event). The
   variables `{{triggerEvent.data.value1}}` etc. are available in the
   following actions.

The URL is a secret. For an extra check, set a **shared secret** in the
configuration and add `"secret": "<value>"` to the body sent by IFTTT:
requests without it are ignored.

## Dashboard

The **IFTTT button** widget shows a title, a caption and a button that
triggers the event of its settings (with an optional `value1`). Tick **Ask
for confirmation** for an action with consequences.

## Troubleshooting

- **"IFTTT refused the Webhooks key"**: the key is wrong or revoked; copy it
  again from the Webhooks documentation page.
- **The applet does not run**: the event name must be exactly the one typed
  in the applet (case-sensitive); check the applet's activity on IFTTT.
- **"Inbound events need Gladys Plus"**: without Plus the outbound direction
  still works; only the trigger needs the relay.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable
  (`debug` shows every call).

## Privacy

The integration sends IFTTT only what your scenes put in the events. The key
is stored encrypted by Gladys and never leaves your instance except to reach
`maker.ifttt.com`.
