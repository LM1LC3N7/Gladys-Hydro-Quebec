# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The Livebox device: internet connected, link type, public IP, uptime,
  Wi-Fi and guest Wi-Fi switches, devices online (total and Wi-Fi), missed
  calls and last call, and the xDSL line rates on a DSL box.
- One presence sensor per Wi-Fi device known by the box (wired devices on
  request), named after the box's device name.
- Scene triggers "device connected", "device disconnected", "missed call"
  and "internet up or down".
- Scene actions "devices online", "Wi-Fi on / off" (main or guest) and
  "reboot".
- Dashboard widgets "Livebox" (state, link, uptime, counters, Wi-Fi buttons)
  and "Livebox devices" (the devices online).
- "Test the connection" and "Reboot the Livebox" buttons.
