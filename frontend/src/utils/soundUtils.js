// Sound utility functions for the game

/**
 * Audio element for playing the click sound
 */
let clickAudio = null;

/**
 * Initialize the audio element with the sound file
 */
function initializeAudio() {
  if (!clickAudio) {
    try {
      clickAudio = new Audio('/sounds/drop_card_3.mp3');
      clickAudio.volume = 0.4; // Set volume to a pleasant level
      clickAudio.preload = 'auto';
    } catch (error) {
      console.warn('Audio not supported:', error);
    }
  }
}

/**
 * Play a click sound when a card is dropped
 */
export function playClickSound() {
  try {
    // Initialize audio on first use
    if (!clickAudio) {
      initializeAudio();
    }

    if (clickAudio) {
      // Reset the audio to the beginning in case it's already playing
      clickAudio.currentTime = 0;
      
      // Play the sound
      const playPromise = clickAudio.play();
      
      // Handle the promise to avoid unhandled rejection warnings
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Silently fail if audio doesn't work - don't break the game
          console.warn('Could not play click sound:', error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn('Could not play click sound:', error);
  }
}

/**
 * Preload audio (call this on user interaction to prepare audio)
 */
export function preloadAudio() {
  initializeAudio();
}
