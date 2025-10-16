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
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const isUnlockedRef = useRef(false);
  const fadeTimerRef = useRef(null);
  const isIOSSafariRef = useRef(false);
  
  // Default to preview mode (full play mode is opt-in via settings)
  const [isFullPlayMode, setIsFullPlayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(null);
  
  // Derive preview mode from full play mode state
  const isPreviewMode = !isFullPlayMode;
  
  // Detect iOS Safari
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    isIOSSafariRef.current = isIOS || (isSafari && 'ontouchstart' in window);
    console.log('[PreviewMode] iOS Safari detected:', isIOSSafariRef.current);
  }, []);
  
  // Log initial state
  useEffect(() => {
    console.log('[PreviewMode] Initialized - Preview Mode:', isPreviewMode, 'Full Play Mode:', isFullPlayMode);
  }, []);
  
  // Initialize audio element and conditionally Web Audio API for iOS
  useEffect(() => {
    if (!audioRef.current) {
      // Create Audio element
      audioRef.current = new Audio();
      audioRef.current.setAttribute('playsinline', '');
      audioRef.current.setAttribute('webkit-playsinline', '');
      audioRef.current.preload = 'auto';
      
      // Event listeners  
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentTime(audioRef.current.currentTime);
        
        // Start fade-out 5 seconds before the end
        const timeRemaining = audioRef.current.duration - audioRef.current.currentTime;
        if (timeRemaining <= 5 && timeRemaining > 0 && !fadeTimerRef.current) {
          console.log('[PreviewMode] Starting fade-out');
          const fadeOutDuration = 5000; // 5 seconds
          const fadeOutSteps = 50;
          const fadeOutInterval = fadeOutDuration / fadeOutSteps;
          
          if (isIOSSafariRef.current && gainNodeRef.current) {
            // iOS: Use Web Audio API's native fade methods
            const currentTime = audioContextRef.current.currentTime;
            const startGain = gainNodeRef.current.gain.value;
            gainNodeRef.current.gain.setValueAtTime(startGain, currentTime);
            gainNodeRef.current.gain.linearRampToValueAtTime(0, currentTime + 5); // 5 second fade
            console.log('[PreviewMode] iOS Safari - Using Web Audio API native fade-out');
          } else {
            // Desktop: Use volume property fade-out
            const startVolume = audioRef.current.volume;
            const volumeDecrement = startVolume / fadeOutSteps;
            let currentVolume = startVolume;
            
            fadeTimerRef.current = setInterval(() => {
              currentVolume -= volumeDecrement;
              if (currentVolume <= 0 || audioRef.current.currentTime >= audioRef.current.duration) {
                audioRef.current.volume = 0;
                clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = null;
              } else {
                audioRef.current.volume = Math.max(0, currentVolume);
              }
            }, fadeOutInterval);
          }
        }
      });
      
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current.duration);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
        // Clear any ongoing fade timer
        if (fadeTimerRef.current) {
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        // Reset volume/gain for next play
        if (isIOSSafariRef.current && gainNodeRef.current) {
          gainNodeRef.current.gain.value = 1;
        } else {
          audioRef.current.volume = 1;
        }
      });
      
      audioRef.current.addEventListener('play', () => {
        setIsPlaying(true);
        // Resume AudioContext if suspended (iOS requirement)
        if (isIOSSafariRef.current && audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
      });
      
      audioRef.current.addEventListener('pause', () => {
        setIsPlaying(false);
        // Clear any ongoing fade timer when paused
        if (fadeTimerRef.current) {
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
      });
      
      audioRef.current.addEventListener('error', (e) => {
        console.error('[PreviewMode] Audio error:', e);
        setIsPlaying(false);
      });
      
      console.log('[PreviewMode] Audio element initialized');
    }
    
    return () => {
      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (isIOSSafariRef.current && audioContextRef.current && audioContextRef.current.state === 'running') {
        audioContextRef.current.suspend();
      }
    };
  }, []);
  
  // Play preview with fade-in (Web Audio API on iOS, volume property on desktop)
  const playPreview = async (previewUrl) => {
    if (!previewUrl) {
      console.warn('[PreviewMode] No preview URL provided');
      return false;
    }
    
    try {
      console.log('[PreviewMode] Loading preview:', previewUrl);
      
      // Clear any existing fade timer
      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      
      // Initialize Web Audio API only on iOS Safari (where volume property is locked)
      if (isIOSSafariRef.current && !audioContextRef.current) {
        console.log('[PreviewMode] Initializing Web Audio API for iOS Safari');
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        console.log('[PreviewMode] AudioContext state:', audioContextRef.current.state);
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        sourceNodeRef.current.connect(gainNodeRef.current);
        console.log('[PreviewMode] Web Audio API setup complete');
      }
      
      // iOS Safari unlock: Must load and attempt play synchronously in user gesture
      if (!isUnlockedRef.current) {
        console.log('[PreviewMode] First play - unlocking audio');
        isUnlockedRef.current = true;
        // Resume AudioContext on first user interaction (iOS requirement)
        if (isIOSSafariRef.current && audioContextRef.current && audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      }
      
      // Load new audio
      audioRef.current.src = previewUrl;
      audioRef.current.load();
      
      // Use Web Audio API native fades on iOS, volume property on desktop
      if (isIOSSafariRef.current && gainNodeRef.current) {
        // iOS: Use Web Audio API's native fade methods (more reliable than setInterval)
        const currentTime = audioContextRef.current.currentTime;
        gainNodeRef.current.gain.setValueAtTime(0, currentTime);
        gainNodeRef.current.gain.linearRampToValueAtTime(1, currentTime + 1); // 1 second fade
        console.log('[PreviewMode] iOS Safari - Using Web Audio API native fade-in');
      } else {
        // Desktop: Use volume property fade-in
        audioRef.current.volume = 0;
        console.log('[PreviewMode] Desktop - Starting fade-in');
      }
      
      // Play - this MUST be called synchronously in response to user gesture for iOS
      await audioRef.current.play();
      console.log('[PreviewMode] Audio play() called successfully');
      setCurrentPreviewUrl(previewUrl);
      setIsPlaying(true);
      
      // Only fade in on desktop browsers (not iOS - iOS uses Web Audio API native fades above)
      if (!isIOSSafariRef.current) {
        const fadeInDuration = 1000; // 1 second
        const fadeInSteps = 20;
        const fadeInInterval = fadeInDuration / fadeInSteps;
        const increment = 1 / fadeInSteps;
        
        let current = 0;
        fadeTimerRef.current = setInterval(() => {
          current += increment;
          if (current >= 1) {
            audioRef.current.volume = 1;
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
            console.log('[PreviewMode] Desktop fade-in complete');
          } else {
            audioRef.current.volume = current;
          }
        }, fadeInInterval);
      }
      
      console.log('[PreviewMode] Preview playing, isIOSSafari:', isIOSSafariRef.current);
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
