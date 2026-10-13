# TODO

## Before announcing

- [ ] Test on a real Livebox (4, 5, 6 or 7) with a real Gladys 5.1+: the
      login, discovery, presence over a day, the Wi-Fi switches, the call
      log, the two widgets. The module was built without the hardware.
- [ ] Reserve "Orange Livebox" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm on real hardware (built blind)

- [ ] The login: a GET of `/` before `createContext` and the cookies the
      box sets (`sessid`, `accept-language`); the `X-Context` header on the
      calls; whether the box needs `Cookie` at all.
- [ ] `Devices get` with the `expression` map answers `{ status: { wifi:
    [...], eth: [...] } }` on the Livebox 5/6/7 firmware; the `Active`
      flag timing after a phone leaves.
- [ ] `NMC.Guest set { Enable }` is enough to start the guest Wi-Fi on a
      Livebox 6/7 (Home Assistant also sets a timer through `NMC.WlanTimer`).
- [ ] `VoiceService.VoiceApplication getCallList` on a box without a
      landline (an empty list or an error: both are handled).
- [ ] The `NeMo.Intf.data getMIBs` DSL path on a Livebox 4 (`dsl.dsl0`),
      and the fiber counterparts (`SgcOmci.Optical get`, `veip0`) that are
      not read yet.
- [ ] The container reaches the box: on a Docker bridge network the
      integration must route to the LAN (Gladys's default), and the box
      must accept the login from a non-browser client.

## Ideas

- Fiber (GPON) stats: optical power and ONU state (`SgcOmci.Optical get`).
- Wake-on-LAN through the box (`Wol sendWakeOnLan`) with `network_wake`.
- Per-device internet access schedules (`Scheduler`), as in Home Assistant.
- Wi-Fi signal strength as a feature of each host device.
