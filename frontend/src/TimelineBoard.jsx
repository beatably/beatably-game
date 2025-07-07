import React, { useState, useEffect } from "react";
import { useDrop } from "react-dnd";
import DraggableCard from "./DraggableCard";
import { playClickSound } from "./utils/soundUtils";

const CARD_TYPE = "SONG_CARD";

function TimelineBoard({ timeline, currentCard, onPlaceCard, feedback, showFeedback, cardOutline, lastPlaced, removingId, isMyTurn, gameRound, phase, challenge, onChallengePlaceCard, isPlayingMusic }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingNewSong, setIsLoadingNewSong] = useState(false);

  // Listen for custom touch drop events
  useEffect(() => {
    const handleCardDrop = (event) => {
      const { cardId, dropIndex } = event.detail;
      if (currentCard && currentCard.id === cardId) {
        playClickSound();
        onPlaceCard(dropIndex);
      }
    };

    document.addEventListener('cardDrop', handleCardDrop);
    return () => {
      document.removeEventListener('cardDrop', handleCardDrop);
    };
  }, [currentCard, onPlaceCard]);

  // Track when a new song is being loaded
  useEffect(() => {
    if (phase === 'player-turn' && currentCard) {
      // Show loading state briefly when new song starts
      setIsLoadingNewSong(true);
      const timer = setTimeout(() => {
        setIsLoadingNewSong(false);
      }, 1000); // Show loading for 1 second
      
      return () => clearTimeout(timer);
    }
  }, [currentCard?.id, phase]);

  // Determine card outline based on phase and challenge state
  const getCardOutline = (card) => {
    // Check if this is a challenger card (marked by backend)
    if (card.challengerCard && phase === 'challenge-resolved') {
      // Challenger card should be green only if challenger won
      return challenge?.result?.challengeWon ? 'green' : 'red';
    }
    
    // Check if this is an original card (marked by backend)
    if (card.originalCard && phase === 'challenge-resolved') {
      // Original card should be green only if original player won
      return challenge?.result?.challengeWon ? 'red' : 'green';
    }
    
    if (!lastPlaced || card.id !== lastPlaced.id) {
      return undefined;
    }
    if (phase === 'song-guess') {
      return 'grey';
    }
    
    if (phase === 'challenge-window' || (phase === 'challenge' && lastPlaced.phase === 'challenged')) {
      return 'grey'; // Grey outline during challenge window and challenge phase
    }
    
    if (phase === 'challenge-resolved' || lastPlaced.phase === 'resolved') {
      // Show green/red based on correctness after challenge resolution
      if (challenge && challenge.phase === 'resolved') {
        // Original player's card
        return challenge.originalCorrect ? 'green' : 'red';
      }
      return lastPlaced.correct ? 'green' : 'red';
    }
    
    return lastPlaced.correct ? 'green' : 'red';
  };

  // Determine if year should be hidden
  const shouldHideYear = (card) => {
    // Check if this is a challenger card during challenge phases
    if (card.challengerCard && (phase === 'challenge' || phase === 'challenge-window')) {
      return true;
    }
    
    // Check if this is an original card during challenge phases
    if (card.originalCard && (phase === 'challenge' || phase === 'challenge-window')) {
      return true;
    }
    
    if (!lastPlaced || card.id !== lastPlaced.id) {
      return false;
    }
    
    // Hide year for original placement until resolved, or during song-guess phase
    return phase === 'challenge-window' || phase === 'song-guess' || (phase === 'challenge' && lastPlaced.phase === 'challenged');
  };

  // Determine if a drop zone should be disabled during challenge
  const isDropZoneDisabled = (index) => {
    if (phase !== 'challenge' || !challenge || !lastPlaced) return false;
    
    // During challenge, disable drop zones around the original placement
    const originalIndex = challenge.originalIndex;
    return index === originalIndex || index === originalIndex + 1;
  };

  // Always render all drop zones, but only show the hovered one when dragging
  const dropZones = [];
  for (let i = 0; i <= Math.max(1, timeline.length); i++) {
    const isDropActive = isDragging && hoverIndex === i;
    const isDisabled = isDropZoneDisabled(i);
    
    dropZones.push(
      <React.Fragment key={"drop-" + i}>
        <DropTarget
          index={i}
          isActive={isDropActive}
          onDrop={onPlaceCard}
          setHoverIndex={setHoverIndex}
          canDrop={isMyTurn && !showFeedback && !!currentCard && !isDisabled}
          feedback={feedback}
          visible={isDragging}
          disabled={isDisabled}
          isDragging={isDragging}
        />
        {i < timeline.length && (
          <TimelineCard
            key={timeline[i].id}
            card={timeline[i]}
            outline={getCardOutline(timeline[i])}
            animateRemove={removingId === timeline[i].id}
            hideYear={shouldHideYear(timeline[i])}
          />
        )}
      </React.Fragment>
    );
  }

  return (
    <div className="flex flex-col md:flex-row w-full max-w-3xl items-center md:items-start justify-center gap-2 md:gap-4">
      {/* Timeline - Always visible regardless of whose turn it is */}
      <div className="flex flex-col items-center p-2 rounded-lg min-h-[300px] w-full md:w-56 relative order-2 md:order-1">
        <div className="text-xs text-gray-600 mb-1">↑ Older songs</div>
        {dropZones}
        <div className="text-xs text-gray-600 mt-1">↓ Newer songs</div>
      </div>
      {/* Draggable card only for active player during appropriate phases */}
      <div className="flex flex-col items-center justify-center w-full md:flex-1 order-1 md:order-2 m-6 md:mb-0">
        {isMyTurn && currentCard && !showFeedback && (phase === 'player-turn' || phase === 'challenge') && (
          <DraggableCard 
            card={currentCard} 
            type={CARD_TYPE} 
            outline={cardOutline} 
            setIsDragging={setIsDragging}
            isNewCard={isLoadingNewSong}
          />
        )}
      </div>
    </div>
  );
}

