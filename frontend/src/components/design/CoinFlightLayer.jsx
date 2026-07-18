import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CoinView } from './CoinView';

// Coin flight animations ported from iOS (GameView CoinPaymentAnimation /
// CoinAwardAnimation): payment = pop + fly up 340px fading; award = fly down
// from above into the player's score card, land (shrink + fade), then bounce
// the recipient card. Source/target positions come from the PlayerHeader card
// carrying data-player-card="<persistentId>".
function CoinFlightLayer({ flight, onDone }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!flight) return;
    const card = document.querySelector(`[data-player-card="${flight.persistentId}"]`);
    const rect = card?.getBoundingClientRect();
    if (!rect) {
      onDone();
      return;
    }
    setPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

    let bounceTimer;
    if (flight.type === 'award') {
      // Card bounce coincides with the coin landing (iOS: +0.42s)
      bounceTimer = setTimeout(() => {
        card.classList.add('beat-card-bounce');
        setTimeout(() => card.classList.remove('beat-card-bounce'), 500);
      }, 420);
    }
    const doneTimer = setTimeout(() => {
      setPos(null);
      onDone();
    }, flight.type === 'payment' ? 750 : 700);
    return () => {
      clearTimeout(bounceTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.id]);

  if (!flight || !pos) return null;

  return createPortal(
    <div
      className="fixed pointer-events-none"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', zIndex: 10500 }}
    >
      {flight.type === 'payment' ? (
        <div style={{ animation: 'coin-rise 0.42s ease-in 0.1s both' }}>
          <div style={{ animation: 'coin-pop 0.1s ease-out both' }}>
            <CoinView size={26} />
          </div>
        </div>
      ) : (
        <div style={{ animation: 'coin-fall 0.42s ease-out both' }}>
          <div style={{ animation: 'coin-land 0.18s ease-out 0.42s both' }}>
            <CoinView size={26} />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

export default CoinFlightLayer;
