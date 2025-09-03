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
  const [isCreating, setIsCreating] = useState(false);
  const [isJoiningGame, setIsJoiningGame] = useState(false);

  const firstCodeRef = useRef(null);

  useEffect(() => {
    if (joining) {
      // Focus the first code input when the join view appears
      firstCodeRef.current?.focus();
    }
  }, [joining]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setError("");
    setIsCreating(true);
    try {
      await onCreate(name);
    } catch (error) {
      console.error('Error creating game:', error);
      setIsCreating(false);
    }
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

  const handleJoin = async () => {
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
    setIsJoiningGame(true);
    try {
      await onJoin(name, code);
    } catch (error) {
      console.error('Error joining game:', error);
      setIsJoiningGame(false);
    }
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
      className="flex flex-col items-center justify-end relative overflow-hidden text-foreground px-6 landing-container"
      style={{
        backgroundColor: "#000000",
        backgroundImage: "url('/img/bg-image-2.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        // Use viewport manager custom properties for better iOS handling
        minHeight: "calc(var(--vh, 1vh) * 100)",
        maxHeight: "calc(var(--vh, 1vh) * 100)",
        // Reduced padding since global CSS already handles safe areas
        paddingTop: "1rem",
        paddingBottom: "1rem",
        // Additional iOS Safari optimizations
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain"
      }}
    >
      {/* Gradient overlay for better readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 100%)"
        }}
      />
      {/* Minimal Header */}
      <div className="text-center mb-6 sm:mb-8 relative z-10">
        <img
          src={beatablyLogo}
          alt="Beatably Logo"
          className="h-10 sm:h-12 w-auto mx-auto"
        />
      </div>

      <div className="w-full max-w-sm space-y-3 sm:space-y-4 relative z-10">
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
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button flex items-center justify-center"
              disabled={!name.trim() || isCreating}
              onClick={handleCreate}
            >
              {isCreating && (
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {isCreating ? "Creating..." : "Create new game"}
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
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button flex items-center justify-center"
              disabled={!name.trim() || joinCode.some((d) => !d) || isJoiningGame}
              onClick={handleJoin}
            >
              {isJoiningGame && (
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {isJoiningGame ? "Joining..." : "Join Game"}
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
