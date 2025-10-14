// Sound utility functions for the game

/**
 * Audio element for playing the click sound
 */
let clickAudio = null;

/**
 * Audio element for playing the correct guess sound
 */
let correctGuessAudio = null;

/**
 * Audio element for playing the incorrect guess sound
 */
let incorrectGuessAudio = null;

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
 * Initialize the correct guess audio element
 */
function initializeCorrectGuessAudio() {
  if (!correctGuessAudio) {
    try {
      correctGuessAudio = new Audio('/sounds/correct_guess.mp3');
      correctGuessAudio.volume = 0.5; // Set volume to a pleasant level
      correctGuessAudio.preload = 'auto';
    } catch (error) {
      console.warn('Correct guess audio not supported:', error);
    }
  }
}

/**
 * Initialize the incorrect guess audio element
 */
function initializeIncorrectGuessAudio() {
  if (!incorrectGuessAudio) {
    try {
      incorrectGuessAudio = new Audio('/sounds/incorrect_guess.mp3');
      incorrectGuessAudio.volume = 0.5; // Set volume to a pleasant level
      incorrectGuessAudio.preload = 'auto';
    } catch (error) {
      console.warn('Incorrect guess audio not supported:', error);
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
 * Play a correct guess sound
 */
export function playCorrectGuessSound() {
  try {
    // Initialize audio on first use
    if (!correctGuessAudio) {
      initializeCorrectGuessAudio();
    }

    if (correctGuessAudio) {
      // Reset the audio to the beginning in case it's already playing
      correctGuessAudio.currentTime = 0;
      
      // Play the sound
      const playPromise = correctGuessAudio.play();
      
      // Handle the promise to avoid unhandled rejection warnings
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Silently fail if audio doesn't work - don't break the game
          console.warn('Could not play correct guess sound:', error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn('Could not play correct guess sound:', error);
  }
}

/**
 * Play an incorrect guess sound
 */
export function playIncorrectGuessSound() {
  try {
    // Initialize audio on first use
    if (!incorrectGuessAudio) {
      initializeIncorrectGuessAudio();
    }

    if (incorrectGuessAudio) {
      // Reset the audio to the beginning in case it's already playing
      incorrectGuessAudio.currentTime = 0;
      
      // Play the sound
      const playPromise = incorrectGuessAudio.play();
      
      // Handle the promise to avoid unhandled rejection warnings
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Silently fail if audio doesn't work - don't break the game
          console.warn('Could not play incorrect guess sound:', error);
        });
      }
    }
  } catch (error) {
    // Silently fail if audio doesn't work - don't break the game
    console.warn('Could not play incorrect guess sound:', error);
  }
}

/**
 * Preload audio (call this on user interaction to prepare audio)
 */
export function preloadAudio() {
  initializeAudio();
  initializeCorrectGuessAudio();
  initializeIncorrectGuessAudio();
}
