import React, { useState, useEffect } from 'react';
import EventNotificationCard from './components/design/EventNotificationCard';

function SongGuessNotification({ notification, onClose }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (notification) {
      setOpen(true);

      // Auto-hide after 2 seconds (quick confirmation toast)
      const timer = setTimeout(() => {
        setOpen(false);
        setTimeout(() => onClose(), 300);
      }, 2000);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification]);

  if (!notification) return null;

  const { playerName } = notification;

  return (
    <EventNotificationCard
      open={open}
      accent="34, 197, 94"
      icon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      }
    >
      <div className="font-semibold text-foreground">{playerName}'s guess submitted!</div>
      <div className="text-muted-foreground text-xs mt-0.5">Result will be revealed at end of round</div>
    </EventNotificationCard>
  );
}

export default SongGuessNotification;
