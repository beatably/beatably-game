import React, { useEffect, useState } from 'react';

const CoinIcon = ({ className = "" }) => (
  <span className={`inline-block align-middle ${className}`}>
    <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" stroke="#BBB" strokeWidth="1" fill="#FFEB3B" />
      <circle cx="10" cy="10" r="5" fill="#FFD700" />
    </svg>
  </span>
);

function CreditSpendNotification({ event, myPersistentId, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!event) return;

    setIsVisible(true);
    setIsExiting(false);

    const timer = setTimeout(() => {
      handleClose();
    }, 2000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.eventId]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 250);
  };

  if (!event || !isVisible) return null;

  const isSelf = !!myPersistentId && myPersistentId === event.spenderPersistentId;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 transition-all duration-300 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className={`container-card bg-card border-border shadow-2xl max-w-md w-full transform transition-all duration-300 ${
          isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-primary/20 flex-shrink-0">
              <CoinIcon className="w-10 h-10" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-lg text-foreground">
                {isSelf
                  ? `You spent ${event.cost || 1} credit for a new song`
                  : `${event.spenderName || 'A player'} spent ${event.cost || 1} credit for a new song`}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Loading a new song...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreditSpendNotification;
