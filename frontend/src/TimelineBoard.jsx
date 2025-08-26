import React, { useState, useEffect } from "react";
import { useDrop } from "react-dnd";
import DraggableCard from "./DraggableCard";
import DragArrow from "./DragArrow";
import CardPlaceholder from "./CardPlaceholder";
import { playClickSound } from "./utils/soundUtils";

const CARD_TYPE = "SONG_CARD";

function TimelineBoard({ timeline, currentCard, onPlaceCard, feedback, showFeedback, cardOutline, lastPlaced, removingId, isMyTurn, gameRound, phase, challenge, onChallengePlaceCard, isPlayingMusic, onDragStateChange, pendingDropIndex, onPendingDrop }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingNewSong, setIsLoadingNewSong] = useState(false);
  const [challengePendingIndex, setChallengePendingIndex] = useState(null);

  // Notify parent component when drag state changes
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(isDragging);
    }
  }, [isDragging, onDragStateChange]);

  // Listen for custom touch drop events
  useEffect(() => {
    const handleCardDrop = (event) => {
      const { cardId, dropIndex } = event.detail;
      if (currentCard && currentCard.id === cardId) {
        playClickSound();
        // Always use pending drop for confirmation/cancel mechanism
        onPendingDrop(dropIndex);
      }
    };

    document.addEventListener('cardDrop', handleCardDrop);
    return () => {
      document.removeEventListener('cardDrop', handleCardDrop);
    };
  }, [currentCard, onPendingDrop]);

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
      // Challenger card should be green only if challenger was correct
      return challenge?.result?.challengerCorrect ? 'green' : 'red';
    }
    
    // Check if this is an original card (marked by backend)
    if (card.originalCard && phase === 'challenge-resolved') {
      // Original card should be green only if original player was correct
      return challenge?.result?.originalCorrect ? 'green' : 'red';
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

  // Create preview timeline when there's a pending drop
  const getPreviewTimeline = () => {
    if (pendingDropIndex === null || !currentCard) {
      return timeline;
    }
    
    const newTimeline = [...timeline];
    const previewCard = {
      ...currentCard,
      id: `preview-${currentCard.id}`,
      year: '?' // Hide year during preview
    };
    
    newTimeline.splice(pendingDropIndex, 0, previewCard);
    return newTimeline;
  };

  const displayTimeline = pendingDropIndex !== null ? getPreviewTimeline() : timeline;

  // Always render all drop zones, but only show the hovered one when dragging
  const dropZones = [];
  for (let i = 0; i <= Math.max(1, displayTimeline.length); i++) {
    const isDropActive = isDragging && hoverIndex === i;
    const isDisabled = isDropZoneDisabled(i);
    const isPreviewCard = pendingDropIndex !== null && i === pendingDropIndex;
    
    dropZones.push(
      <React.Fragment key={"drop-" + i}>
        <DropTarget
          index={i}
          isActive={isDropActive}
          onDrop={onPendingDrop}
          setHoverIndex={setHoverIndex}
          canDrop={isMyTurn && !showFeedback && !!currentCard && !isDisabled && pendingDropIndex === null}
          feedback={feedback}
          visible={isDragging}
          disabled={isDisabled}
          isDragging={isDragging}
        />
        {i < displayTimeline.length && (
          <TimelineCard
            key={displayTimeline[i].id}
            card={displayTimeline[i]}
            outline={getCardOutline(displayTimeline[i])}
            animateRemove={removingId === displayTimeline[i].id}
            hideYear={shouldHideYear(displayTimeline[i]) || isPreviewCard}
          />
        )}
      </React.Fragment>
    );
  }

  // Determine layout based on screen size - always use side-by-side on mobile
  const isMobile = window.innerWidth < 768; // md breakpoint
  const containerClasses = isMobile 
    ? "bg-background flex flex-row w-full max-w-3xl items-start justify-center gap-2"
    : "bg-background flex flex-col md:flex-row w-full max-w-3xl items-center md:items-start justify-center gap-2 md:gap-4";
  
  const timelineClasses = isMobile
    ? "flex flex-col items-center p-2 rounded-lg min-h-[700px] w-48 relative order-1"
    : "flex flex-col items-center p-2 rounded-lg min-h-[700px] w-full md:w-56 relative order-2 md:order-1";
    
  const cardContainerClasses = isMobile
    ? "flex flex-col items-center justify-start w-24 order-2 mt-8"
    : "flex flex-col items-center justify-center w-full md:flex-1 order-1 md:order-2 m-6 md:mb-0";

  // Determine if we should show the draggable card
  const showDraggableCard = isMyTurn && currentCard && !showFeedback && (phase === 'player-turn' || phase === 'challenge') && pendingDropIndex === null;
  
  return (
    <div className={containerClasses}>
      {/* Timeline - Always visible regardless of whose turn it is */}
      <div className={`${timelineClasses} bg-background border-border`}>
        <div className="text-xs text-muted-foreground mb-1">↑ Older songs</div>
        {dropZones}
        <div className="text-xs text-muted-foreground mt-1">↓ Newer songs</div>
      </div>
      
      
      {/* Card container - shows either draggable card or placeholder */}
      <div className={cardContainerClasses}>

      {/* Arrow - Always visible on mobile, positioned so tip points just right of timeline */}
      {isMobile && (
        <DragArrow className="-ml-16 z-10" />
      )}

        {showDraggableCard ? (
          <DraggableCard 
            card={currentCard} 
            type={CARD_TYPE} 
            outline={cardOutline} 
            setIsDragging={setIsDragging}
            isNewCard={isLoadingNewSong}
          />
        ) : (
          // Show placeholder when card is not present
          <CardPlaceholder />
        )}
      </div>
    </div>
  );
}

