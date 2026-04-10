# Changelog

## v0.1.2

### Scoring Logic Overhaul
- **Runner "stay put" option:** Runners can now remain on their current base during in-play events
- **Smart auto-advance defaults:** Hit type + base state drives pre-filled runner destinations (single → 1B advances, double → runners score, etc.) with user override
- **Sac fly/bunt auto-resolution:** Batter auto-marked out; lead runner pre-advanced to home on sac fly
- **2-out / 3rd-out logic:** When enough outs are recorded to end the inning, remaining runners are automatically stranded — no manual resolution needed
- **Wild pitch / passed ball rework:** Per-runner advancement with editable defaults instead of all-or-none auto-advance
- **Undo preserves count:** Undoing a play restores the previous batter's pitch sequence and count via `currentAtBatPitches` in derived state
- **Position highlight fix:** Fielding notation buttons now track tapped positions as an array with proper visual highlighting

### Scoring UX
- **3-column pitch layout:** Tall Ball button (left), center actions (Foul, In Play, HBP, clock, undo), split Strike button (Swing/Looking) on the right
- **Count display:** Numeric balls-strikes count shown prominently during at-bat
- **Position labels:** Notation buttons show abbreviation first — `SS (6)` instead of `6 SS`
- **"Scored" label:** Home plate button in runner resolution renamed from "H" to "Scored" for clarity
- **Stable layout:** Undo button always reserves space (visibility:hidden when inactive) to prevent layout shifts

### Stats & Analytics
- **LOB tracking:** Left-on-base computed per team when half-innings end; displayed in box score
- **Situational stats:** RISP batting avg, 2-out RBI, per-player LOB via `computeSituationalBattingStats()`
- **Stats dashboard:** New `/stats` page with team selector, summary cards (Games, R/G, Team AVG, LOB), and sortable player stats table (PA, H, HR, RBI, AVG, OBP, SLG, OPS, RISP, 2oRBI, SB)

### Roster & Team Management
- **Duplicate jersey warning:** Inline `⚠ #7 is already assigned to John Smith` on add/edit player forms (soft block)
- **My Team toggle:** Star (★/☆) on each team to pin "My Teams" to the top of the teams list

### MLB Rules Compliance (Phase J Audit)
- **Fix: Sac fly/bunt AB:** Sacrifice fly and bunt no longer count as at-bats (MLB 9.02(a)(1))
- **Fix: OBP denominator:** Sacrifice flies now included in OBP denominator (MLB 9.02)
- **Fix: GIDP RBI:** Auto-advance sets RBI=0 on force double plays with UI hint (MLB 9.04(b)(1))
- **Docs:** Comprehensive MLB rule coverage added to `common-scenarios.md` — RBI on errors, walk-off hit value, hit value reduction, error subtleties, WP/PB cancellation, interference stubs, compliance tracker (§19)

### Documentation
- **Scenario matrix:** `docs/common-scenarios.md` with 15 sections covering every play type, runner configuration, and edge case
- **MLB rule files:** Updated `docs/rules/mlb.md` with Official Scoring Rules (9.02–9.17) reference

### Testing
- **170 tests** across 10 test files (up from 43 in v0.1.1)
- New test suites: `scenarios-hits`, `scenarios-outs`, `scenarios-sacfly`, `scenarios-wp-pb`, `scenarios-inning-end`, `scenarios-undo`, `autoAdvance`
- LOB and situational stats coverage in `gameEngine.test.ts` and `statsEngine.test.ts`

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
