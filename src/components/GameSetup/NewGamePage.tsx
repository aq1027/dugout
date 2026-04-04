import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db';
import { getRules } from '../../engine/rules';
import type { SportType } from '../../models/common';
import type { GameRules, Game } from '../../models/game';
import type { Player } from '../../models/player';
import type { LineupSlot } from '../../models/lineup';
import { generateId } from '../../utils/id';
import { StepIndicator } from './StepIndicator';
import { SportSelector } from './SportSelector';
import { RulesConfig } from './RulesConfig';
import { TeamSetup } from './TeamSetup';
import { LineupBuilder } from './LineupBuilder';
import './GameSetup.css';

const STEPS = ['Sport & Rules', 'Teams', 'Lineups', 'Confirm'];

interface TeamState {
  id: string | null;
  name: string;
  players: Player[];
  lineup: LineupSlot[];
}

const emptyTeam = (): TeamState => ({ id: null, name: '', players: [], lineup: [] });

export function NewGamePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 0: Sport & Rules
  const [sport, setSport] = useState<SportType>('baseball');
  const [rules, setRules] = useState<GameRules>(getRules('baseball'));
  const [location, setLocation] = useState('');

  // Step 1: Teams
  const [away, setAway] = useState<TeamState>(emptyTeam());
  const [home, setHome] = useState<TeamState>(emptyTeam());

  // Handle sport change — update rules to preset
  const handleSportChange = (s: SportType) => {
    setSport(s);
    setRules(getRules(s));
  };

  // Validation per step
  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return true;
      case 1: return !!(away.name && home.name && away.players.length >= 1 && home.players.length >= 1);
      case 2: return away.lineup.length > 0 && home.lineup.length > 0;
      case 3: return true;
      default: return false;
    }
  };

  const createGame = async () => {
    const gameId = generateId();
    const now = new Date().toISOString();

    // Persist teams & players
    const awayTeamId = away.id || generateId();
    const homeTeamId = home.id || generateId();

    await db.transaction('rw', [db.teams, db.players, db.games], async () => {
      // Upsert away team
      await db.teams.put({
        id: awayTeamId,
        name: away.name,
        playerIds: away.players.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      });
      for (const p of away.players) {
        await db.players.put({ ...p, teamId: awayTeamId });
      }

      // Upsert home team
      await db.teams.put({
        id: homeTeamId,
        name: home.name,
        playerIds: home.players.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      });
      for (const p of home.players) {
        await db.players.put({ ...p, teamId: homeTeamId });
      }

      // Create game
      const game: Game = {
        id: gameId,
        sport,
        date: now,
        location: location || undefined,
        innings: rules.innings,
        awayTeamId,
        homeTeamId,
        awayTeamName: away.name,
        homeTeamName: home.name,
        awayLineup: {
          startingOrder: away.lineup,
          substitutions: [],
          useDH: rules.useDH,
        },
        homeLineup: {
          startingOrder: home.lineup,
          substitutions: [],
          useDH: rules.useDH,
        },
        events: [],
        status: 'in_progress',
        rules,
        createdAt: now,
        updatedAt: now,
      };

      await db.games.put(game);
    });

    navigate(`/game/${gameId}`);
  };

  return (
    <div className="setup-page">
      <StepIndicator steps={STEPS.length} current={step} />
      <h2>{STEPS[step]}</h2>

      {/* Step 0: Sport & Rules */}
      {step === 0 && (
        <>
          <SportSelector value={sport} onChange={handleSportChange} />
          <h3>Rules</h3>
          <RulesConfig rules={rules} onChange={setRules} />
          <div className="quick-form">
            <input
              type="text"
              placeholder="Location (optional)"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Step 1: Teams */}
      {step === 1 && (
        <>
          <TeamSetup
            label="Away Team"
            teamId={away.id}
            onTeamReady={(id, name, players) => setAway(prev => ({ ...prev, id, name, players }))}
          />
          <TeamSetup
            label="Home Team"
            teamId={home.id}
            onTeamReady={(id, name, players) => setHome(prev => ({ ...prev, id, name, players }))}
          />
        </>
      )}

      {/* Step 2: Lineups */}
      {step === 2 && (
        <>
          <LineupBuilder
            label={away.name || 'Away'}
            players={away.players}
            lineup={away.lineup}
            onChange={lineup => setAway(prev => ({ ...prev, lineup }))}
            useDH={rules.useDH}
          />
          <LineupBuilder
            label={home.name || 'Home'}
            players={home.players}
            lineup={home.lineup}
            onChange={lineup => setHome(prev => ({ ...prev, lineup }))}
            useDH={rules.useDH}
          />
        </>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="confirm-summary">
          <div className="confirm-card">
            <h4>Game</h4>
            <div className="detail">
              {sport === 'baseball' ? '⚾ Baseball' : '🥎 Softball'} · {rules.innings} innings
              {rules.useDH && ' · DH'}
              {rules.dpFlex && ' · DP/FLEX'}
              {location && ` · ${location}`}
            </div>
          </div>
          <div className="confirm-card">
            <h4>Away — {away.name}</h4>
            <div className="detail">
              {away.lineup.map((slot, i) => {
                const p = away.players.find(pl => pl.id === slot.playerId);
                return p ? `${i + 1}. ${p.firstName} ${p.lastName}` : '';
              }).join('\n').split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
          <div className="confirm-card">
            <h4>Home — {home.name}</h4>
            <div className="detail">
              {home.lineup.map((slot, i) => {
                const p = home.players.find(pl => pl.id === slot.playerId);
                return p ? `${i + 1}. ${p.firstName} ${p.lastName}` : '';
              }).join('\n').split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="setup-nav">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            type="button"
            className="primary"
            onClick={() => setStep(step + 1)}
            disabled={!canAdvance()}
          >
            Next →
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button
            type="button"
            className="primary"
            onClick={createGame}
          >
            Start Game ⚾
          </button>
        )}
      </div>

      {!canAdvance() && step === 1 && (
        <div className="validation-msg">
          Both teams need a name and at least 1 player to continue.
        </div>
      )}
    </div>
  );
}
