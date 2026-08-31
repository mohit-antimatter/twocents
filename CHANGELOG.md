# Changelog

## [0.3.0] - 2026-08-31

### Added

- Download a ready-made, signed iPhone Shortcut from Settings to open the expense form with Back Tap, Siri, or the Action Button. No API token is needed.
- A direct `/add` link opens the form and remembers the request through sign-in or household setup for up to ten minutes.

## [0.2.0] - 2026-08-31

### Added

- Add expenses from a standard form with a required expense name, amount, currency, category, date, and optional time and note. Quick text entry, voice, and presets remain available.

### Fixed

- Open the expense editor when choosing Edit details in a save confirmation, including backdated expenses outside the latest 40 entries.

## [0.1.1] - 2026-08-30

### Changed

- TwoCents is now OurPool, with a shared logo, refreshed page titles, and household-expense copy throughout the app.
- Browser and home-screen icons use the new OurPool mark; installed apps retire the old cached brand assets.
- CSV and JSON downloads now use `ourpool-` filenames. Existing backups, accounts, sessions, and Google sign-in remain compatible.
