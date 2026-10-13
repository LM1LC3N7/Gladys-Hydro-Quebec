# Tibber

**Unofficial connector, not affiliated with Tibber.** It brings your Tibber
account into Gladys: the hourly electricity prices of your home (today and
tomorrow), Tibber's price level, your consumption, and, with a Tibber Pulse
or Watty, the live power. Tibber is a trademark of Tibber AS. Available
where Tibber sells electricity: Norway, Sweden, Germany and the Netherlands.

## What you get

| Surface                       | Content                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One device per **home**       | price now, next price, today's average, minimum and maximum (per kWh, VAT included), Tibber's level (very cheap to very expensive), a "cheap period" sensor, the 30-minute consumption for the Gladys energy monitoring, yesterday's consumption and cost |
| With a **Pulse / Watty**      | live power, production, today's consumption and cost, voltages and currents of the three phases                                                                                                                                                           |
| Scene triggers                | **cheap period started / ended** (the N cheapest hours of the day), **price level changed**, **tomorrow's prices published**, **live power crossed a mark** (500 W to 11 kW, up or down)                                                                  |
| Scene actions                 | **price now** (price, level, cheap hours, next price, today's figures, cheapest window) and **cheapest hours** (the cheapest N consecutive hours of the next 24 hours, today or tomorrow)                                                                 |
| Dashboard widgets             | **Tibber prices** (now, next, averages, level, cheapest hours, the curve of today and tomorrow) and **Tibber live power** (gauge, kWh and cost of the day, peak, voltages, currents)                                                                      |
| Energy contract (Gladys 5.2+) | a **Tibber** template per country: every half hour of your meter is priced from your Tibber hourly prices, plus the monthly subscription                                                                                                                  |

## Setup

1. On [developer.tibber.com](https://developer.tibber.com/settings/access-token),
   sign in with your Tibber account and create a **personal access token**.
2. Install the integration, paste the token in **Access token**, save, then
   click **Test the connection**: it lists your homes with their current
   price.
3. Open **Discovery** and add the device of each home.
4. Put the **Tibber prices** widget (and **Tibber live power** with a Pulse)
   on a dashboard, pick the home.

The prices are read at start and every hour; tomorrow's prices are asked
from 12:45 every 10 minutes until Tibber publishes them (around 13:00). The
sensors move at every price slot (hourly, or every 15 minutes where Tibber
moved to it). The consumption is read every hour.

## Scenes

- **Cheap period started / ended**: the current slot enters or leaves the N
  cheapest hours of the day (N = **Cheap hours per day**, 4 by default).
  Start the water heater, the car charger, the washing machine.
- **Price level changed**: Tibber's own level of the price (against the
  average of the last days) changed; filter on the new levels.
- **Tomorrow's prices published**: once a day, with the average, the
  extremes and the cheapest window of tomorrow, ready for a notification.
- **Live power crossed a mark**: the power of the Pulse went above or below
  the chosen number of watts. Warn when the oven and the charger run at the
  same time.

Two scene actions for a condition or a message that follows: **price now**
gives `{{price}}`, `{{level}}`, `{{cheap}}`, `{{next_price}}`,
`{{avg_price}}`, `{{window_start_time}}`…; **cheapest hours** gives the
start and end (`{{start_time}}`, `{{end_time}}`, `{{start}}` and `{{end}}`
as ISO dates for a "wait until"), `{{minutes_until_start}}` and the saving
against the period.

## Energy monitoring (Gladys 5.2 or newer)

In **Energy monitoring → Contracts**, create a contract from the **Tibber**
template of your country, pick the Tibber home device as the meter, and fill
in the monthly subscription. Gladys then asks the integration to price
every half hour from your own Tibber price history (energy price, VAT
included); the costs appear next to the consumption like any contract. The
**consumption** of the device is the hourly consumption Tibber reports,
split in two equal halves, published with about one hour of delay.

If you own a Pulse, Gladys also shows the live power and today's cost
straight from Tibber.

## Troubleshooting

- **"Tibber refused the access token"**: the token was revoked or mistyped;
  create a new one on developer.tibber.com.
- **"No home with an active subscription"**: the account has no running
  Tibber contract yet.
- **No live power**: the home needs a Tibber Pulse or Watty with real-time
  consumption enabled in the Tibber app, and the **Live power** option on.
  The status line says "live power on <home>" when the stream is connected.
- **Tomorrow's prices missing**: Tibber publishes them around 13:00 local
  time; the integration keeps asking every 10 minutes.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable.

## Privacy

The token is stored encrypted by Gladys and only sent to Tibber's servers
(`api.tibber.com`, `websocket-api.tibber.com`). Your address is only used to
name the device when the home has no nickname.
