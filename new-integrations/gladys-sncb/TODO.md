# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+: discovery with a located house (nearest
      stations), a typed station with a destination filter, the two widgets,
      the "train approaching" trigger during a commute.
- [ ] Reserve "SNCB / NMBS" in the forum thread t/10385 (Belgium has no
      transit integration in the store yet), then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm on a real instance

- [ ] `getHouses()` is granted with `location: true` on the install screen,
      and a house without coordinates is skipped quietly.
- [ ] The `duration` / `integer` features with `unit: minutes` render as
      countdowns in the device widget.
- [ ] The `text` features (one line per departure) are readable on a phone.

## Ideas

- Arrivals (`arrdep=arrival`) for "my train arrives in N minutes".
- A "journey" device (iRail `connections`): the next connections between two
  stations, with the changes.
- STIB-MIVB Brussels as a sister integration (`gladys-stib`), then TEC and
  De Lijn.
