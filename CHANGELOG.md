# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.2.0] - 2026-10-13

### Added

- The cost of the consumption, computed by Gladys's energy contracts: the
  integration declares the **Hydro-Québec – Rate D** and **Hydro-Québec –
  Flex D** contract templates (rates of April 1, 2026) and feeds the
  `hq-critical-peaks` calendar with the half-hours of the Flex D peaks, read
  from Hydro-Québec's open data (a peak cancelled before it starts goes back
  to normal).
- **Consumption (30 min)**: Hydro-Québec's hourly consumption, each hour split
  in two half-hours, published as dated intervals (`publishEnergyConsumption`)
  so Gladys prices them at their real time. The first connection fetches the
  consumption since the 1st of the current month.

### Changed

- Requires Gladys 5.2 or later (energy contracts, dated consumption).
- The "average daily cost" feature becomes **Average cost per day (current
  period)**, a plain dollar amount, so it is never mistaken for the energy
  cost Gladys computes. Its history is kept.
- Shared tooling of the LM1LC3N7 Gladys integrations: CI on Node 22 and 24
  with `npm audit`, Release workflow driven by this changelog, GitHub Releases
  from its sections, grouped Dependabot updates.

### Removed

- The **daily consumption** feature, replaced by the 30-minute consumption:
  click "Update" in the Discovery tab (its history is deleted).

## [0.1.6] - 2026-10-13

The releases before this file was started are described by their GitHub
Releases.

[Unreleased]: https://github.com/LM1LC3N7/Gladys-Hydro-Quebec/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/LM1LC3N7/Gladys-Hydro-Quebec/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/LM1LC3N7/gladys-hydro-quebec/releases/tag/v0.1.6
