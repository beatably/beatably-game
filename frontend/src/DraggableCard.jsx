import React, { useEffect, useState, useRef } from "react";
import { useDrag } from "react-dnd";

const CARD_TYPE = "SONG_CARD";

function DraggableCard({ card, type = CARD_TYPE, outline, setIsDragging, isNewCard }) {
  const [{ isDragging }, drag] = useDrag({
    type,
    item: { id: card.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [showBounce, setShowBounce] = useState(false);
  const [touchDragging, setTouchDragging] = useState(false);
  const cardRef = useRef(null);
  const touchStartRef = useRef(null);
  const dragPreviewRef = useRef(null);

  useEffect(() => {
    if (setIsDragging) setIsDragging(isDragging || touchDragging);
  }, [isDragging, touchDragging, setIsDragging]);

  // Trigger bounce animation when new card appears
  useEffect(() => {
    if (card?.id) {
      setShowBounce(true);
      const timer = setTimeout(() => {
        setShowBounce(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [card?.id]); // Trigger on every new card

  // Enhanced touch handling for Safari
  const handleTouchStart = (e) => {
    e.preventDefault(); // Prevent default Safari behavior
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      startTime: Date.now()
    };
    
    // Add visual feedback immediately
    if (cardRef.current) {
      cardRef.current.style.transform = 'scale(1.05)';
      cardRef.current.style.transition = 'transform 0.1s ease-out';
    }
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;
    
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Start dragging if moved more than 10px
    if (distance > 10 && !touchDragging) {
      setTouchDragging(true);
      
      // Prevent body scrolling during drag
      document.body.classList.add('dragging');
      
      // Create drag preview
      if (!dragPreviewRef.current && cardRef.current) {
        const preview = cardRef.current.cloneNode(true);
        preview.style.position = 'fixed';
        preview.style.pointerEvents = 'none';
        preview.style.zIndex = '9999';
        preview.style.opacity = '0.8';
        preview.style.transform = 'scale(1.1)';
        preview.style.transition = 'none';
        document.body.appendChild(preview);
        dragPreviewRef.current = preview;
      }
    }
    
    // Update drag preview position
    if (dragPreviewRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      dragPreviewRef.current.style.left = `${touch.clientX - rect.width / 2}px`;
      dragPreviewRef.current.style.top = `${touch.clientY - rect.height / 2}px`;
      
      // Check for drop zones
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = elementBelow?.closest('[data-drop-zone]');
      
      // Visual feedback for drop zones
      document.querySelectorAll('[data-drop-zone]').forEach(zone => {
        zone.classList.remove('drop-zone-active');
      });
      
      if (dropZone) {
        dropZone.classList.add('drop-zone-active');
      }
    }
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    
    if (touchDragging) {
      const touch = e.changedTouches[0];
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = elementBelow?.closest('[data-drop-zone]');
      
      if (dropZone) {
        const dropIndex = parseInt(dropZone.dataset.dropIndex);
        if (!isNaN(dropIndex)) {
          // Trigger the drop action
          const dropEvent = new CustomEvent('cardDrop', {
            detail: { cardId: card.id, dropIndex }
          });
          document.dispatchEvent(dropEvent);
        }
      }
      
      // Clean up drop zone highlights
      document.querySelectorAll('[data-drop-zone]').forEach(zone => {
        zone.classList.remove('drop-zone-active');
      });
    }
    
    // Clean up
    if (dragPreviewRef.current) {
      document.body.removeChild(dragPreviewRef.current);
      dragPreviewRef.current = null;
    }
    
    if (cardRef.current) {
      cardRef.current.style.transform = '';
      cardRef.current.style.transition = '';
    }
    
    // Re-enable body scrolling
    document.body.classList.remove('dragging');
    
    setTouchDragging(false);
    touchStartRef.current = null;
  };

  // Combine refs for both drag and touch handling
  const combinedRef = (element) => {
    cardRef.current = element;
    drag(element);
  };

  let outlineClass = "";
  if (outline === "green") outlineClass = "ring-4 ring-green-500";
  if (outline === "red") outlineClass = "ring-4 ring-red-500";

  return (
    <div
      ref={combinedRef}
      data-draggable="true"
      className={`bg-gray-600 ring-4 ring-yellow-500 p-4 rounded-lg shadow-md w-28 text-center cursor-move select-none transition-all duration-200 ${outlineClass} ${isDragging || touchDragging ? "opacity-50" : ""} ${showBounce ? "animate-bounce" : ""}`}
      style={{ 
        minHeight: 48,
        transform: showBounce ? 'scale(5.5)' : 'scale(1)',
        transition: showBounce ? 'transform 0.1s ease-out' : 'transform 0.2s ease-out',
        touchAction: 'none' // Prevent default touch behaviors
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="font-bold text-xl">?</div>
    </div>
  );
}

export default DraggableCard;
