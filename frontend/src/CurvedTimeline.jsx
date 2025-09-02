import React, { useState, useEffect, useMemo, useRef } from 'react';

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
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef(null);

  // Effect to measure container dimensions and handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: rect.width,
          height: rect.height
        });
      }
    };

    // Initial measurement
    updateDimensions();

    // Add resize listener
    window.addEventListener('resize', updateDimensions);
    
    // Use ResizeObserver if available for more accurate container size tracking
    let resizeObserver;
    if (window.ResizeObserver && containerRef.current) {
      resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  // Calculate timeline layout with year-centric architecture
  const timelineLayout = useMemo(() => {
    const items = [...timeline];
    const layout = [];
    
    // Configuration - adjusted to match design mockup exactly
    const normalSpacing = 100; // Normal spacing between years
    const curveSpacing = 100; // No extended spacing - curves start directly from years
    const rowHeight = 80; // Height between timeline rows
    const curveRadius = 50; // Radius for curve transitions
    
    // Dynamic positioning based on container dimensions
    const centerX = containerDimensions.width / 2;
    const centerY = containerDimensions.height / 2;
    
    // Only show confirmed years (not pending guesses)
    const confirmedItems = items.filter(item => 
      !lastPlaced || item.id !== lastPlaced.id || 
      (phase !== 'song-guess' && phase !== 'challenge-window' && phase !== 'challenge')
    );
    
    const totalYears = confirmedItems.length;
    
    if (totalYears === 0) {
      // No years - create a single starting node at center
      layout.push({
        type: 'node',
        index: 0,
        x: centerX,
        y: centerY,
        isSelectable: isMyTurn && (phase === 'player-turn' || phase === 'challenge')
      });
      return layout;
    }

    // PHASE 1: Calculate timeline positions using temporary coordinates
    let tempYearPositions = [];
    let tempSections = [];
    
    // Calculate positions relative to origin (0,0) first
    for (let yearIndex = 0; yearIndex < totalYears; yearIndex++) {
      const sectionIndex = Math.floor(yearIndex / 3);
      const posInSection = yearIndex % 3;
      const sectionY = -(sectionIndex * rowHeight); // Negative because timeline grows upward
      const isEvenSection = sectionIndex % 2 === 0;
      
      let x, y = sectionY;
      
      if (isEvenSection) {
        // Even sections: left to right
        x = posInSection * normalSpacing;
      } else {
        // Odd sections: right to left
        x = (2 - posInSection) * normalSpacing;
      }
      
      tempYearPositions.push({ x, y, yearIndex, sectionIndex, posInSection });
    }

    // PHASE 2: Calculate bounding box of the timeline
    let minX = Math.min(...tempYearPositions.map(pos => pos.x));
    let maxX = Math.max(...tempYearPositions.map(pos => pos.x));
    let minY = Math.min(...tempYearPositions.map(pos => pos.y));
    let maxY = Math.max(...tempYearPositions.map(pos => pos.y));
    
    // Extend bounds to include nodes (which extend beyond years)
    minX -= normalSpacing / 2; // First node extends left
    maxX += normalSpacing / 2; // Last node extends right
    
    // Calculate timeline dimensions
    const timelineWidth = maxX - minX;
    const timelineHeight = maxY - minY;
    
    // PHASE 3: Calculate centering offsets with responsive margins
    const minMargin = 50; // Minimum margin from container edges
    const availableWidth = containerDimensions.width - (2 * minMargin);
    const availableHeight = containerDimensions.height - (2 * minMargin);
    
    // Calculate scale factor if timeline is too large
    const scaleX = timelineWidth > availableWidth ? availableWidth / timelineWidth : 1;
    const scaleY = timelineHeight > availableHeight ? availableHeight / timelineHeight : 1;
    const scale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
    
    // Calculate final centering offsets
    const scaledWidth = timelineWidth * scale;
    const scaledHeight = timelineHeight * scale;
    const offsetX = centerX - (scaledWidth / 2) - (minX * scale);
    const offsetY = centerY - (scaledHeight / 2) - (minY * scale);
    
    // PHASE 4: Apply centering and scaling to create final positions
    let yearPositions = tempYearPositions.map(pos => ({
      ...pos,
      x: (pos.x * scale) + offsetX,
      y: (pos.y * scale) + offsetY
    }));
    
    // Add years to layout with final positions
    yearPositions.forEach((pos, index) => {
      layout.push({
        type: 'year',
        index: pos.yearIndex,
        card: confirmedItems[pos.yearIndex],
        x: pos.x,
        y: pos.y,
      });
    });
    
    // PHASE 5: Create sections between years and apply curve spacing (with scaled positions)
    let sections = [];
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
    
    // PHASE 6: Apply curve spacing - extend the final segment of complete sections (scaled)
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
            // Extend this segment from the end year position (scaled)
            const isEvenSection = endYear.sectionIndex % 2 === 0;
            const scaledCurveSpacing = (curveSpacing - normalSpacing) * scale;
            
            if (isEvenSection) {
              // Even section going left to right - extend rightward from end year
              section.endX = endYear.x + scaledCurveSpacing;
            } else {
              // Odd section going right to left - extend leftward from end year
              section.endX = endYear.x - scaledCurveSpacing;
            }
          }
        }
      }
    }
    
    // PHASE 7: Place nodes as interactive layer on sections (with scaled positions)
    let nodeIndex = 0;
    
    // Add starting node before first year
    if (yearPositions.length > 0) {
      const firstYear = yearPositions[0];
      const scaledNodeSpacing = (normalSpacing / 2) * scale;
      const nodeX = firstYear.x - scaledNodeSpacing;
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
        // Curve section - place node at midpoint with CSS shift (scaled)
        const startYear = section.startYear;
        const endYear = section.endYear;
        
        // Calculate the midpoint of the curve
        const nodeX = (startYear.x + endYear.x) / 2;
        const nodeY = (startYear.y + endYear.y) / 2;
        
        // Determine which way this specific curve bends to position node correctly (scaled)
        let curveShift = 0;
        const scaledRowHeight = rowHeight * scale;
        
        // Check the section indices to understand the curve direction
        const fromSectionIndex = startYear.sectionIndex;
        const toSectionIndex = endYear.sectionIndex;
        const fromEvenSection = fromSectionIndex % 2 === 0;
        const toEvenSection = toSectionIndex % 2 === 0;
        
        if (fromEvenSection && !toEvenSection) {
          // From even (left-to-right) to odd (right-to-left) section
          // Upper curve bends leftward - shift right to follow the curve
          curveShift = scaledRowHeight / 2;
        } else if (!fromEvenSection && toEvenSection) {
          // From odd (right-to-left) to even (left-to-right) section  
          // Lower curve bends rightward - shift left to follow the curve
          curveShift = -scaledRowHeight / 2;
        } else {
          // Fallback for other curve types
          const goingLeft = endYear.x < startYear.x;
          curveShift = goingLeft ? scaledRowHeight / 2 : -scaledRowHeight / 2;
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
    
    // Add final node after last year - consider section direction (scaled)
    if (yearPositions.length > 0) {
      const lastYear = yearPositions[yearPositions.length - 1];
      const isEvenSection = lastYear.sectionIndex % 2 === 0;
      const scaledNodeSpacing = (normalSpacing / 2) * scale;
      
      let nodeX;
      if (isEvenSection) {
        // Even section goes left to right - node goes to the right
        nodeX = lastYear.x + scaledNodeSpacing;
      } else {
        // Odd section goes right to left - node goes to the left
        nodeX = lastYear.x - scaledNodeSpacing;
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
  }, [timeline, isMyTurn, phase, lastPlaced, containerDimensions]);

  // Generate SVG path based on years and sections, not nodes
  const generateCurvePath = useMemo(() => {
    const years = timelineLayout.filter(item => item.type === 'year');
    const nodes = timelineLayout.filter(item => item.type === 'node');
    
    // Calculate the same scale factor used in timeline layout for consistent scaling
    const items = [...timeline];
    const confirmedItems = items.filter(item => 
      !lastPlaced || item.id !== lastPlaced.id || 
      (phase !== 'song-guess' && phase !== 'challenge-window' && phase !== 'challenge')
    );
    
    // Calculate scale factor (same logic as in timelineLayout)
    const normalSpacing = 100;
    const rowHeight = 80;
    const minMargin = 50;
    const availableWidth = containerDimensions.width - (2 * minMargin);
    const availableHeight = containerDimensions.height - (2 * minMargin);
    
    let scale = 1;
    if (confirmedItems.length > 0) {
      // Calculate timeline dimensions to determine scale
      const totalYears = confirmedItems.length;
      let tempYearPositions = [];
      
      for (let yearIndex = 0; yearIndex < totalYears; yearIndex++) {
        const sectionIndex = Math.floor(yearIndex / 3);
        const posInSection = yearIndex % 3;
        const sectionY = -(sectionIndex * rowHeight);
        const isEvenSection = sectionIndex % 2 === 0;
        
        let x, y = sectionY;
        if (isEvenSection) {
          x = posInSection * normalSpacing;
        } else {
          x = (2 - posInSection) * normalSpacing;
        }
        tempYearPositions.push({ x, y });
      }
      
      const minX = Math.min(...tempYearPositions.map(pos => pos.x)) - normalSpacing / 2;
      const maxX = Math.max(...tempYearPositions.map(pos => pos.x)) + normalSpacing / 2;
      const minY = Math.min(...tempYearPositions.map(pos => pos.y));
      const maxY = Math.max(...tempYearPositions.map(pos => pos.y));
      
      const timelineWidth = maxX - minX;
      const timelineHeight = maxY - minY;
      
      const scaleX = timelineWidth > availableWidth ? availableWidth / timelineWidth : 1;
      const scaleY = timelineHeight > availableHeight ? availableHeight / timelineHeight : 1;
      scale = Math.min(scaleX, scaleY, 1);
    }
    
    // Scale the curve radius proportionally with timeline compression
    const curveRadius = 40 * scale; // Radius scales with timeline compression
    
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
    
    // Removed all continuation lines from nodes
    
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

  // Check if a node should be disabled during challenge or challenge-window
  const isNodeDisabled = (nodeIndex) => {
    if ((phase !== 'challenge' && phase !== 'challenge-window') || !lastPlaced) return false;
    
    // During challenge or challenge-window, disable the node where the original card was placed
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

  // Helper function to check if we should show node labels (only for single year scenario)
  const shouldShowNodeLabels = () => {
    const confirmedYears = timelineLayout.filter(item => item.type === 'year');
    return confirmedYears.length === 1 && (phase === 'player-turn' || phase === 'challenge');
  };

  // Get the single year value for labels
  const getSingleYearValue = () => {
    const confirmedYears = timelineLayout.filter(item => item.type === 'year');
    return confirmedYears.length === 1 ? confirmedYears[0].card.year : null;
  };

  return (
    <div ref={containerRef} className="curved-timeline-container w-full h-full relative bg-background">
      
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
                      ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50 opacity-70'
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
                
                {/* Node labels for single year scenario */}
                {shouldShowNodeLabels() && (
                  <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
                    <div className=" text-gray-500 text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                      {item.index === 0 ? `← before` : `after →`}
                    </div>
                  </div>
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
      
    </div>
  );
};

export default CurvedTimeline;
