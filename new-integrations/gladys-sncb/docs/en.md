# SNCB / NMBS

**Unofficial connector, not affiliated with SNCB/NMBS or iRail.** It brings the
Belgian trains into Gladys through [iRail](https://docs.irail.be/), the
community API over the SNCB open data: no account, no key. SNCB/NMBS is a
trademark of the Société nationale des chemins de fer belges.

## What you get

| Surface                            | Content                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One device per **watched station** | minutes before the next departure, delayed and canceled trains, and for each of the next departures (3 by default): the countdown, the delay and a text line "IC 2514 → Dinant · platform 6 · +4 min" |
| The **SNCB network** device        | the number of disturbances and planned works, the latest disturbance                                                                                                                                  |
| Scene triggers                     | **train approaching** (1 to 15 minutes before departure), **train delayed, canceled or moved** (delay of at least 5 to 30 minutes, cancellation, platform change), **disturbance published**          |
| Scene actions                      | **next departures** of a station (list, next train, destination, countdown, delay, platform), **disturbances** of the network                                                                         |
| Dashboard widgets                  | **SNCB departures** (one station) and **SNCB disturbances** (the network, with the SNCB texts and links)                                                                                              |

## Setup

1. Install the integration. The stations closest to your house (the house
   location of Gladys) are suggested in **Discovery** right away: add the
   ones you use.
2. To watch other stations, type them in **Stations to watch**, separated by
   commas: a name (`Namur`, `Brussel-Centraal` and `Bruxelles-Central` both
   work) or an iRail id (`BE.NMBS.008863008`). The **Search stations** button
   finds the exact names.
3. Optional, per station: a **destination filter** after `@` keeps only the
   trains going towards these places (`Bruxelles-Central@Namur|Dinant`), and a
   **custom name** after `:` names the device (`...:Train home`). Save, then
   open **Discovery** again and add the devices.
4. Put the **SNCB departures** widget on a dashboard and pick a station.

Every watched station is read every 60 seconds (option **Refresh interval**),
the disturbances every 5 minutes. The departures stop being shown once the
train has left.

## Scenes

- **Train approaching**: pick the station and the number of minutes; the
  scene runs when a train of that station reaches the mark. With a
  destination filter on the station, only your trains count. Variables:
  the train, the destination, the platform, the delay, the minutes left.
- **Train delayed, canceled or moved**: pick the station and the event. For
  "Delayed", also the minimum delay: the scene runs once per train when its
  delay reaches it, not at every refresh.
- **Disturbance published**: the SNCB published a new notice. Needs the
  SNCB network device. Variables: the title, the description, the link.

The action **next departures** gives `{{list}}` (one line per train) and
`{{next_train}}`, `{{next_destination}}`, `{{next_minutes}}`,
`{{next_delay}}`, `{{next_platform}}` for a message or a condition;
**disturbances** gives `{{count}}`, `{{titles}}` and `{{latest}}`.

## Troubleshooting

- **A station is not found**: iRail knows the stations by their official
  names in each language; use **Search stations** with a part of the name.
- **"iRail is unreachable"**: iRail is a volunteer-run service; it comes
  back by itself, the integration keeps trying every refresh.
- **No departure in the next hour**: iRail lists about an hour of
  departures; small stations may show nothing in the evening.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable.

## Privacy

The integration sends iRail only the station ids it reads. The house
location is used inside the integration to pick the nearest stations and
never leaves it.
