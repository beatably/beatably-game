import { useState } from "react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "./config";

// Teal section icons (mirrors the iOS SF Symbols used in HowToPlayView).
const ICONS = {
  trophy: <path d="M8 21h8m-4-4v4m-6-17h12v5a6 6 0 0 1-12 0V4Zm12 1h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3M6 5H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3" />,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  bubble: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H14" /></>,
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />,
  bulb: <><path d="M9 18h6m-5 3h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></>,
  note: <path d="M9 18V5l12-2v13M9 9l12-2" />,
};

const SECTIONS = [
  {
    icon: "trophy", title: "Goal", items: [
      "Be the first player to correctly place the target number of songs on your timeline.",
      "The default target is 10 songs. The host can change it in settings.",
    ],
  },
  {
    icon: "music", title: "On Your Turn", items: [
      "A song plays (30-second preview). Listen and figure out what year it's from.",
      "Tap a gap on your timeline to place the song where you think it fits chronologically.",
      "After placing, you'll see if you were right and what year the song is actually from.",
      "Correct placement adds the song to your timeline — wrong placement does not.",
    ],
  },
  {
    icon: "bubble", title: "Guess the Song", items: [
      "After placing a card, you can guess the song's title and artist for a bonus credit.",
      "You can also skip the guess if you don't know it.",
    ],
  },
  {
    icon: "coin", title: "Credits", items: [
      "Credits are the in-game currency shown as coins under your score.",
      "Earn credits by correctly guessing the song title and artist.",
      "Spend 1 credit to skip a song you don't want to place.",
      "Spend 1 credit to challenge another player's placement.",
    ],
  },
  {
    icon: "bolt", title: "Challenges", items: [
      "After any player places a card, a short challenge window opens.",
      "Spend 1 credit to challenge the placement — you'll place the same card where YOU think it goes.",
      "If the challenger is right and the original player was wrong, the challenger steals the card.",
      "If the original player was right, they keep the card. If both are wrong, the card is discarded.",
      "You cannot challenge your own placement.",
    ],
  },
  {
    icon: "bulb", title: "Tips", items: [
      "Save credits for challenges — stealing a card is more powerful than earning one.",
      "Easy mode uses chart hits. Advanced mode opens the full catalog across all genres.",
      "The host controls the music. Everyone hears it from one device.",
    ],
  },
];

function SectionCard({ icon, title, children }) {
  return (
    <div className="beat-card p-4" style={{ boxShadow: 'none' }}>
      <div className="flex items-center gap-2 mb-2.5" style={{ color: '#08AF9A' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
        <span className="font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

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
      <div className="flex items-center justify-between px-6 pt-16 pb-4 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-bold text-foreground">How to Play</h2>
        <button
          onClick={onClose}
          className="text-primary hover:opacity-80 transition-opacity text-base font-semibold leading-none no-focus-outline bg-transparent"
          aria-label="Close"
        >
          Done
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3 text-left text-sm text-foreground max-w-lg w-full mx-auto">
        {SECTIONS.map((section) => (
          <SectionCard key={section.title} icon={section.icon} title={section.title}>
            <div className="space-y-2">
              {section.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{ width: 5, height: 5, marginTop: 7, backgroundColor: 'rgba(8, 175, 154, 0.5)' }}
                  />
                  <span className="text-foreground leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}

        {/* Apple Music attribution */}
        <SectionCard icon="note" title="Music">
          <p className="text-foreground leading-relaxed mb-3">
            Song previews and album artwork are provided by Apple Music.
          </p>
          <a href="https://music.apple.com" target="_blank" rel="noopener noreferrer" className="inline-block press-scale" aria-label="Listen on Apple Music">
            <img src="/img/listen-on-apple-music.png" alt="Listen on Apple Music" style={{ height: 44, width: 'auto' }} />
          </a>
        </SectionCard>

        {/* Feedback section */}
        <div className="pt-4 pb-16">
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
              {feedbackError && <p className="text-xs text-destructive">{feedbackError}</p>}
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
