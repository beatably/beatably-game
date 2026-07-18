import React, { useEffect, useState } from 'react';
import EventNotificationCard from './components/design/EventNotificationCard';
import { CoinView } from './components/design/CoinView';

function CreditSpendNotification({ event, myPersistentId, onClose }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!event) return;

    setOpen(true);

    const timer = setTimeout(() => {
      setOpen(false);
      setTimeout(() => onClose?.(), 300);
    }, 2000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.eventId]);

  if (!event) return null;

  const isSelf = !!myPersistentId && myPersistentId === event.spenderPersistentId;
  const isChallenge = event.action === 'challenge';
  const actionText = isChallenge ? 'to challenge' : 'for a new song';
  const subtitleText = isChallenge ? 'Challenge started...' : 'Loading a new song...';

  return (
    <EventNotificationCard open={open} accent="245, 200, 66" icon={<CoinView size={22} />}>
      <div className="font-semibold text-foreground">
        {isSelf
          ? `You spent ${event.cost || 1} credit ${actionText}`
          : `${event.spenderName || 'A player'} spent ${event.cost || 1} credit ${actionText}`}
      </div>
      <div className="text-muted-foreground text-xs mt-0.5">{subtitleText}</div>
    </EventNotificationCard>
  );
}

export default CreditSpendNotification;
