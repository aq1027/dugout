# Changelog

## v0.1.4

Correctness release. None of these were reported from a game — they were found by reading the engine against the v0.1.2 rules audit. Several were rules v0.1.2 documented and marked done without a working implementation behind them.

### Scoring rules
- **Fixed: every double play zeroed the RBI.** The force-DP check had a clause that was always true, so tag double plays (line drive caught, runner doubled off) lost RBI they are entitled to. Force vs. tag is now worked out from the base state (MLB 9.04(b)(1)).
- **Fixed: runs scoring on an error always credited an RBI.** The default is now 0, or 1 for a runner on third with fewer than two outs (MLB 9.04(a)(3), 9.04(b)(2)). Since this is a judgment call, error plays show an **RBI Credited** selector whenever a run scores.
- **Fixed: multi-out plays lost their out type.** Any play with two outs was relabelled `double_play`, so a sac fly with a runner thrown out at the plate was recorded as a double play. The scorer's choice (ground / fly / line / popup) is now kept; the game log reads "fly out, double play".
- **3rd-out force rule enforced by the engine.** A run marked on a play whose 3rd out is a force out no longer scores, and the runner counts as left on base. Previously this held only because the scoring panel happened not to produce such a play. The panel now says when it drops a run, and warns on an inning-ending ground-ball double play, where only the scorer knows whether the run beat a tag.
- **Extra outs on a strikeout or caught stealing are counted** (strike-'em-out-throw-'em-out, both runners caught on a double steal). These always counted as exactly one out.

### Game end
- **Fixed: a home-team mercy-rule win was never detected.** The check only ran at the top of an inning with no outs. The home team's lead now ends the game immediately in the bottom half; the away team's lead ends it once the home team has batted.
- **Fixed: the mercy rule triggered an inning early.** "After 5" fired at the start of the 5th. It now waits for five complete innings (4½ if the home team leads).
- **Undo works after the game ends.** A walk-off or mercy finish used to hide Undo, leaving no way to take back a mis-recorded final play. Undo and End stay available until the game is marked Final.

### Undo
- **Fixed: undo did not restore the count.** v0.1.2 advertised this, but the code path that would restore it could never run, so undoing a strikeout on 1-2 brought the batter back at 0-0. The count before the final pitch is now recovered from the undone event.

### Stored games
No migration and no change to the saved format. Two things can differ when an existing game is reopened:
- A game where a run was recorded on a force-out 3rd out now shows that run removed.
- A mercy-rule game may end at a different point, per the fixes above.

RBI totals and out types on plays already recorded are unchanged — those fixes apply to plays scored from now on.

### Internals
- Event construction moved out of `AtBatPanel` into a pure `buildPlayEvent()` (`src/engine/playBuilder.ts`), with force/tag classification in `src/engine/forcePlay.ts`. This is what made the bugs above testable: the suite previously replayed hand-built, already-correct events and never exercised the code that builds them.
- Removed the unused `computePitchingStats` stub and a dead pickoff branch in `BetweenABPanel`.
- `docs/common-scenarios.md` §19 corrected where it claimed rules were implemented that were not.

### Tests
- **234 tests** across 13 files (up from 184). New: `playBuilder.test.ts` (event construction), `scenarios-game-end.test.ts` (mercy rule, 3rd-out guard, out counting), and count-restoration cases in `scenarios-undo.test.ts`.

## v0.1.3

Bug-fix release addressing feedback from live-game use of v0.1.2.

### Substitutions
- **Fixed: substitutions were silently discarded.** `LineupPanel` wrote the game twice per substitution — once with the roster change, then again to append the event. The second write was built from a stale `game` captured before the change, so it reverted the lineup while keeping the log entry. Substitutions now commit as a single atomic write via `onGameUpdateWithEvent`.
- **Scorecard-style lineup display:** the starter keeps the numbered line (struck through once replaced) and each substitution is listed indented beneath it, with the active player highlighted. Previously the incoming player was rendered on both lines and the starter disappeared.
- **Pinch runners take over the base:** `SubstitutionEvent` gained `replacedRunnerBase`, and replay now swaps the incoming player onto that base so runs and steals credit the right player.
- **Undo reverts the lineup:** `undoLastEventWithLineup()` removes the substitution from the lineup alongside its event, keeping the two in sync. It locates the correct team by searching both lineups, since a pitching change belongs to the fielding team while a pinch hitter belongs to the batting team.
- **`SUB` / `SUB P` buttons** replace the `↻` refresh-style icon, which read as "reload" rather than "substitute."

### Scoring UI
- **Fixed: fielding position taps had no visual feedback.** The `.selected` class was applied correctly in JSX but **no matching CSS rule existed** — so tapping a position highlighted nothing. Affected all three position grids (fielding notation, error-by-position, error-on-hit).
- **Tap-order badges** on selected position buttons show the sequence (`6-4-3`), including repeats for rundowns like `1-3-1`.
- **Backspace (`⌫`)** undoes a single position tap; previously only a full Clear was available.
- **"Scored" is now green** (`--color-success`, added across light/dark/high-contrast themes), mirroring the red OUT button.
- **Action bar no longer cramped:** the "Inning over — remaining runners stranded" text shared a flex row with the buttons and squeezed "Record Play" on phones. Replaced with a compact outs pill (`● ● ○`) in the panel header.
- **Immediate tap feedback:** `:active` states and `touch-action: manipulation` on position, runner-destination, and outcome buttons.

### Tests
- New `scenarios-substitutions.test.ts` — 14 tests covering commit, persistence, pitching changes, pinch-runner base swap, and undo. Includes an explicit regression test for the stale-write failure mode.

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
