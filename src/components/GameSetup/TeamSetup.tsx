import { useEffect, useRef, useState } from 'react';
import { db } from '../../db';
import { importTeamFile } from '../../db/exportImport';
import type { Team } from '../../models/team';
import type { Player } from '../../models/player';
import { displayPlayerName } from '../../models/player';
import type { PositionNumber } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';
import { generateId } from '../../utils/id';

interface TeamSetupProps {
  label: string;
  teamId: string | null;
  onTeamReady: (teamId: string, teamName: string, players: Player[]) => void;
}

export function TeamSetup({ label, teamId, onTeamReady }: TeamSetupProps) {
  const [mode, setMode] = useState<'pick' | 'new'>(teamId ? 'pick' : 'new');
  const [existingTeams, setExistingTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(teamId ?? '');
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);

  // New player form state
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newPos, setNewPos] = useState<PositionNumber>(1);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    db.teams.orderBy('name').toArray().then(setExistingTeams);
  }, []);

  // Load existing team's players
  useEffect(() => {
    if (mode === 'pick' && selectedTeamId) {
      const team = existingTeams.find(t => t.id === selectedTeamId);
      if (team) {
        setTeamName(team.name);
        db.players.where('teamId').equals(team.id).toArray().then(p => {
          setPlayers(p);
          onTeamReady(team.id, team.name, p);
        });
      }
    }
  }, [selectedTeamId, mode, existingTeams]);

  const addPlayer = () => {
    const first = newFirst.trim();
    const last = newLast.trim();
    const num = newNumber.trim();
    if (!num && !first && !last) return; // need at least # or a name

    const tId = selectedTeamId || generateId();
    if (!selectedTeamId) setSelectedTeamId(tId);

    const player: Player = {
      id: generateId(),
      firstName: first || undefined,
      lastName: last || undefined,
      number: num ? parseInt(num) : undefined,
      positions: [newPos],
      teamId: tId,
    };

    const updated = [...players, player];
    setPlayers(updated);
    setNewFirst('');
    setNewLast('');
    setNewNumber('');

    onTeamReady(tId, teamName, updated);
  };

  const removePlayer = (id: string) => {
    const updated = players.filter(p => p.id !== id);
    setPlayers(updated);
    if (selectedTeamId) {
      onTeamReady(selectedTeamId, teamName, updated);
    }
  };

  const handleTeamNameChange = (name: string) => {
    setTeamName(name);
    const tId = selectedTeamId || generateId();
    if (!selectedTeamId) setSelectedTeamId(tId);
    onTeamReady(tId, name, players);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importTeamFile(file);
      // Reload teams list and select the imported team
      const teams = await db.teams.orderBy('name').toArray();
      setExistingTeams(teams);
      const imported = teams.find(t => t.name === result.teamName);
      if (imported) {
        setMode('pick');
        setSelectedTeamId(imported.id);
      }
    } catch {
      // Silently fail — could add error UI later
    }
    if (importFileRef.current) importFileRef.current.value = '';
  };

  return (
    <div className="team-section">
      <span className="section-label">{label}</span>

      <div className="team-picker-options">
        <button
          type="button"
          className={mode === 'new' ? 'primary' : ''}
          onClick={() => {
            setMode('new');
            setSelectedTeamId('');
            setTeamName('');
            setPlayers([]);
          }}
        >
          New Team
        </button>
        <button
          type="button"
          className={mode === 'pick' ? 'primary' : ''}
          onClick={() => setMode('pick')}
          disabled={existingTeams.length === 0}
        >
          Existing ({existingTeams.length})
        </button>
        <button
          type="button"
          onClick={() => importFileRef.current?.click()}
        >
          📥 Import
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      {mode === 'pick' && (
        <div className="quick-form">
          <select
            value={selectedTeamId}
            onChange={e => setSelectedTeamId(e.target.value)}
          >
            <option value="">Select a team…</option>
            {existingTeams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {mode === 'new' && (
        <div className="quick-form">
          <input
            type="text"
            placeholder="Team name"
            value={teamName}
            onChange={e => handleTeamNameChange(e.target.value)}
          />
        </div>
      )}

      {/* Roster */}
      {(teamName || selectedTeamId) && (
        <>
          <span className="section-label" style={{ marginTop: 8 }}>
            Roster ({players.length} players)
          </span>

          <div className="roster-list">
            {players.map(p => (
              <div key={p.id} className="roster-item">
                <span className="player-number">#{p.number ?? '—'}</span>
                <span className="player-name">{displayPlayerName(p)}</span>
                <span className="player-pos">
                  {p.positions.map(pos => POSITION_LABELS[pos]).join('/')}
                </span>
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removePlayer(p.id)}
                  aria-label={`Remove ${displayPlayerName(p)}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="add-player-row">
            <input
              type="text"
              placeholder="#"
              value={newNumber}
              onChange={e => setNewNumber(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={3}
            />
            <input
              type="text"
              placeholder="First"
              value={newFirst}
              onChange={e => setNewFirst(e.target.value)}
            />
            <input
              type="text"
              placeholder="Last"
              value={newLast}
              onChange={e => setNewLast(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
            />
            <select
              value={newPos}
              onChange={e => setNewPos(parseInt(e.target.value) as PositionNumber)}
            >
              {(Object.entries(POSITION_LABELS) as [string, string][]).map(([num, lbl]) => (
                <option key={num} value={num}>{lbl}</option>
              ))}
            </select>
            <button type="button" onClick={addPlayer} className="primary">+</button>
          </div>
        </>
      )}
    </div>
  );
}
