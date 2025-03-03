// App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, get } from 'firebase/database';
import React, { useState, useEffect } from 'react';

// Initialize Firebase (replace with your config)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_DATABASE_URL,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID 
};



const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Admin Component
function Admin() {
  const [gameState, setGameState] = useState({
    phase: 'setup',
    settings: {
      numTeams: 3,
      initialPoints: 20,
      multiplier: 2,
      hidePoints: true,
    },
    players: {},
    currentRound: 1,
  });

  useEffect(() => {
    const gameRef = ref(db, 'game');
    onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        setGameState(snapshot.val());
      }
    });
  }, []);

  const updateGame = (updates) => {
    const gameRef = ref(db, 'game');
    set(gameRef, { ...gameState, ...updates });
  };

  const startGame = () => {
    updateGame({ phase: 'voting' });
  };

  const resetGame = () => {
    updateGame({
      phase: 'setup',
      settings: {
        numTeams: 3,
        initialPoints: 20,
        multiplier: 2,
        hidePoints: false,
      },
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
      };
    });
    updateGame({ players });
  };

  const showResults = () => {
    const players = { ...gameState.players };
    const teamPots = {};

    // Calculate team pots (raw contributions)
    Object.entries(players).forEach(([id, player]) => {
      if (!teamPots[player.team]) teamPots[player.team] = 0;
      teamPots[player.team] += player.currentVote || 0;
    });

    // Calculate and store changes before updating points
    Object.entries(players).forEach(([id, player]) => {
      const rawTeamPot = teamPots[player.team];
      const multipliedTeamPot = rawTeamPot * gameState.settings.multiplier; // Apply multiplier once
      const numTeamPlayers = Object.values(players).filter(
        (p) => p.team === player.team
      ).length;
      const share = multipliedTeamPot / numTeamPlayers; // Divide the multiplied pot
      const oldPoints = player.points || gameState.settings.initialPoints;
      const contribution = player.currentVote || 0;

      // Store the change (share minus contribution)
      player.lastRoundChange = share - contribution;

      // Update points (old points - contribution + share)
      player.points = oldPoints - contribution + share;
      player.currentVote = null;
    });

    updateGame({
      phase: 'results',
      players,
      teamPots,
    });
  };

  const nextRound = () => {
    updateGame({
      phase: 'voting',
      currentRound: gameState.currentRound + 1,
      teamPots: {},
    });
  };

  const renderTeamColumns = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(gameState.settings.numTeams)].map((_, i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-4">
              Team {i + 1}
              {gameState.phase === 'results' &&
                ` - Pot: ${gameState.teamPots[i + 1]?.toFixed(1) || 0}`}
            </h3>
            {Object.entries(gameState.players || {})
              .filter(([_, player]) => player.team === i + 1)
              .map(([id, player]) => (
                <div
                  key={id}
                  className={`p-2 mb-2 rounded ${
                    gameState.phase === 'voting'
                      ? player.currentVote !== null && player.currentVote >= 0
                        ? 'bg-green-100'
                        : 'bg-red-100'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{player.name}</div>
                  {!gameState.settings.hidePoints && (
                    <div className="text-sm text-gray-600">
                      {player.points?.toFixed(1)} points
                    </div>
                  )}
                  {gameState.phase === 'results' && (
                    <div className="text-sm text-green-600">
                      +
                      {(
                        (gameState.teamPots[player.team] *
                          gameState.settings.multiplier) /
                        Object.values(gameState.players).filter(
                          (p) => p.team === player.team
                        ).length
                      ).toFixed(1)}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  };

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
                    updateGame({
                      settings: {
                        ...gameState.settings,
                        numTeams: parseInt(e.target.value),
                      },
                    })
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
                    updateGame({
                      settings: {
                        ...gameState.settings,
                        initialPoints: parseInt(e.target.value),
                      },
                    })
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
                    updateGame({
                      settings: {
                        ...gameState.settings,
                        multiplier: parseFloat(e.target.value),
                      },
                    })
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
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={gameState.settings.hidePoints}
                  onChange={(e) =>
                    updateGame({
                      settings: {
                        ...gameState.settings,
                        hidePoints: e.target.checked,
                      },
                    })
                  }
                  className="form-checkbox"
                />
                <span>Hide Points</span>
              </label>
              <button
                onClick={startGame}
                className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
              >
                Start Game
              </button>
            </div>
            {renderTeamColumns()}
          </div>
        );

      case 'voting':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">
              Round {gameState.currentRound}
            </h2>
            {renderTeamColumns()}
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
            <h2 className="text-2xl font-bold">
              Round {gameState.currentRound} Results
            </h2>
            {renderTeamColumns()}
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
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Admin View</h1>
          <div className="space-x-4 flex items-center">
            <label className="flex items-center mr-4 space-x-2">
              <input
                type="checkbox"
                checked={!gameState.settings.hidePoints}
                onChange={(e) =>
                  updateGame({
                    settings: {
                      ...gameState.settings,
                      hidePoints: !e.target.checked,
                    },
                  })
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

// Add this to the top of the Student component function, right after all the useState declarations
useEffect(() => {
  // Try to get playerId from localStorage
  const storedPlayerId = localStorage.getItem('playerId');
  if (storedPlayerId) {
    setPlayerId(storedPlayerId);
  }
}, []);


 // Change this useEffect in the Student component
// In the Student component, modify the useEffect that listens for game state changes:

useEffect(() => {
  const gameRef = ref(db, 'game');
  const unsubscribe = onValue(gameRef, (snapshot) => {
    if (snapshot.exists()) {
      const newGameState = snapshot.val();
      const oldPhase = gameState.phase;
      setGameState(newGameState);
      
      // If phase changed from results to voting, explicitly reset submission state
      if (oldPhase === 'results' && newGameState.phase === 'voting') {
        setSubmitted(false);
        setContribution(0);
      }
      // Regular check for submission status during voting phase
      else if (playerId && newGameState.phase === 'voting' && newGameState.players?.[playerId]) {
        const alreadySubmitted = newGameState.players[playerId].currentVote !== null;
        setSubmitted(alreadySubmitted);
        
        if (!alreadySubmitted) {
          setContribution(0);
        }
      }
    }
  });
  
  return () => unsubscribe();
}, []); // Empty dependency array

// Modify the register function to save to localStorage
const register = () => {
  if (!name) return;
  const newPlayerId = Date.now().toString();
  setPlayerId(newPlayerId);
  // Store playerId in localStorage
  localStorage.setItem('playerId', newPlayerId);
  const playerData = {
    name,
    team,
    points: gameState.settings?.initialPoints || 20,
    currentVote: null,
  };
  set(ref(db, `game/players/${newPlayerId}`), playerData);
};
  const submitVote = () => {
    if (playerId) {
      set(
        ref(db, `game/players/${playerId}/currentVote`),
        parseInt(contribution)
      );
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
        <div className="text-gray-600">
  Points: {player.points?.toFixed(1)}
</div>

      </div>
    );
  };

  const renderPhase = () => {
    if (!gameState) return <div>Loading...</div>;

    if (!playerId && gameState.phase !== 'setup') {
      return (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Register</h2>
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 p-2 border rounded"
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
            <h2 className="text-xl font-bold mb-4">
              Please wait for the game to start...
            </h2>
          </div>
        );

      case 'registration':
        return (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">
              Waiting for all players to join...
            </h2>
          </div>
        );

      case 'voting':
        if (!gameState.players?.[playerId]) return null;
        const player = gameState.players[playerId];
        return (
          <div className="bg-white p-6 rounded-lg shadow space-y-6">
            <h2 className="text-xl font-bold">
              Round {gameState.currentRound}
            </h2>
            <div className="text-gray-600">
  Your current points: {player.points?.toFixed(1)}
</div>
            {!submitted ? (
              <div className="space-y-4">
                {/* Replace this section in the Student component, in the 'voting' phase render */}
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
      onChange={(e) => {
        const value = parseInt(e.target.value);
        setContribution(value);
      }}
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

      case 'results':
        if (!gameState.players?.[playerId]) return null;
        const playerResults = gameState.players[playerId];
        return (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <h2 className="text-xl font-bold">Round Results</h2>
            <div
              className={`text-lg font-medium ${
                playerResults.lastRoundChange > 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              Round change: {playerResults.lastRoundChange > 0 ? '+' : ''}
              {playerResults.lastRoundChange?.toFixed(1)} points
            </div>
            <div className="text-gray-600">
  Your current points: {player.points?.toFixed(1)}
</div>
            <div className="text-gray-600">Waiting for next round...</div>
          </div>
        );
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