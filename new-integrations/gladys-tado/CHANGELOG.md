# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Account linking through the tado device-code sign-in (no password stored,
  the session is kept in the Gladys configuration).
- One device per home (presence, presence mode auto / home / away, outside
  temperature, solar intensity, weather) and per zone: heating (setpoint,
  mode, heating state and power, temperature, humidity, open window, low
  battery), hot water (on/off, mode, setpoint when supported) and air
  conditioning (on/off, mode, setpoint). tado X rooms through the hops API.
- Optional presence sensor per phone with geofencing.
- Scene triggers "presence changed", "open window detected", "zone started /
  stopped heating" and "low battery".
- Scene actions "set a temperature", "back to the schedule", "set the
  presence" and "read a zone".
- Dashboard widgets "tado° home" and "tado° zone".
- "Test the connection" and "Unlink the account" buttons.
