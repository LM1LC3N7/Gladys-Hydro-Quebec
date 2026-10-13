# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+: the two scene actions against a real
      applet, the widget button, the test button.
- [ ] With Gladys Plus: paste the Open API key, call the inbound URL from an
      IFTTT "Make a web request" action (JSON body) and from a browser (GET
      with `?event=`), check the trigger fires with the variables.
- [ ] Reserve "IFTTT" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm on a real instance

- [ ] The `confirm` flag of the widget button is honoured by the core.
- [ ] A `boolean` widget setting with `default: false` is accepted.
- [ ] The `fire_and_forget` relay passes the raw JSON body as a string in
      `body` (the parser also accepts an already-parsed object just in case).

## Ideas

- A second widget listing the last inbound events (needs a small in-memory
  log).
- A `sync` webhook answering the IFTTT request with the outputs of a scene.
