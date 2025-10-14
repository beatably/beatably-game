import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const PreviewModeContext = createContext();

export function usePreviewMode() {
  const context = useContext(PreviewModeContext);
  if (!context) {
    throw new Error('usePreviewMode must be used within PreviewModeProvider');
  }
  return context;
}

export function PreviewModeProvider({ children }) {
  const audioRef = useRef(null);
  const isUnlockedRef = useRef(false);
  
  // Default to preview mode (full play mode is opt-in via settings)
  const [isFullPlayMode, setIsFullPlayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(null);
  
  // Derive preview mode from full play mode state
  const isPreviewMode = !isFullPlayMode;
  
  // Log initial state
  useEffect(() => {
    console.log('[PreviewMode] Initialized - Preview Mode:', isPreviewMode, 'Full Play Mode:', isFullPlayMode);
  }, []);
  
  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.setAttribute('playsinline', '');
      audioRef.current.setAttribute('webkit-playsinline', '');
      audioRef.current.preload = 'auto';
      
      // Track if we're currently fading out
      const fadeOutTimerRef = { current: null };
      
      // Event listeners
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentTime(audioRef.current.currentTime);
        
        // Start fade-out 5 seconds before the end
        const timeRemaining = audioRef.current.duration - audioRef.current.currentTime;
        if (timeRemaining <= 5 && timeRemaining > 0 && !fadeOutTimerRef.current) {
          console.log('[PreviewMode] Starting fade-out');
          const fadeOutDuration = 5000; // 5 seconds
          const fadeOutSteps = 50;
          const fadeOutInterval = fadeOutDuration / fadeOutSteps;
          const startVolume = audioRef.current.volume;
          const volumeDecrement = startVolume / fadeOutSteps;
          
          let currentVolume = startVolume;
          fadeOutTimerRef.current = setInterval(() => {
            currentVolume -= volumeDecrement;
            if (currentVolume <= 0 || audioRef.current.currentTime >= audioRef.current.duration) {
              audioRef.current.volume = 0;
              clearInterval(fadeOutTimerRef.current);
              fadeOutTimerRef.current = null;
            } else {
              audioRef.current.volume = Math.max(0, currentVolume);
            }
          }, fadeOutInterval);
        }
      });
      
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current.duration);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
        // Clear any ongoing fade-out timer
        if (fadeOutTimerRef.current) {
          clearInterval(fadeOutTimerRef.current);
          fadeOutTimerRef.current = null;
        }
        // Reset volume for next play
        audioRef.current.volume = 1;
      });
      
      audioRef.current.addEventListener('play', () => {
        setIsPlaying(true);
      });
      
      audioRef.current.addEventListener('pause', () => {
        setIsPlaying(false);
        // Clear any ongoing fade-out timer when paused
        if (fadeOutTimerRef.current) {
          clearInterval(fadeOutTimerRef.current);
          fadeOutTimerRef.current = null;
        }
      });
      
      audioRef.current.addEventListener('error', (e) => {
        console.error('[PreviewMode] Audio error:', e);
        setIsPlaying(false);
      });
      
      console.log('[PreviewMode] Audio element initialized');
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);
  
  // Play preview with fade-in and iOS Safari unlock
  const playPreview = async (previewUrl) => {
    if (!previewUrl) {
      console.warn('[PreviewMode] No preview URL provided');
      return false;
    }
    
    try {
      console.log('[PreviewMode] Loading preview:', previewUrl);
      
      // iOS Safari unlock: Must load and attempt play synchronously in user gesture
      if (!isUnlockedRef.current) {
        console.log('[PreviewMode] First play - unlocking audio for iOS Safari');
        isUnlockedRef.current = true;
      }
      
      // Load new audio
      audioRef.current.src = previewUrl;
      audioRef.current.load();
      
      // Start with volume at 0 for fade-in
      audioRef.current.volume = 0;
      
      // Play - this MUST be called synchronously in response to user gesture for iOS
      await audioRef.current.play();
      setCurrentPreviewUrl(previewUrl);
      setIsPlaying(true);
      
      // Fade in over 1 second
      const fadeInDuration = 1000; // 1 second
      const fadeInSteps = 20;
      const fadeInInterval = fadeInDuration / fadeInSteps;
      const volumeIncrement = 1 / fadeInSteps;
      
      let currentVolume = 0;
      const fadeInTimer = setInterval(() => {
        currentVolume += volumeIncrement;
        if (currentVolume >= 1) {
          audioRef.current.volume = 1;
          clearInterval(fadeInTimer);
        } else {
          audioRef.current.volume = currentVolume;
        }
      }, fadeInInterval);
      
      console.log('[PreviewMode] Preview playing with fade-in');
      return true;
    } catch (error) {
      console.error('[PreviewMode] Error playing preview:', error);
      
      // If NotAllowedError, audio needs to be unlocked with user gesture
      if (error.name === 'NotAllowedError') {
        console.warn('[PreviewMode] Audio blocked - user interaction required');
        isUnlockedRef.current = false;
      }
      
      setIsPlaying(false);
      return false;
    }
  };
  
  // Pause preview
  const pausePreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      console.log('[PreviewMode] Preview paused');
    }
  };
  
  // Resume preview
  const resumePreview = async () => {
    if (audioRef.current && currentPreviewUrl) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        console.log('[PreviewMode] Preview resumed');
        return true;
      } catch (error) {
        console.error('[PreviewMode] Error resuming preview:', error);
        return false;
      }
    }
    return false;
  };
  
  // Stop preview
  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentPreviewUrl(null);
      console.log('[PreviewMode] Preview stopped');
    }
  };
  
  // Seek to position
  const seekPreview = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };
  
  // Method to enable/disable full play mode
  const setFullPlayMode = (enabled) => {
    console.log('[PreviewMode] Setting Full Play Mode:', enabled);
    setIsFullPlayMode(enabled);
  };
  
  const value = {
    isPreviewMode,
    isFullPlayMode,
    setFullPlayMode,
    isPlaying,
    currentTime,
    duration,
    playPreview,
    pausePreview,
    resumePreview,
    stopPreview,
    seekPreview
  };
  
  return (
    <PreviewModeContext.Provider value={value}>
      {children}
    </PreviewModeContext.Provider>
  );
}
