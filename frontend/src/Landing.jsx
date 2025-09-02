import React, { useState, useEffect, useRef } from "react";
import beatablyLogo from "./assets/beatably_logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Landing({ onCreate, onJoin }) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  const firstCodeRef = useRef(null);

  useEffect(() => {
    if (joining) {
      // Focus the first code input when the join view appears
      firstCodeRef.current?.focus();
    }
  }, [joining]);

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setError("");
    onCreate(name);
  };

  const handleStartJoin = () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setError("");
    setJoining(true);
  };

  const handleCancelJoin = () => {
    setError("");
    setJoining(false);
    setJoinCode(["", "", "", ""]);
  };

  const handleJoin = () => {
    // Name should already be set from first step, but validate defensively
    if (!name.trim()) {
      setError("Please enter your name");
      setJoining(false);
      return;
    }
    const code = joinCode.join("");
    if (!/^\d{4}$/.test(code)) {
      setError("Enter a valid 4-digit code");
      return;
    }
    setError("");
    onJoin(name, code);
  };

  const handleCodeChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...joinCode];
    newCode[index] = value;
    setJoinCode(newCode);

    // Auto-advance to next field
    if (value && index < 3) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleCodeKeyDown = (index, e) => {
    // Handle backspace to go to previous field
    if (e.key === "Backspace" && !joinCode[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-6 py-4"
      style={{ paddingBottom: "15px" }}
    >
      {/* Minimal Header */}
      <div className="text-center mb-8">
        <img
          src={beatablyLogo}
          alt="Beatably Logo"
          className="h-12 w-auto mx-auto"
        />
      </div>

      <div className="w-full max-w-sm space-y-4">
        {!joining ? (
          <>
            {/* Name Input */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm text-muted-foreground">
                Your Name
              </Label>
              <Input
                id="name"
                className="bg-input border-border text-foreground h-11 focus:ring-primary"
                placeholder="Enter your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
              />
            </div>

            {/* Primary CTA: Create a new game */}
            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button"
              disabled={!name.trim()}
              onClick={handleCreate}
            >
              Create new game
            </Button>

            {/* Secondary: Reveal join with code */}
            <Button
              variant="outline"
              className="w-full h-12 font-semibold touch-button"
              disabled={!name.trim()}
              onClick={handleStartJoin}
            >
              Join game with code
            </Button>
          </>
        ) : (
          <>
            {/* Join with 4-digit code */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Game Code</Label>
              <div className="flex gap-2 justify-center">
                {joinCode.map((digit, index) => (
                  <Input
                    key={index}
                    ref={index === 0 ? firstCodeRef : null}
                    id={`code-${index}`}
                    className="bg-input border-border text-foreground text-center h-12 w-12 text-lg focus:ring-primary"
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    maxLength={1}
                    inputMode="numeric"
                  />
                ))}
              </div>
            </div>

            {/* Primary CTA in join view */}
            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button"
              disabled={!name.trim() || joinCode.some((d) => !d)}
              onClick={handleJoin}
            >
              Join Game
            </Button>

            {/* Secondary: Cancel back to name input */}
            <Button
              variant="outline"
              className="w-full h-12 font-semibold touch-button"
              onClick={handleCancelJoin}
            >
              Cancel
            </Button>
          </>
        )}

        {/* Error Message - Inline */}
        {error && (
          <div className="text-destructive text-center text-sm mt-3 p-2 bg-destructive/10 rounded-md">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default Landing;
