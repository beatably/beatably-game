import React, { useState, useEffect } from 'react';

function SongGuessNotification({ notification, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      setIsExiting(false);
      
      // Auto-hide after 2 seconds (quick confirmation toast)
      const timer = setTimeout(() => {
        handleClose();
      }, 2000);
      
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

  const { playerName } = notification;

  return (
    <>
      {/* Centered notification popup - simple "submitted" confirmation */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-6 transition-all duration-300 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}>
        <div className={`container-card bg-card border-border shadow-2xl max-w-md w-full transform transition-all duration-300 ${
          isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}>
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center rounded-full flex-shrink-0">
                <div className="text-primary text-2xl">✓</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-lg text-foreground">
                  {playerName}'s guess submitted!
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Result will be revealed at end of round
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default SongGuessNotification;