function TimelineCard({ card, outline, animateRemove, hideYear }) {
  let outlineClass = '';
  if (outline === 'green') outlineClass = 'ring-4 ring-primary';
  if (outline === 'red') outlineClass = 'ring-4 ring-destructive';
  if (outline === 'grey') outlineClass = 'ring-4 ring-border';
  if (outline === 'blue') outlineClass = 'ring-4 ring-accent';
  let removeClass = '';
  if (animateRemove) removeClass = 'animate-fadeOutUp';
  return (
    <div className={`bg-card px-2 py-1.5 rounded-lg shadow-xl shadow-black/20 text-center min-w-[80px] my-[1px] flex flex-col items-center transition-all duration-400 ${outlineClass} ${removeClass}`}>
      <div className="font-bold text-md text-card-foreground">{hideYear ? '?' : card.year}</div>
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
    borderColor = "border-destructive";
    backgroundColor = "bg-destructive/10";
    opacity = "opacity-50";
  } else if (isActive && feedback) {
    borderColor = feedback.correct ? "border-primary" : "border-destructive";
    backgroundColor = "bg-card";
    opacity = "opacity-100";
  } else if (isActive || isOver) {
    borderColor = "border-primary";
    backgroundColor = "bg-card";
    opacity = "opacity-100";
  } else if (isDragging && canDrop) {
    // Show all drop zones when dragging on mobile
    borderColor = "border-border";
    backgroundColor = "bg-card";
    opacity = "opacity-60";
  }

  const baseHeight = 4;
  const expandedHeight = 40;
  const mobileHeight = isDragging && canDrop ? 22 : baseHeight; // Larger on mobile when dragging

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
      {(isActive || isOver) && !disabled && <span className="text-xs text-muted-foreground">Place here</span>}
      {isDragging && canDrop && !isActive && !isOver && !disabled && (
        <span className="text-xs text-muted-foreground">Drop zone</span>
      )}
      {disabled && <span className="text-xs text-destructive">Blocked</span>}
    </div>
  );
}

export default TimelineBoard;
