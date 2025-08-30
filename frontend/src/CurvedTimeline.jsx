import React, { useState, useEffect, useMemo } from 'react';

const CurvedTimeline = ({ 
  timeline, 
  currentCard, 
  onNodeSelect, 
  selectedNodeIndex, 
  phase, 
  isMyTurn, 
  lastPlaced,
  challenge,
  feedback,
  showFeedback,
  pendingDropIndex,
  currentPlayerName 
}) => {
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState(null);

  // Calculate timeline layout with year-centric architecture
  const timelineLayout = useMemo(() => {
    const items = [...timeline];
    const layout = [];
    
    // Configuration - adjusted to match design mockup exactly
    const normalSpacing = 100; // Normal spacing between years
    const curveSpacing = 100; // No extended spacing - curves start directly from years
    const rowHeight = 80; // Height between timeline rows
    const startX = 100; // Starting X position
    const startY = 300; // Starting Y position
    const curveRadius = 50; // Radius for curve transitions
    
    // Only show confirmed years (not pending guesses)
    const confirmedItems = items.filter(item => 
      !lastPlaced || item.id !== lastPlaced.id || 
      (phase !== 'song-guess' && phase !== 'challenge-window' && phase !== 'challenge')
    );
    
    const totalYears = confirmedItems.length;
    let yearPositions = [];
    let sections = [];
    
    if (totalYears === 0) {
      // No years - create a single starting node
      layout.push({
        type: 'node',
        index: 0,
        x: startX,
        y: startY,
        isSelectable: isMyTurn && (phase === 'player-turn' || phase === 'challenge')
      });
      return layout;
    }
    
    // PHASE 1: Position years as the foundation
    for (let yearIndex = 0; yearIndex < totalYears; yearIndex++) {
      const sectionIndex = Math.floor(yearIndex / 3);
      const posInSection = yearIndex % 3;
      const sectionY = startY - (sectionIndex * rowHeight);
      const isEvenSection = sectionIndex % 2 === 0;
      
      let x, y = sectionY;
      
      if (isEvenSection) {
        // Even sections: left to right
        x = startX + posInSection * normalSpacing;
      } else {
        // Odd sections: right to left
        x = startX + (2 - posInSection) * normalSpacing;
      }
      
      yearPositions.push({ x, y, yearIndex, sectionIndex, posInSection });
      
      // Add year to layout
      layout.push({
        type: 'year',
        index: yearIndex,
        card: confirmedItems[yearIndex],
        x,
        y,
      });
    }
    
    // PHASE 2: Create sections between years and apply curve spacing
    for (let i = 0; i < yearPositions.length - 1; i++) {
      const currentYear = yearPositions[i];
      const nextYear = yearPositions[i + 1];
      
      // Determine section type
      const isSameSection = currentYear.sectionIndex === nextYear.sectionIndex;
      const sectionType = isSameSection ? 'straight' : 'curve';
      
      sections.push({
        type: sectionType,
        startYear: currentYear,
        endYear: nextYear,
        startX: currentYear.x,
        startY: currentYear.y,
        endX: nextYear.x,
        endY: nextYear.y
      });
    }
    
    // PHASE 2.5: Apply curve spacing - extend the final segment of complete sections
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      // Check if this is the final straight segment of a complete 3-year section
      if (section.type === 'straight') {
        const startYear = section.startYear;
        const endYear = section.endYear;
        
        // Check if the end year is the 3rd year of its section (posInSection === 2)
        // and there's a curve transition after it
        if (endYear.posInSection === 2 && i < sections.length - 1) {
          const nextSection = sections[i + 1];
          if (nextSection.type === 'curve') {
            // Extend this segment from the end year position
            const isEvenSection = endYear.sectionIndex % 2 === 0;
            
            if (isEvenSection) {
              // Even section going left to right - extend rightward from end year
              section.endX = endYear.x + (curveSpacing - normalSpacing);
            } else {
              // Odd section going right to left - extend leftward from end year
              section.endX = endYear.x - (curveSpacing - normalSpacing);
            }
          }
        }
      }
    }
    
    // PHASE 3: Place nodes as interactive layer on sections
    let nodeIndex = 0;
    
    // Add starting node before first year
    if (yearPositions.length > 0) {
      const firstYear = yearPositions[0];
      const nodeX = firstYear.x - normalSpacing / 2;
      layout.push({
        type: 'node',
        index: nodeIndex++,
        x: nodeX,
        y: firstYear.y,
        isSelectable: isMyTurn && (phase === 'player-turn' || phase === 'challenge')
      });
    }
    
    // Add nodes between years (on sections)
    sections.forEach((section, sectionIdx) => {
      if (section.type === 'straight') {
        // Node at midpoint of straight section
        const nodeX = (section.startX + section.endX) / 2;
        const nodeY = (section.startY + section.endY) / 2;
        
        layout.push({
          type: 'node',
          index: nodeIndex++,
          x: nodeX,
          y: nodeY,
          isSelectable: isMyTurn && (phase === 'player-turn' || phase === 'challenge')
        });
      } else {
        // Curve section - place node at midpoint with CSS shift
        const startYear = section.startYear;
        const endYear = section.endYear;
        
        // Calculate the midpoint of the curve
        const nodeX = (startYear.x + endYear.x) / 2;
        const nodeY = (startYear.y + endYear.y) / 2;
        
        // Determine curve direction for CSS shift
        const goingUp = endYear.y < startYear.y;
        const goingLeft = endYear.x < startYear.x;
        
        // Determine which way this specific curve bends to position node correctly
        let curveShift = 0;
        
        // Check the section indices to understand the curve direction
        const fromSectionIndex = startYear.sectionIndex;
        const toSectionIndex = endYear.sectionIndex;
        const fromEvenSection = fromSectionIndex % 2 === 0;
        const toEvenSection = toSectionIndex % 2 === 0;
        
        if (fromEvenSection && !toEvenSection) {
          // From even (left-to-right) to odd (right-to-left) section
          // Upper curve bends leftward - shift right to follow the curve
          curveShift = rowHeight / 2; // 50px right
        } else if (!fromEvenSection && toEvenSection) {
          // From odd (right-to-left) to even (left-to-right) section  
          // Lower curve bends rightward - shift left to follow the curve
          curveShift = -rowHeight / 2; // 50px left
        } else {
          // Fallback for other curve types
          curveShift = goingLeft ? rowHeight / 2 : -rowHeight / 2;
        }
        
        layout.push({
          type: 'node',
          index: nodeIndex++,
          x: nodeX,
          y: nodeY,
          curveShift: curveShift, // Use calculated shift based on curve direction
          isSelectable: isMyTurn && (phase === 'player-turn' || phase === 'challenge')
        });
      }
    });
    
    // Add final node after last year - consider section direction
    if (yearPositions.length > 0) {
      const lastYear = yearPositions[yearPositions.length - 1];
      const isEvenSection = lastYear.sectionIndex % 2 === 0;
      
      let nodeX;
      if (isEvenSection) {
        // Even section goes left to right - node goes to the right
        nodeX = lastYear.x + normalSpacing / 2;
      } else {
        // Odd section goes right to left - node goes to the left
        nodeX = lastYear.x - normalSpacing / 2;
      }
      
      layout.push({
        type: 'node',
        index: nodeIndex++,
        x: nodeX,
        y: lastYear.y,
        isSelectable: isMyTurn && (phase === 'player-turn' || phase === 'challenge')
      });
    }
    
    return layout;
  }, [timeline, isMyTurn, phase, lastPlaced]);

  // Generate SVG path based on years and sections, not nodes
  const generateCurvePath = useMemo(() => {
    const years = timelineLayout.filter(item => item.type === 'year');
    const nodes = timelineLayout.filter(item => item.type === 'node');
    
    // Define curveRadius in this scope
    const curveRadius = 40; // Radius for curve transitions
    
    if (years.length === 0) {
      // No years, just draw a simple line through nodes
      if (nodes.length < 2) return { mainPath: '', continuationPaths: [] };
      let mainPath = `M ${nodes[0].x} ${nodes[0].y}`;
      for (let i = 1; i < nodes.length; i++) {
        mainPath += ` L ${nodes[i].x} ${nodes[i].y}`;
      }
      return { mainPath, continuationPaths: [] };
    }
    
    let mainPath = '';
    let continuationPaths = [];
    
    // Start from the first node (before first year)
    if (nodes.length > 0) {
      mainPath = `M ${nodes[0].x} ${nodes[0].y}`;
      
      // Draw to first year
      if (years.length > 0) {
        mainPath += ` L ${years[0].x} ${years[0].y}`;
      }
    }
    
    // Process each year and determine if we need curves
    for (let i = 0; i < years.length - 1; i++) {
      const currentYear = years[i];
      const nextYear = years[i + 1];
      
      // Check if this is a section transition (different Y positions)
      const isVerticalTransition = Math.abs(nextYear.y - currentYear.y) > 50;
      
      if (isVerticalTransition) {
        // This is a curve transition - use SVG arcs for smooth curves
        const goingUp = nextYear.y < currentYear.y;
        const goingLeft = nextYear.x < currentYear.x;
        
        // Use SVG arcs with alternating sweep direction for smooth curves
        const currentSectionIndex = Math.floor(i / 3); // Which section transition this is
        const shouldCurveLeft = currentSectionIndex % 2 === 0; // Alternate curve directions
        
        // Use SVG arcs with alternating sweep direction
        const sweep = shouldCurveLeft ? 0 : 1; // Alternate sweep direction
        mainPath += ` A ${curveRadius} ${curveRadius} 0 0 ${sweep} ${nextYear.x} ${nextYear.y}`;
      } else {
        // Straight line to next year
        mainPath += ` L ${nextYear.x} ${nextYear.y}`;
      }
    }
    
    // Draw to final node (after last year)
    if (years.length > 0 && nodes.length > years.length) {
      const lastNode = nodes[nodes.length - 1];
      mainPath += ` L ${lastNode.x} ${lastNode.y}`;
    }
    
    // Add continuation lines from each node
    nodes.forEach((node, index) => {
      if (index < nodes.length - 1) {
        const nextNode = nodes[index + 1];
        const dx = nextNode.x - node.x;
        const dy = nextNode.y - node.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length > 0) {
          const unitX = dx / length;
          const unitY = dy / length;
          
          // Continuation line for better visibility (20px)
          const lineEndX = node.x + unitX * 20;
          const lineEndY = node.y + unitY * 20;
          
          continuationPaths.push(`M ${node.x} ${node.y} L ${lineEndX} ${lineEndY}`);
        }
      } else {
        // For the last node, add a fading extension line
        let extensionX, extensionY;
        
        if (index > 0) {
          const prevNode = nodes[index - 1];
          const direction = node.x > prevNode.x ? 1 : -1;
          extensionX = node.x + (direction * 60);
          extensionY = node.y;
        } else {
          extensionX = node.x + 60;
          extensionY = node.y;
        }
        
        continuationPaths.push({
          path: `M ${node.x} ${node.y} L ${extensionX} ${extensionY}`,
          fading: true
        });
      }
    });
    
    return { mainPath, continuationPaths };
  }, [timelineLayout]);

  // Handle node click
  const handleNodeClick = (nodeIndex) => {
    if (!isMyTurn || (phase !== 'player-turn' && phase !== 'challenge')) return;
    onNodeSelect(nodeIndex);
  };

  // Determine node visual state
  const getNodeState = (nodeIndex) => {
    // Use pendingDropIndex for selection state during active placement
    if (pendingDropIndex === nodeIndex) return 'selected';
    
    // During song-guess phase, preserve the originally selected node
    if (phase === 'song-guess' && lastPlaced) {
      // Find where the placed card is in the timeline
      const placedCardIndex = timeline.findIndex(card => card.id === lastPlaced.id);
      if (placedCardIndex >= 0) {
        // The card is at timeline position placedCardIndex
        // This corresponds to node position placedCardIndex (nodes are positioned before the years)
        const placedNodeIndex = placedCardIndex;
        if (nodeIndex === placedNodeIndex) {
          return 'selected'; // Keep the originally selected node highlighted
        }
      }
    }
    
    // Check if this node has a confirmed placed card (after reveal)
    if (nodeIndex < timeline.length && lastPlaced && timeline[nodeIndex]?.id === lastPlaced.id) {
      if (phase === 'reveal' || phase === 'challenge-resolved') {
        return lastPlaced.correct ? 'placed-correct' : 'placed-incorrect';
      }
    }
    
    if (hoveredNodeIndex === nodeIndex && isMyTurn) return 'hovered';
    return 'normal';
  };

  // Check if a node should be disabled during challenge
  const isNodeDisabled = (nodeIndex) => {
    if (phase !== 'challenge' || !challenge || !lastPlaced) return false;
    
    // During challenge, disable the node where the original card was placed
    // Find the original card's position in the timeline
    const originalCardIndex = timeline.findIndex(card => card.id === lastPlaced.id);
    if (originalCardIndex >= 0) {
      // The original card is at timeline position originalCardIndex
      // This corresponds to node position originalCardIndex (same index mapping as in getNodeState)
      return nodeIndex === originalCardIndex;
    }
    
    return false;
  };

  // Determine year visual state
  const getYearState = (card) => {
    // Handle challenge-resolved phase with special logic for challenger and original cards
    if (phase === 'challenge-resolved' && challenge && challenge.phase === 'resolved') {
      // Check if this is a challenger card
      if (card.challengerCard) {
        return challenge.result?.challengerCorrect ? 'green' : 'red';
      }
      // Check if this is an original card
      if (card.originalCard) {
        return challenge.result?.originalCorrect ? 'green' : 'red';
      }
      // For all other cards during challenge resolution, return normal (no special coloring)
      return 'normal';
    }
    
    if (!lastPlaced || card.id !== lastPlaced.id) return 'normal';
    
    if (phase === 'song-guess') return 'grey';
    if (phase === 'challenge-window' || (phase === 'challenge' && lastPlaced.phase === 'challenged')) {
      return 'grey';
    }
    if (phase === 'challenge-resolved' || lastPlaced.phase === 'resolved') {
      if (challenge && challenge.phase === 'resolved') {
        return challenge.originalCorrect ? 'green' : 'red';
      }
      return lastPlaced.correct ? 'green' : 'red';
    }
    
    return lastPlaced.correct ? 'green' : 'red';
  };

  // Years should only be visible for confirmed/resolved cards, not during active guessing
  const shouldShowYear = (card) => {
    // Don't show years for cards that are currently being guessed/challenged
    if (lastPlaced && card.id === lastPlaced.id) {
      // Only show year after the round is completely finished
      return phase === 'reveal' || phase === 'challenge-resolved' || 
             (phase !== 'song-guess' && phase !== 'challenge-window' && phase !== 'challenge');
    }
    // Show years for all other confirmed cards
    return true;
  };

  return (
    <div className="curved-timeline-container w-full h-full relative bg-background">
      
      {/* Timeline Title */}
      {currentPlayerName && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
          <h2 className="text-lg font-semibold text-foreground text-center">
            {currentPlayerName}'s timeline
          </h2>
        </div>
      )}
      
      {/* SVG Container for the curved path */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1 }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Main curved path line - enhanced styling */}
        <path
          d={generateCurvePath.mainPath}
          stroke="#4a5568"
          strokeWidth="16"
          fill="none"
          className="opacity-70"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Continuation lines from each node - enhanced */}
        {generateCurvePath.continuationPaths?.map((pathData, index) => {
          const pathString = typeof pathData === 'string' ? pathData : pathData.path;
          const isFading = typeof pathData === 'object' && pathData.fading;
          
          return (
            <path
              key={`continuation-${index}`}
              d={pathString}
              stroke="#4a5568"
              strokeWidth="3"
              fill="none"
              className={isFading ? "opacity-20" : "opacity-40"}
              strokeLinecap="round"
              style={isFading ? {
                strokeDasharray: "5,5",
                opacity: "0.2"
              } : {}}
            />
          );
        })}
      </svg>
      
      {/* Timeline Items */}
      <div className="relative w-full h-full" style={{ zIndex: 2 }}>
        {timelineLayout.map((item, index) => {
          if (item.type === 'node') {
            // Hide all nodes during reveal and challenge-resolved phases
            if (phase === 'reveal' || phase === 'challenge-resolved') {
              return null;
            }
            
            const nodeState = getNodeState(item.index);
            const nodeDisabled = isNodeDisabled(item.index);
            const nodeSelectable = item.isSelectable && !nodeDisabled;
            
            return (
              <div
                key={`node-${item.index}`}
                className={`absolute transition-all duration-200 ${
                  nodeSelectable ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed'
                } ${nodeDisabled ? 'opacity-50' : ''}`}
                style={{
                  left: item.x - 12 + (item.curveShift || 0),
                  top: item.y - 12,
                  width: 24,
                  height: 24,
                }}
                onClick={() => nodeSelectable && handleNodeClick(item.index)}
                onMouseEnter={() => nodeSelectable && setHoveredNodeIndex(item.index)}
                onMouseLeave={() => setHoveredNodeIndex(null)}
              >
                {/* Node Circle */}
                <div
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-200 ${
                    nodeDisabled
                      ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
                      : nodeState === 'selected'
                      ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
                      : nodeState === 'hovered'
                      ? 'bg-green-400 border-green-300 shadow-md shadow-green-400/30'
                      : nodeState === 'placed-correct'
                      ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
                      : nodeState === 'placed-incorrect'
                      ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/50'
                      : 'bg-gray-600 border-gray-500 shadow-md shadow-black/20'
                  }`}
                  style={{
                    filter: (nodeDisabled || nodeState === 'selected' || nodeState === 'placed-correct' || nodeState === 'placed-incorrect') ? 'url(#glow)' : 'none'
                  }}
                />
                
                {/* Selection indicator - only show flashing for non-disabled selected nodes */}
                {nodeState === 'selected' && !nodeDisabled && (
                  <div className="absolute inset-0 rounded-full border-2 border-green-300 animate-ping opacity-75" />
                )}
              </div>
            );
          }
          
          if (item.type === 'year') {
            const yearState = getYearState(item.card);
            const showYear = shouldShowYear(item.card);
            
            // Only render year if it should be shown
            if (!showYear) return null;
            
            return (
              <div
                key={`year-${item.index}`}
                className="absolute"
                style={{
                  left: item.x - 20,
                  top: item.y - 12,
                  width: 40,
                  height: 24,
                }}
              >
                <div
                  className={`w-full h-full rounded-lg shadow-md flex items-center justify-center text-xs font-bold transition-all duration-300 px-1 ${
                    yearState === 'green'
                      ? 'bg-green-600 text-white ring-1 ring-green-400'
                      : yearState === 'red'
                      ? 'bg-red-600 text-white ring-1 ring-red-400'
                      : yearState === 'grey'
                      ? 'bg-gray-600 text-white ring-1 ring-gray-400'
                      : 'bg-gray-700 text-white shadow-black/20'
                  }`}
                >
                  {item.card.year}
                </div>
              </div>
            );
          }
          
          return null;
        })}
      </div>
      
      {/* Current card indicator */}
      {currentCard && pendingDropIndex !== null && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="text-sm font-medium">Ready to place card</div>
          <div className="text-xs opacity-75">Check footer to confirm placement</div>
        </div>
      )}
    </div>
  );
};

export default CurvedTimeline;
