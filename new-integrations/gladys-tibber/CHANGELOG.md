# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One device per Tibber home: current, next, average, minimum and maximum
  price of the day, Tibber's price level, a "cheap period" sensor, the
  30-minute consumption fed to the Gladys energy monitoring, yesterday's
  consumption and cost; with a Tibber Pulse or Watty, the live power,
  production, today's consumption and cost, voltages and currents.
- Scene triggers "cheap period started / ended", "price level changed",
  "tomorrow's prices published" and "live power crossed a mark".
- Scene actions "price now" and "cheapest hours".
- Dashboard widgets "Tibber prices" (curve of today and tomorrow) and
  "Tibber live power".
- Delegated energy contract templates for Norway, Sweden, Germany and the
  Netherlands (Gladys 5.2+): every half hour priced from the Tibber hourly
  price history, plus the monthly subscription.
- "Test the connection" button.