function TimelineCard({ card, outline, animateRemove, hideYear }) {
  let outlineClass = '';
  if (outline === 'green') outlineClass = 'ring-4 ring-green-500';
  if (outline === 'red') outlineClass = 'ring-4 ring-red-500';
  if (outline === 'grey') outlineClass = 'ring-4 ring-gray-400';
  if (outline === 'blue') outlineClass = 'ring-4 ring-blue-500';
  let removeClass = '';
  if (animateRemove) removeClass = 'animate-fadeOutUp';
  return (
    <div className={`bg-gray-700 px-2 py-2 rounded-lg shadow-xl shadow-black/20 text-center min-w-[80px] my-[1px] flex flex-col items-center transition-all duration-400 ${outlineClass} ${removeClass}`}>
      <div className="font-bold text-md">{hideYear ? '?' : card.year}</div>
    </div>
  );
}

function DropTarget({ index, isActive, onDrop, setHoverIndex, canDrop, feedback, visible, disabled, isDragging }) {
  const [{ isOver, canDrop: monitorCanDrop }, drop] = useDrop({
    accept: CARD_TYPE,
    canDrop: () => canDrop,
    hover: (item, monitor) => {
      if (monitor.isOver({ shallow: true }) && !disabled) {
        setHoverIndex(index);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
    drop: () => {
      setHoverIndex(null);
      playClickSound();
      onDrop(index);
    },
  });

  let borderColor = "border-transparent";
  let backgroundColor = "bg-transparent";
  let opacity = "opacity-30";
  
  if (disabled) {
    borderColor = "border-red-300";
    backgroundColor = "bg-red-100";
    opacity = "opacity-50";
  } else if (isActive && feedback) {
    borderColor = feedback.correct ? "border-green-500" : "border-red-500";
    backgroundColor = "bg-gray-600";
    opacity = "opacity-100";
  } else if (isActive || isOver) {
    borderColor = "border-blue-400";
    backgroundColor = "bg-gray-600";
    opacity = "opacity-100";
  } else if (isDragging && canDrop) {
    // Show all drop zones when dragging on mobile
    borderColor = "border-gray-500";
    backgroundColor = "bg-gray-700";
    opacity = "opacity-60";
  }

  const baseHeight = 8;
  const expandedHeight = 48;
  const mobileHeight = isDragging && canDrop ? 32 : baseHeight; // Larger on mobile when dragging

  return (
    <div
      ref={disabled ? null : drop}
      data-drop-zone={canDrop && !disabled ? "true" : undefined}
      data-drop-index={canDrop && !disabled ? index : undefined}
      className={`transition-all duration-200 w-24 rounded-lg my-[1px] flex items-center justify-center border-2 border-dashed ${borderColor} ${backgroundColor} ${opacity} ${
        (isActive || isOver) && !disabled ? "scale-105 px-2 py-4" : ""
      }`}
      style={{ 
        height: (isActive || isOver) && !disabled ? expandedHeight : mobileHeight,
        minHeight: baseHeight,
        zIndex: (isActive || isOver) && !disabled ? 10 : (isDragging && canDrop ? 5 : 1),
        pointerEvents: canDrop && !disabled ? "auto" : "none",
      }}
    >
      {(isActive || isOver) && !disabled && <span className="text-xs text-gray-300">Place here</span>}
      {isDragging && canDrop && !isActive && !isOver && !disabled && (
        <span className="text-xs text-gray-400">Drop zone</span>
      )}
      {disabled && <span className="text-xs text-red-400">Blocked</span>}
    </div>
  );
}

export default TimelineBoard;
