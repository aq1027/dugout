# Changelog

## v0.1.1

### Bug Fixes
- **Count reset on CS ending inning:** Fixed count carrying over to the next half-inning when a caught stealing records the 3rd out
- **In-play pitch reversal:** "Back" button from outcome selector now correctly removes the auto-added in_play pitch
- **Undo + CS state:** Undo after CS-ending-inning now restores correct game state
- **Team setup name fields:** Split single name input into separate First / Last name fields during game setup
- **Backwards K rendering:** Changed strikeout-looking character from U+A740 to U+A4D8 (Lisu Letter Kha) for wider font support

### Features
- **League rule presets:** Added MLB, MiLB, NCAA Baseball, HS Baseball, Little League BB, NCAA Softball, HS Softball, Little League SB presets with auto-filled rules. Customize toggle for fine-tuning.
- **Hit + error plays:** Record an error on a hit play (e.g., single + E9) with fielder position tracking
- **Player fields relaxed:** Only jersey # is required; first name, last name, and position are optional
- **Mound visit / timeout logging:** Log mound visits and timeouts with per-team counts and limit warnings
- **Pickoff attempt tracking:** Log pickoff attempts (successful or not) as between-AB events
- **Pitch clock violations:** Record automatic ball/strike from clock violations
- **Pitch undo / ABS challenge:** Remove or overturn the last pitch call during an at-bat
- **Game log overhaul:** Color-coded innings, #number + name format, expandable pitch sequences
- **Softball icon sizing:** Softball emoji rendered larger to reflect physical size difference
- **Team import/export:** Export/import team rosters as JSON files for sharing between devices

### Infrastructure
- **Testing:** Added Vitest with 43+ tests covering game engine, rules, and stats engine
- **Documentation:** Added `docs/rules/` with league rule references and custom rules guide

## v0.1.0

- Initial release
- Baseball and softball scoring with event-sourced game state
- Position tracking, lineup management, box score, line score
- PWA support with offline capability
- IndexedDB persistence via Dexie.js
