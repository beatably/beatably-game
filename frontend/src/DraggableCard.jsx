import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    if (setIsDragging) setIsDragging(isDragging);
  }, [isDragging, setIsDragging]);

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

  let outlineClass = "";
  if (outline === "green") outlineClass = "ring-4 ring-green-500";
  if (outline === "red") outlineClass = "ring-4 ring-red-500";

  return (
    <div
      ref={drag}
      className={`bg-gray-600 ring-4 ring-yellow-500 p-4 rounded-lg shadow-md w-28 text-center cursor-move select-none transition-all duration-200 ${outlineClass} ${isDragging ? "opacity-50" : ""} ${showBounce ? "animate-bounce" : ""}`}
      style={{ 
        minHeight: 48,
        transform: showBounce ? 'scale(5.5)' : 'scale(1)',
        transition: 'transform 0.1s ease-out'
      }}
    >
      <div className="font-bold text-xl">?</div>
    </div>
  );
}

export default DraggableCard;
