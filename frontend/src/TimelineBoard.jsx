import React from "react";
import Timeline from "./components/timeline/Timeline";
import { playClickSound } from "./utils/soundUtils";

function TimelineBoard({ timeline, currentCard, feedback, showFeedback, lastPlaced, isMyTurn, phase, challenge, pendingDropIndex, remotePreviewIndex, onPendingDrop, onCardTap, currentPlayerName, roomCode, myPersistentId, timelineOwnerPersistentId }) {
  // Handle node selection
  const handleNodeSelect = (nodeIndex) => {
    // PERSISTENT ID FIX: During challenge phase, validate that this player is actually the challenger
    if (phase === 'challenge') {
      // Only allow the actual challenger to click nodes
      if (!challenge?.challengerPersistentId || challenge.challengerPersistentId !== myPersistentId) {
        console.log('[TimelineBoard] Not the challenger, blocking node selection');
        return;
      }
    } else if (!isMyTurn) {
      // During normal play, only allow current player
      return;
    }

    if (phase !== 'player-turn' && phase !== 'challenge') return;

    playClickSound();

    // Use the existing pending drop system for confirmation
    onPendingDrop(nodeIndex);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 relative">
        <Timeline
          timeline={timeline}
          currentCard={currentCard}
          onNodeSelect={handleNodeSelect}
          phase={phase}
          isMyTurn={isMyTurn}
          lastPlaced={lastPlaced}
          challenge={challenge}
          feedback={feedback}
          showFeedback={showFeedback}
          pendingDropIndex={pendingDropIndex}
          remotePreviewIndex={remotePreviewIndex}
          onCardTap={onCardTap}
          currentPlayerName={currentPlayerName}
          roomCode={roomCode}
          myPersistentId={myPersistentId}
          timelineOwnerPersistentId={timelineOwnerPersistentId}
        />
      </div>
    </div>
  );
}

export default TimelineBoard;
