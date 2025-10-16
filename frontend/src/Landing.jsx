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
  const createButtonRef = useRef(null);
  const joinWithCodeButtonRef = useRef(null);
  const joinGameButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const isProgrammaticFocus = useRef(false);

  useEffect(() => {
    if (joining) {
      // Focus the first code input when the join view appears
      firstCodeRef.current?.focus();
    }
  }, [joining]);

  // Handle input focus to ensure visibility when virtual keyboard appears
  useEffect(() => {
    const handleInputFocus = (e) => {
      // Only handle for input elements
      if (e.target.tagName !== 'INPUT') return;
      
      // Skip scrolling if this is a programmatic focus (auto-advance)
      if (isProgrammaticFocus.current) {
        isProgrammaticFocus.current = false;
        return;
      }
      
      // Only scroll for the very first manual focus on code inputs
      // Check if this is the first code input and no other code inputs have values
      const isFirstCodeInput = e.target.id === 'code-0';
      const hasAnyCodeValues = joinCode.some(digit => digit !== '');
      
      if (isFirstCodeInput && !hasAnyCodeValues) {
        // Only scroll for the initial focus on the first code field
        setTimeout(() => {
          e.target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }, 300);
      }
    };

    // Add event listeners
    document.addEventListener('focusin', handleInputFocus);

    return () => {
      document.removeEventListener('focusin', handleInputFocus);
    };
  }, [joinCode]);

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
      if (nextInput) {
        // Flag this as programmatic focus to prevent scrolling
        isProgrammaticFocus.current = true;
        nextInput.focus();
      }
    }
  };

  const handleCodeKeyDown = (index, e) => {
    // Handle backspace to go to previous field
    if (e.key === "Backspace" && !joinCode[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      if (prevInput) {
        // Flag this as programmatic focus to prevent scrolling
        isProgrammaticFocus.current = true;
        prevInput.focus();
      }
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-between relative text-foreground px-6 landing-container"
      style={{
        backgroundColor: "#000000",
        // Use single height declaration to avoid conflicts
        minHeight: "100dvh",
        // Allow vertical scrolling when keyboard appears
        overflowY: "auto",
        overflowX: "hidden",
        // iOS optimizations
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        // Ensure proper safe area handling
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))"
      }}
    >
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/img/first_frame.jpg"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ zIndex: 0 }}
      >
        <source src="/videos/sound-wave-video.mp4" type="video/mp4" />
      </video>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/100 to-transparent z-[1]" />

      {/* Minimal Header */}
      <div className="text-center pt-8 sm:pt-12 relative z-10">
        <img
          src={beatablyLogo}
          alt="Beatably Logo"
          className="h-16 sm:h-20 w-auto mx-auto"
        />
      </div>

      <div className="w-full max-w-sm space-y-3 sm:space-y-4 relative z-10 pb-8 sm:pb-12">
        {!joining ? (
          <>
            {/* Name Input */}
            <div className="space-y-2">
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
              ref={createButtonRef}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button no-focus-outline flex items-center justify-center"
              disabled={!name.trim() || isCreating}
              onClick={() => {
                handleCreate();
                // Immediately blur after click to prevent focus ring
                if (createButtonRef.current) {
                  setTimeout(() => {
                    createButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (createButtonRef.current) {
                  createButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (createButtonRef.current) {
                  createButtonRef.current.blur();
                }
              }}
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
              ref={joinWithCodeButtonRef}
              variant="outline"
              className="w-full h-12 font-semibold touch-button no-focus-outline outline-button-override"
              disabled={!name.trim()}
              onClick={() => {
                handleStartJoin();
                // Immediately blur after click to prevent focus ring
                if (joinWithCodeButtonRef.current) {
                  setTimeout(() => {
                    joinWithCodeButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (joinWithCodeButtonRef.current) {
                  joinWithCodeButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (joinWithCodeButtonRef.current) {
                  joinWithCodeButtonRef.current.blur();
                }
              }}
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
              ref={joinGameButtonRef}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button no-focus-outline flex items-center justify-center"
              disabled={!name.trim() || joinCode.some((d) => !d) || isJoiningGame}
              onClick={() => {
                handleJoin();
                // Immediately blur after click to prevent focus ring
                if (joinGameButtonRef.current) {
                  setTimeout(() => {
                    joinGameButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (joinGameButtonRef.current) {
                  joinGameButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (joinGameButtonRef.current) {
                  joinGameButtonRef.current.blur();
                }
              }}
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
              ref={cancelButtonRef}
              variant="outline"
              className="w-full h-12 font-semibold touch-button no-focus-outline outline-button-override"
              onClick={() => {
                handleCancelJoin();
                // Immediately blur after click to prevent focus ring
                if (cancelButtonRef.current) {
                  setTimeout(() => {
                    cancelButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (cancelButtonRef.current) {
                  cancelButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (cancelButtonRef.current) {
                  cancelButtonRef.current.blur();
                }
              }}
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
