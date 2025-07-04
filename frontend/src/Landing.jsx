import React, { useState } from "react";

function Landing({ onCreate, onJoin }) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setError("");
    onCreate(name);
  };

  const handleJoin = () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!/^\d{4}$/.test(joinCode)) {
      setError("Enter a valid 4-digit code");
      return;
    }
    setError("");
    onJoin(name, joinCode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="items-center justify-center text-center mb-16 px-24">
        <img src="img/beatably_logo.png" alt="Beatably Logo"></img>
      </div>
      <h1 className="text-5xl font-chewy mb-6">Let's play</h1>
      <div className="w-full max-w-lg p-8">
        <div className="mb-4 text-left">
          <label className="block text-sm font-medium mb-1">NAME</label>
          <input
            className="w-full p-2 rounded text-black"
            placeholder="Enter your or your teams' name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={16}
          />
        </div>
        <div className="flex flex-col mt-24 gap-4">
          <button
            className="bg-green-600 py-2 px-6 rounded font-semibold disabled:bg-gray-700 disabled:text-gray-400 transition-colors hover:bg-green-700 w-full"
            disabled={!name.trim()}
            onClick={handleCreate}
          >
            Create New Game
          </button>
          <div className="mt-2">OR</div>
          <div className="flex flex-col gap-3">
            <label className="block text-sm font-medium -mb-2 text-left">GAME CODE</label>
            <input
              className="w-full p-2 rounded text-black text-left mb-2"
              placeholder="4-digit code from the host"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0,4))}
              maxLength={4}
            />
            <button
              className="bg-green-600 py-2 rounded font-semibold  disabled:bg-gray-700 disabled:text-gray-400 transition-colors hover:bg-green-700 w-full"
              disabled={!name.trim() || joinCode.length !== 4}
              onClick={handleJoin}
            >
              Join Game
            </button>
          </div>
        </div>
        {error && <div className="text-red-400 mt-4 text-center">{error}</div>}
      </div>
    </div>
  );
}

export default Landing;
