# ⚾ Dugout

An offline-first baseball and softball scorekeeper PWA. Score games pitch-by-pitch, manage lineups, track stats, and never lose a game record. All data stays on your device — no accounts, no servers, no subscriptions.

**[Try it live →](https://aq1027.github.io/dugout/)**

## Features

- Pitch-by-pitch scoring (ball, strike, foul, in play, HBP)
- Live scoreboard, count indicator, and diamond display
- MLB-style box score (AB/R/H/RBI/BB/K/AVG/OPS)
- Game event log with substitution tracking
- In-game lineup management (PH, PR, defensive subs, pitching changes)
- Line score by inning
- Team and roster management
- Dark, light, and system theme modes
- Installable as a PWA on any device
- Fully offline — all data stored in the browser via IndexedDB

## Tech Stack

- React 19 + TypeScript
- Vite 7
- PWA via vite-plugin-pwa (Workbox)
- IndexedDB via Dexie.js — no backend required
- Event-sourced game engine — full play-by-play history with undo

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Development

```sh
git clone https://github.com/aq1027/dugout.git
cd dugout
npm install
npm run dev
```

The dev server starts at `http://localhost:5173/dugout/`.

To test on your phone or another device on the same network:

```sh
npm run dev -- --host
```

### Build

```sh
npm run build
npm run preview
```

## Project Structure

```
src/
├── components/       # React components
│   ├── GameSetup/    # Team selection, lineup builder
│   └── Scoring/      # AtBatPanel, Scoreboard, BoxScore, GameLog, LineupPanel
├── engine/           # Game engine (deriveGameState) and stats engine
├── hooks/            # Theme provider
├── models/           # TypeScript interfaces (Game, PlayEvent, Lineup, etc.)
├── pages/            # Route pages (Home, Teams, Games, GamePage)
├── db.ts             # Dexie database schema
└── utils/            # ID generation helpers
```

## Contributing

1. Clone the repo (`git clone https://github.com/aq1027/dugout.git`)
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push your branch and open a PR

## License

[MIT](LICENSE)
