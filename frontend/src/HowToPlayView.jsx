import { useState } from "react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "./config";

function HowToPlayView({ onClose, context = "landing" }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  async function handleFeedbackSubmit() {
    if (!feedbackText.trim()) return;
    setSubmitting(true);
    setFeedbackError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedbackText.trim(), context }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitted(true);
        setFeedbackText("");
      } else {
        setFeedbackError(data.error || "Failed to send. Please try again.");
      }
    } catch {
      setFeedbackError("Failed to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col" style={{ zIndex: 10000 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-24 pb-4 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-bold text-foreground">What is Beatably?</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none no-focus-outline"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5 text-left text-sm text-foreground max-w-lg w-full mx-auto">
            <section>
              <p className="text-muted-foreground leading-relaxed">
                Beatably is a multiplayer music game where players take turns placing songs on a
                personal timeline in the correct chronological order. First to build a long enough
                timeline wins.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">How a turn works</h3>
              <ol className="space-y-2 text-muted-foreground list-none">
                <li className="flex gap-2">
                  <span className="text-primary font-bold flex-shrink-0">1.</span>
                  <span>A song plays for everyone. It's your turn to place it.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold flex-shrink-0">2.</span>
                  <span>
                    Tap a gap on your timeline to place the song where you think it belongs
                    chronologically — before or after the songs already there.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold flex-shrink-0">3.</span>
                  <span>
                    Get it right and the song is added to your timeline. Get it wrong and it's
                    discarded — no points, and your timeline stays as-is.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold flex-shrink-0">4.</span>
                  <span>
                    First player to reach the target number of correctly placed songs wins (8, 10, or
                    12 depending on settings).
                  </span>
                </li>
              </ol>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Guess the song — earn credits</h3>
              <p className="text-muted-foreground leading-relaxed">
                After placing a song, you can try to guess the artist and title. A correct guess
                earns a credit. Credits can be spent to skip a song you find too hard and get a
                fresh one instead.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Challenge other players</h3>
              <p className="text-muted-foreground leading-relaxed">
                When another player places a song, you can spend a credit to challenge their
                placement. You'll place the same song on their timeline where you think it actually
                belongs. If you're right and they were wrong, you steal the song and add it to your
                own timeline. If they were right all along, they keep it.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Difficulty</h3>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  <span className="text-foreground font-medium">Easy:</span> Chart hits and popular
                  songs. Great for mixed groups and casual play.
                </p>
                <p>
                  <span className="text-foreground font-medium">Advanced:</span> Full catalogue
                  including deeper cuts across all genres. Best for music obsessives.
                </p>
              </div>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Settings</h3>
              <ul className="ml-3 space-y-1 text-muted-foreground list-disc">
                <li><span className="text-foreground">Song selection</span> — International chart hits, Swedish artists only, or a mix of both.</li>
                <li><span className="text-foreground">Decades</span> — Narrow the era from the 60s all the way to today.</li>
                <li><span className="text-foreground">Genres</span> — Filter by Pop, Rock, Indie, Electronic, or Hip-Hop (Advanced mode).</li>
                <li><span className="text-foreground">Win condition</span> — Set the target to 8, 10, or 12 correctly placed songs.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-foreground mb-2">Tips</h3>
              <ul className="ml-3 space-y-1 text-muted-foreground list-disc">
                <li>Use the songs already on your timeline as anchors — place relative to what you know.</li>
                <li>When in doubt, place between two songs you're unsure about to minimize the risk.</li>
                <li>Watch other players' timelines for clues about songs you've both heard.</li>
                <li>Save credits for songs you truly can't place — a skip can save your timeline.</li>
              </ul>
            </section>

            {/* Feedback section */}
            <div className="pt-8 pb-16 border-t border-border">
              {!showFeedback ? (
                <button
                  onClick={() => setShowFeedback(true)}
                  className="text-sm text-muted-foreground underline underline-offset-2 bg-transparent border-none cursor-pointer hover:text-foreground transition-colors no-focus-outline"
                >
                  Feedback
                </button>
              ) : submitted ? (
                <p className="text-sm text-primary">Thanks for your feedback!</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground font-medium">Share your feedback</p>
                  <textarea
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={4}
                    placeholder="Tell us what you think, report a bug, or suggest a feature..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    maxLength={2000}
                    autoFocus
                  />
                  {feedbackError && (
                    <p className="text-xs text-destructive">{feedbackError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button no-focus-outline"
                      onClick={handleFeedbackSubmit}
                      disabled={!feedbackText.trim() || submitting}
                    >
                      {submitting ? "Sending..." : "Send feedback"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 px-4 border border-border bg-transparent hover:bg-input font-semibold touch-button no-focus-outline"
                      onClick={() => { setShowFeedback(false); setFeedbackText(""); setFeedbackError(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
      </div>
    </div>
  );
}

export default HowToPlayView;
