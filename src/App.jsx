// App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, remove, get } from 'firebase/database';
import React, { useState, useEffect, useRef } from 'react';

// Initialize Firebase
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_DATABASE_URL,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Map a value in [min, max] to a background color from red → yellow → green
function wealthColor(value, min, max) {
  if (min === max) return 'hsl(60, 70%, 85%)';
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = ratio * 120; // 0 = red, 60 = yellow, 120 = green
  return `hsl(${hue}, 70%, 85%)`;
}

// Deterministically tie a student record to their name+team combination
function buildPlayerKey(playerName = '', teamNumber = 1) {
  const cleanedName = playerName
    .trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, '')
    .replace(/\//g, '')
    .replace(/\s+/g, '-');
  const safeName = cleanedName || 'player';
  return `team${teamNumber}-${safeName}`;
}

// Admin Component
function Admin() {
  const [gameState, setGameState] = useState({
    phase: 'setup',
    settings: { numTeams: 3, initialPoints: 20, multiplier: 2, hidePoints: true },
    players: {},
    currentRound: 1,
  });
  // 'teams' = grouped by team, 'players' = flat list sorted by money
  const [adminView, setAdminView] = useState('teams');
  // 'number' = team 1,2,3…  'wealth' = richest team first
  const [sortTeamsBy, setSortTeamsBy] = useState('number');

  useEffect(() => {
    const gameRef = ref(db, 'game');
    onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) setGameState(snapshot.val());
    });
  }, []);

  const updateGame = (updates) => {
    set(ref(db, 'game'), { ...gameState, ...updates });
  };

  const startGame = () => updateGame({ phase: 'voting' });

  const resetGame = () => {
    updateGame({
      phase: 'setup',
      settings: { numTeams: 3, initialPoints: 20, multiplier: 2, hidePoints: false },
      players: {},
      currentRound: 1,
    });
  };

  const resetScores = () => {
    const players = { ...gameState.players };
    Object.keys(players).forEach((id) => {
      players[id] = {
        ...players[id],
        points: gameState.settings.initialPoints,
        currentVote: null,
        lastRoundChange: null,
        lastContribution: null,
      };
    });
    updateGame({ players });
  };

  const removePlayer = (playerId) => {
    remove(ref(db, `game/players/${playerId}`));
  };

  const showResults = async () => {
    const gameSnapshot = await get(ref(db, 'game'));
    if (!gameSnapshot.exists()) return;

    const liveGame = gameSnapshot.val();
    const players = { ...(liveGame.players || {}) };
    const teamPots = {};
    const teamSizes = {};
    const playerList = Object.values(players);
    const multiplier = liveGame.settings?.multiplier ?? 1;
    const defaultPoints = liveGame.settings?.initialPoints || 20;

    playerList.forEach((player) => {
      if (!player || player.team == null) return;
      const vote = typeof player.currentVote === 'number' ? player.currentVote : 0;
      teamPots[player.team] = (teamPots[player.team] || 0) + vote;
      teamSizes[player.team] = (teamSizes[player.team] || 0) + 1;
    });

    Object.entries(players).forEach(([id, player]) => {
      if (!player || player.team == null) return;
      const contribution = typeof player.currentVote === 'number' ? player.currentVote : 0;
      const teamPot = teamPots[player.team] || 0;
      const teamSize = teamSizes[player.team] || 1;
      const share = (teamPot * multiplier) / teamSize;
      const oldPoints = typeof player.points === 'number' ? player.points : defaultPoints;

      players[id] = {
        ...player,
        lastContribution: contribution,
        lastRoundChange: share - contribution,
        points: oldPoints - contribution + share,
        currentVote: null,
      };
    });

    set(ref(db, 'game'), { ...liveGame, phase: 'results', players, teamPots });
  };

  const nextRound = () => {
    updateGame({ phase: 'voting', currentRound: gameState.currentRound + 1, teamPots: {} });
  };

  // Average points of all players on a team
  const getTeamAvgPoints = (teamNum) => {
    const tp = Object.values(gameState.players || {}).filter((p) => p.team === teamNum);
    if (tp.length === 0) return gameState.settings?.initialPoints || 20;
    return tp.reduce((s, p) => s + (p.points || 0), 0) / tp.length;
  };

  const renderTeamColumns = () => {
    const numTeams = gameState.settings.numTeams;
    let teamNums = [...Array(numTeams)].map((_, i) => i + 1);

    if (sortTeamsBy === 'wealth') {
      if (gameState.phase === 'results' && gameState.teamPots) {
        teamNums.sort((a, b) => (gameState.teamPots[b] || 0) - (gameState.teamPots[a] || 0));
      } else {
        teamNums.sort((a, b) => getTeamAvgPoints(b) - getTeamAvgPoints(a));
      }
    }

    const wealthValues = teamNums.map(getTeamAvgPoints);
    const minW = Math.min(...wealthValues);
    const maxW = Math.max(...wealthValues);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {teamNums.map((teamNum) => (
          <div
            key={teamNum}
            className="p-4 rounded-lg shadow"
            style={{ backgroundColor: wealthColor(getTeamAvgPoints(teamNum), minW, maxW) }}
          >
            <h3 className="text-xl font-bold mb-4">
              Team {teamNum}
              {gameState.phase === 'results' &&
                ` — Pot: ${gameState.teamPots?.[teamNum]?.toFixed(1) || 0}`}
            </h3>
            {Object.entries(gameState.players || {})
              .filter(([, player]) => player.team === teamNum)
              .map(([id, player]) => (
                <div
                  key={id}
                  className={`p-2 mb-2 rounded flex justify-between items-start ${
                    gameState.phase === 'voting'
                      ? player.currentVote !== null && player.currentVote >= 0
                        ? 'bg-green-100'
                        : 'bg-red-100'
                      : 'bg-white bg-opacity-60'
                  }`}
                >
                  <div>
                    <div className="font-medium">{player.name}</div>
                    {!gameState.settings.hidePoints && (
                      <div className="text-sm text-gray-600">
                        {player.points?.toFixed(1)} pts
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removePlayer(id)}
                    className="text-red-400 hover:text-red-600 text-xs ml-2 flex-shrink-0"
                    title="Remove player"
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  };

  const renderPlayersSorted = () => {
    const allPlayers = Object.entries(gameState.players || {}).sort(
      ([, a], [, b]) => (b.points || 0) - (a.points || 0)
    );

    if (allPlayers.length === 0)
      return <div className="text-gray-500">No players registered.</div>;

    const pts = allPlayers.map(([, p]) => p.points || 0);
    const minP = Math.min(...pts);
    const maxP = Math.max(...pts);

    return (
      <div className="space-y-2">
        {allPlayers.map(([id, player], rank) => (
          <div
            key={id}
            className="p-3 rounded-lg shadow flex justify-between items-center"
            style={{ backgroundColor: wealthColor(player.points || 0, minP, maxP) }}
          >
            <div className="flex items-center space-x-3">
              <span className="text-gray-500 w-6 font-bold">#{rank + 1}</span>
              <div>
                <span className="font-medium">{player.name}</span>
                <span className="text-sm text-gray-600 ml-2">(Team {player.team})</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="font-medium">{player.points?.toFixed(1)} pts</span>
              <button
                onClick={() => removePlayer(id)}
                className="text-red-400 hover:text-red-600 text-sm"
                title="Remove player"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSortControls = () => (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded overflow-hidden border text-sm">
        <button
          onClick={() => setAdminView('teams')}
          className={`px-3 py-1 ${adminView === 'teams' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
        >
          By Team
        </button>
        <button
          onClick={() => setAdminView('players')}
          className={`px-3 py-1 ${adminView === 'players' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
        >
          By Money
        </button>
      </div>
      {adminView === 'teams' && (
        <div className="flex rounded overflow-hidden border text-sm">
          <button
            onClick={() => setSortTeamsBy('number')}
            className={`px-3 py-1 ${sortTeamsBy === 'number' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
          >
            Sort: #
          </button>
          <button
            onClick={() => setSortTeamsBy('wealth')}
            className={`px-3 py-1 ${sortTeamsBy === 'wealth' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}
          >
            Sort: Wealth
          </button>
        </div>
      )}
    </div>
  );

  const renderPhase = () => {
    switch (gameState.phase) {
      case 'setup':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block">Number of Teams:</label>
                <input
                  type="number"
                  value={gameState.settings.numTeams}
                  onChange={(e) =>
                    updateGame({ settings: { ...gameState.settings, numTeams: parseInt(e.target.value) } })
                  }
                  className="w-full p-2 border rounded"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <label className="block">Initial Points:</label>
                <input
                  type="number"
                  value={gameState.settings.initialPoints}
                  onChange={(e) =>
                    updateGame({ settings: { ...gameState.settings, initialPoints: parseInt(e.target.value) } })
                  }
                  className="w-full p-2 border rounded"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <label className="block">Multiplier:</label>
                <input
                  type="number"
                  value={gameState.settings.multiplier}
                  onChange={(e) =>
                    updateGame({ settings: { ...gameState.settings, multiplier: parseFloat(e.target.value) } })
                  }
                  className="w-full p-2 border rounded"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
            <button
              onClick={() => updateGame({ phase: 'registration' })}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Start Registration
            </button>
          </div>
        );

      case 'registration':
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={gameState.settings.hidePoints}
                  onChange={(e) =>
                    updateGame({ settings: { ...gameState.settings, hidePoints: e.target.checked } })
                  }
                  className="form-checkbox"
                />
                <span>Hide Points</span>
              </label>
              {renderSortControls()}
              <button
                onClick={startGame}
                className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
              >
                Start Game
              </button>
            </div>
            {adminView === 'teams' ? renderTeamColumns() : renderPlayersSorted()}
          </div>
        );

      case 'voting':
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-2xl font-bold">Round {gameState.currentRound}</h2>
              {renderSortControls()}
            </div>
            {adminView === 'teams' ? renderTeamColumns() : renderPlayersSorted()}
            <button
              onClick={showResults}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Show Results
            </button>
          </div>
        );

      case 'results':
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-2xl font-bold">Round {gameState.currentRound} Results</h2>
              {renderSortControls()}
            </div>
            {adminView === 'teams' ? renderTeamColumns() : renderPlayersSorted()}
            <button
              onClick={nextRound}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              Next Round
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <h1 className="text-3xl font-bold">Admin View</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!gameState.settings.hidePoints}
                onChange={(e) =>
                  updateGame({ settings: { ...gameState.settings, hidePoints: !e.target.checked } })
                }
                className="form-checkbox"
              />
              <span>Reveal Scores</span>
            </label>
            <button
              onClick={resetScores}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
            >
              Reset Scores
            </button>
            <button
              onClick={resetGame}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Reset Game
            </button>
          </div>
        </div>
        {renderPhase()}
      </div>
    </div>
  );
}

// Student Component
function Student() {
  const [name, setName] = useState('');
  const [team, setTeam] = useState(1);
  const [playerId, setPlayerId] = useState(null);
  const [gameState, setGameState] = useState({ phase: 'setup' });
  const [contribution, setContribution] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  // Ref so the Firebase listener always sees the current phase without stale closures
  const phaseRef = useRef('setup');

  // Restore playerId from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('playerId');
    if (stored) setPlayerId(stored);
  }, []);

  // Real-time game state listener
  useEffect(() => {
    const gameRef = ref(db, 'game');
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const newGameState = snapshot.val();
      const oldPhase = phaseRef.current;
      phaseRef.current = newGameState.phase;
      setGameState(newGameState);

      const currentPlayerId = localStorage.getItem('playerId');

      // If admin removed this player, clear the stored id so registration shows again
      if (currentPlayerId && !newGameState.players?.[currentPlayerId]) {
        setPlayerId(null);
        localStorage.removeItem('playerId');
        return;
      }

      // Reset submission state when a new round starts
      if (oldPhase === 'results' && newGameState.phase === 'voting') {
        setSubmitted(false);
        setContribution(0);
      } else if (currentPlayerId && newGameState.phase === 'voting' && newGameState.players?.[currentPlayerId]) {
        const voteValue = newGameState.players[currentPlayerId].currentVote;
        const alreadySubmitted = voteValue != null;
        setSubmitted(alreadySubmitted);
        if (!alreadySubmitted) setContribution(0);
      }
    });
    return () => unsubscribe();
  }, []);

  const register = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const desiredKey = buildPlayerKey(trimmedName, team);
    const players = gameState.players || {};

    // Prefer a direct key match (new deterministic IDs), then fall back to legacy IDs
    const directMatch = players[desiredKey];
    const matchingEntry =
      directMatch && buildPlayerKey(directMatch.name || '', directMatch.team) === desiredKey
        ? [desiredKey, directMatch]
        : Object.entries(players).find(
            ([, player]) => buildPlayerKey(player.name || '', player.team) === desiredKey
          );

    const resolvedId = matchingEntry ? matchingEntry[0] : desiredKey;

    setPlayerId(resolvedId);
    localStorage.setItem('playerId', resolvedId);
    setSubmitted(false);
    setContribution(0);

    if (matchingEntry) {
      const [, record] = matchingEntry;
      if (record.name !== trimmedName || record.team !== team) {
        const updatedRecord = { ...record, name: trimmedName, team };
        set(ref(db, `game/players/${resolvedId}`), updatedRecord);
      }
      return;
    }

    set(ref(db, `game/players/${resolvedId}`), {
      name: trimmedName,
      team,
      points: gameState.settings?.initialPoints || 20,
      currentVote: null,
    });
  };

  const submitVote = () => {
    if (playerId) {
      set(ref(db, `game/players/${playerId}/currentVote`), parseInt(contribution));
      setSubmitted(true);
    }
  };

  const renderStudentInfo = () => {
    if (!playerId || !gameState.players?.[playerId]) return null;
    const player = gameState.players[playerId];
    return (
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="font-medium">Name: {player.name}</div>
        <div className="text-gray-600">Team: {player.team}</div>
        <div className="text-gray-600">Points: {player.points?.toFixed(1)}</div>
      </div>
    );
  };

  const renderPhase = () => {
    if (!gameState) return <div>Loading...</div>;

    // Show registration form when not yet joined (and game is running)
    if (!playerId && gameState.phase !== 'setup') {
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Register</h2>
          <p className="text-sm text-gray-500">
            Already registered? Enter the same name and team number to rejoin.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && register()}
              className="flex-1 p-2 border rounded min-w-0"
            />
            <select
              value={team}
              onChange={(e) => setTeam(parseInt(e.target.value))}
              className="p-2 border rounded"
            >
              {[...Array(gameState.settings?.numTeams || 0)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  Team {i + 1}
                </option>
              ))}
            </select>
            <button
              onClick={register}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Join
            </button>
          </div>
        </div>
      );
    }

    switch (gameState.phase) {
      case 'setup':
        return (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold">Please wait for the game to start...</h2>
          </div>
        );

      case 'registration':
        return (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold">Waiting for all players to join...</h2>
          </div>
        );

      case 'voting': {
        if (!gameState.players?.[playerId]) return null;
        const player = gameState.players[playerId];
        return (
          <div className="bg-white p-6 rounded-lg shadow space-y-6">
            <h2 className="text-xl font-bold">Round {gameState.currentRound}</h2>
            <div className="text-gray-600">Your current points: {player.points?.toFixed(1)}</div>
            {!submitted ? (
              <div className="space-y-4">
                <div>
                  <label className="block mb-2">
                    How much would you like to contribute? ({contribution})
                  </label>
                  <div className="flex items-center space-x-2">
                    <span>0</span>
                    <input
                      type="range"
                      min="0"
                      max={Math.floor(player.points)}
                      value={contribution}
                      onChange={(e) => setContribution(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <span>{Math.floor(player.points)}</span>
                  </div>
                </div>
                <button
                  onClick={submitVote}
                  className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
                >
                  Submit Points
                </button>
              </div>
            ) : (
              <div className="text-green-600 font-medium">
                Points sent! Waiting for other players...
              </div>
            )}
          </div>
        );
      }

      case 'results': {
        if (!gameState.players?.[playerId]) return null;
        const playerResults = gameState.players[playerId];
        const allPlayers = Object.values(gameState.players);
        const myTeam = playerResults.team;
        const teammates = allPlayers.filter((p) => p.team === myTeam && p !== playerResults);
        const teamPot = gameState.teamPots?.[myTeam] || 0;

        const myContribution = playerResults.lastContribution ?? 0;
        const teammateAvg =
          teammates.length > 0
            ? teammates.reduce((s, p) => s + (p.lastContribution ?? 0), 0) / teammates.length
            : null;
        const classAvg =
          allPlayers.reduce((s, p) => s + (p.lastContribution ?? 0), 0) / allPlayers.length;

        return (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <h2 className="text-xl font-bold">Round {gameState.currentRound} Results</h2>
            <div
              className={`text-lg font-medium ${
                playerResults.lastRoundChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              Round change:{' '}
              {playerResults.lastRoundChange >= 0 ? '+' : ''}
              {playerResults.lastRoundChange?.toFixed(1)} points
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-500">Your contribution</div>
                <div className="font-semibold text-lg">{myContribution.toFixed(1)}</div>
              </div>
              {teammateAvg !== null && (
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-gray-500">Teammate avg contribution</div>
                  <div className="font-semibold text-lg">{teammateAvg.toFixed(1)}</div>
                </div>
              )}
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-500">Class avg contribution</div>
                <div className="font-semibold text-lg">{classAvg.toFixed(1)}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-gray-500">Team pot (raw)</div>
                <div className="font-semibold text-lg">{teamPot.toFixed(1)}</div>
              </div>
              <div className="bg-blue-50 p-3 rounded col-span-2">
                <div className="text-gray-500">Your current money</div>
                <div className="font-bold text-2xl">{playerResults.points?.toFixed(1)} pts</div>
              </div>
            </div>

            <div className="text-gray-500 text-sm">Waiting for next round...</div>
          </div>
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Student View</h1>
        {renderStudentInfo()}
        {renderPhase()}
      </div>
    </div>
  );
}

// Main App Component
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/" element={<Student />} />
      </Routes>
    </Router>
  );
}

export default App;
