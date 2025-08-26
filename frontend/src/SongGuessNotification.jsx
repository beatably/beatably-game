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
      isExiting ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'
    }`}>
      <div className={`px-6 py-3 rounded-lg shadow-lg border max-w-md mx-auto ${
        correct
          ? 'bg-primary/10 border-primary/20 text-foreground'
          : 'bg-destructive/10 border-destructive text-destructive-foreground'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-full mr-2">
            <div className={`${correct ? 'text-primary' : 'text-destructive'} text-xl`}>
              {correct ? '🎵' : '❌'}
            </div>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-base text-foreground">
              {correct ? `${playerName} guessed correctly!` : `${playerName} guessed incorrectly`}
            </div>
            {correct && tokensEarned && (
              <div className="text-sm font-semibold mt-1 text-primary">
                +{tokensEarned} token{tokensEarned > 1 ? 's' : ''} earned!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SongGuessNotification;
