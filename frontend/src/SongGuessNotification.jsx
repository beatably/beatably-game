import React, { useState, useEffect } from 'react';

function SongGuessNotification({ notification, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      setIsExiting(false);
      
      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        handleClose();
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300);
  };

  if (!notification || !isVisible) return null;

  const { playerName, correct, title, artist, tokensEarned } = notification;

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
      isExiting ? 'opacity-0 translate-y-[-20px]' : 'opacity-100 translate-y-0'
    }`}>
      <div className={`px-6 py-4 rounded-lg shadow-lg border-2 max-w-md mx-auto ${
        correct 
          ? 'bg-green-800 border-green-500 text-green-100' 
          : 'bg-red-800 border-red-500 text-red-100'
      }`}>
        <div className="flex items-center gap-3">
          <div className="text-2xl">
            {correct ? '🎵' : '❌'}
          </div>
          <div className="flex-1">
            <div className="font-bold text-lg">
              {correct ? `${playerName} guessed correctly!` : `${playerName} guessed incorrectly`}
            </div>
            {correct && tokensEarned && (
              <div className="text-sm font-semibold mt-1 text-green-200">
                +{tokensEarned} token{tokensEarned > 1 ? 's' : ''} earned!
              </div>
            )}
          </div>
          <button 
            onClick={handleClose}
            className="text-white hover:text-gray-300 text-xl font-bold ml-2"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export default SongGuessNotification;
