import React, { useState, useEffect, useRef } from "react";
import beatablyLogo from "./assets/beatably_logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Landing flow (iOS parity): step 1 enter a name, step 2 pick a game mode
// (multiplayer / solo / join). Solo has no settings, so it launches straight
// into a game; multiplayer goes to the waiting room; join asks for a code.
function Landing({ onCreate, onCreateSolo, onJoin, onShowHowToPlay, pendingJoinCode, onClearPendingJoin }) {
  const [step, setStep] = useState("name"); // "name" | "options" | "join"
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingSolo, setIsCreatingSolo] = useState(false);
  const [isJoiningGame, setIsJoiningGame] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const firstCodeRef = useRef(null);
  const isProgrammaticFocus = useRef(false);

  useEffect(() => {
    if (step === "join") firstCodeRef.current?.focus();
  }, [step]);

  // Ensure the first code input is visible when the virtual keyboard appears.
  useEffect(() => {
    const handleInputFocus = (e) => {
      if (e.target.tagName !== "INPUT") return;
      if (isProgrammaticFocus.current) {
        isProgrammaticFocus.current = false;
        return;
      }
      const isFirstCodeInput = e.target.id === "code-0";
      const hasAnyCodeValues = joinCode.some((digit) => digit !== "");
      if (isFirstCodeInput && !hasAnyCodeValues) {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }, 300);
      }
    };
    document.addEventListener("focusin", handleInputFocus);
    return () => document.removeEventListener("focusin", handleInputFocus);
  }, [joinCode]);

  // Blur on tap to avoid the persistent mobile focus ring.
  const press = (fn) => (e) => {
    e.currentTarget.blur();
    fn();
  };

  const goToOptions = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setError("");
    // Arrived via a shared join link / scanned QR: skip the options step and join directly.
    if (pendingJoinCode) {
      setIsJoiningGame(true);
      try {
        await onJoin(name, pendingJoinCode);
      } catch (err) {
        console.error("Error joining game from link:", err);
        setError(err?.message || "Couldn't join that game. It may have ended or the code is wrong.");
        onClearPendingJoin?.();
        setIsJoiningGame(false);
      }
      return;
    }
    setStep("options");
  };

  const shareUrl = "https://beatably.app";
  const handleShare = async () => {
    setError("");
    const shareData = {
      title: "Beatably",
      text: "Play Beatably — the music timeline party game!",
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err?.name !== "AbortError") console.error("Share failed:", err);
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCreate = async () => {
    setError("");
    setIsCreating(true);
    try {
      await onCreate(name);
    } catch (err) {
      console.error("Error creating game:", err);
      setIsCreating(false);
    }
  };

  const handleCreateSolo = async () => {
    setError("");
    setIsCreatingSolo(true);
    try {
      await onCreateSolo(name);
    } catch (err) {
      console.error("Error starting solo game:", err);
      setIsCreatingSolo(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.join("");
    if (!/^\d{4}$/.test(code)) {
      setError("Enter a valid 4-digit code");
      return;
    }
    setError("");
    setIsJoiningGame(true);
    try {
      await onJoin(name, code);
    } catch (err) {
      console.error("Error joining game:", err);
      setIsJoiningGame(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...joinCode];
    newCode[index] = value;
    setJoinCode(newCode);
    if (value && index < 3) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      if (nextInput) {
        isProgrammaticFocus.current = true;
        nextInput.focus();
      }
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === "Backspace" && !joinCode[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      if (prevInput) {
        isProgrammaticFocus.current = true;
        prevInput.focus();
      }
    }
  };

  const Spinner = () => (
    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  return (
    <div
      className="view-fade-in flex flex-col items-center justify-between relative text-foreground px-6 landing-container"
      style={{
        backgroundColor: "#000000",
        minHeight: "100dvh",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
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
        <source src="/videos/ghost5.mp4" type="video/mp4" />
      </video>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/100 to-transparent z-[1]" />

      {/* Minimal Header */}
      <div className="text-center pt-8 sm:pt-12 relative z-10">
        <img src={beatablyLogo} alt="Beatably Logo" className="h-16 sm:h-20 w-auto mx-auto" />
      </div>

      <div className="w-full max-w-sm space-y-3 sm:space-y-4 relative z-10 pb-8 sm:pb-12">
        {step === "name" && (
          <>
            {pendingJoinCode && (
              <div className="text-center text-sm text-foreground/70 pb-1">
                Joining game{" "}
                <span className="font-semibold text-foreground tracking-wider">{pendingJoinCode}</span>
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="name"
                className="bg-input border-border text-foreground h-11 focus:ring-primary"
                placeholder="Enter your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goToOptions()}
                maxLength={16}
                autoFocus
              />
            </div>
            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button no-focus-outline flex items-center justify-center"
              disabled={!name.trim() || isJoiningGame}
              onClick={press(goToOptions)}
            >
              {isJoiningGame && <Spinner />}
              {pendingJoinCode ? (isJoiningGame ? "Joining..." : "Join Game") : "Continue"}
            </Button>
          </>
        )}

        {step === "options" && (
          <>
            <div className="text-center text-sm text-foreground/70 pb-1">
              Playing as <span className="font-semibold text-foreground">{name}</span>
            </div>

            {/* Multiplayer — primary */}
            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button no-focus-outline flex items-center justify-center"
              disabled={isCreating || isCreatingSolo}
              onClick={press(handleCreate)}
            >
              {isCreating && <Spinner />}
              {isCreating ? "Creating..." : "Create multiplayer game"}
            </Button>

            {/* Solo */}
            <Button
              variant="outline"
              className="w-full h-12 font-semibold touch-button no-focus-outline outline-button-override flex items-center justify-center"
              disabled={isCreating || isCreatingSolo}
              onClick={press(handleCreateSolo)}
            >
              {isCreatingSolo && <Spinner />}
              {isCreatingSolo ? "Starting..." : "Play solo"}
            </Button>

            {/* Join */}
            <Button
              variant="outline"
              className="w-full h-12 font-semibold touch-button no-focus-outline outline-button-override"
              disabled={isCreating || isCreatingSolo}
              onClick={press(() => {
                setError("");
                setStep("join");
              })}
            >
              Join a game
            </Button>

            <div className="text-center pt-1">
              <button
                onClick={press(() => {
                  setError("");
                  setStep("name");
                })}
                className="text-sm text-foreground/50 underline underline-offset-2 bg-transparent border-none cursor-pointer hover:text-foreground transition-colors no-focus-outline touch-button"
              >
                ← Change name
              </button>
            </div>
          </>
        )}

        {step === "join" && (
          <>
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
            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button no-focus-outline flex items-center justify-center"
              disabled={joinCode.some((d) => !d) || isJoiningGame}
              onClick={press(handleJoin)}
            >
              {isJoiningGame && <Spinner />}
              {isJoiningGame ? "Joining..." : "Join Game"}
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 font-semibold touch-button no-focus-outline outline-button-override"
              onClick={press(() => {
                setError("");
                setJoinCode(["", "", "", ""]);
                setStep("options");
              })}
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

        {/* Secondary actions — compact, one row */}
        <div className="mt-8 pt-4 flex items-center justify-center gap-6">
          <button
            onClick={onShowHowToPlay}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 bg-transparent border-none cursor-pointer hover:text-foreground transition-colors no-focus-outline touch-button whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            About the game
          </button>
          <button
            onClick={press(handleShare)}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 bg-transparent border-none cursor-pointer hover:text-foreground transition-colors no-focus-outline touch-button whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {shareCopied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Landing;
