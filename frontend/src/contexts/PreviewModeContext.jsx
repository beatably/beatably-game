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
  const fadeAnimationRef = useRef(null);
  const isIOSRef = useRef(false);
  
  // Default to preview mode (full play mode is opt-in via settings)
  const [isFullPlayMode, setIsFullPlayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(null);
  
  // Derive preview mode from full play mode state
  const isPreviewMode = !isFullPlayMode;
  
  // Detect iOS
  useEffect(() => {
    const ua = navigator.userAgent;
    isIOSRef.current = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    console.log('[PreviewMode] iOS detected:', isIOSRef.current);
  }, []);
  
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
        if (timeRemaining <= 5 && timeRemaining > 0 && !fadeOutTimerRef.current && !fadeAnimationRef.current) {
          console.log('[PreviewMode] Starting fade-out');
          const fadeOutDuration = 5000;
          const startTime = performance.now();
          const startValue = isIOSRef.current && gainNodeRef.current ? gainNodeRef.current.gain.value : audioRef.current.volume;
          
          const fadeOut = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / fadeOutDuration, 1);
            const value = startValue * (1 - progress);
            
            if (isIOSRef.current && gainNodeRef.current) {
              gainNodeRef.current.gain.value = Math.max(0, value);
            } else {
              audioRef.current.volume = Math.max(0, value);
            }
            
            if (progress < 1 && audioRef.current.currentTime < audioRef.current.duration) {
              fadeAnimationRef.current = requestAnimationFrame(fadeOut);
            } else {
              fadeAnimationRef.current = null;
              fadeOutTimerRef.current = null;
              console.log('[PreviewMode] Fade-out complete');
            }
          };
          
          fadeOutTimerRef.current = true; // Mark that fade-out has started
          fadeAnimationRef.current = requestAnimationFrame(fadeOut);
        }
      });
      
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current.duration);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
        // Clear any ongoing fade
        if (fadeAnimationRef.current) {
          cancelAnimationFrame(fadeAnimationRef.current);
          fadeAnimationRef.current = null;
        }
        fadeOutTimerRef.current = null;
        // Reset volume/gain for next play
        if (isIOSRef.current && gainNodeRef.current) {
          gainNodeRef.current.gain.value = 1;
        } else {
          audioRef.current.volume = 1;
        }
      });
      
      audioRef.current.addEventListener('play', () => {
        setIsPlaying(true);
        // Resume AudioContext if needed
        if (isIOSRef.current && audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
      });
      
      audioRef.current.addEventListener('pause', () => {
        setIsPlaying(false);
        // Clear any ongoing fade when paused
        if (fadeAnimationRef.current) {
          cancelAnimationFrame(fadeAnimationRef.current);
          fadeAnimationRef.current = null;
        }
        fadeOutTimerRef.current = null;
      });
      
      audioRef.current.addEventListener('error', (e) => {
        console.error('[PreviewMode] Audio error:', e);
        setIsPlaying(false);
      });
      
      console.log('[PreviewMode] Audio element initialized');
    }
    
    return () => {
      if (fadeAnimationRef.current) {
        cancelAnimationFrame(fadeAnimationRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (isIOSRef.current && audioContextRef.current?.state === 'running') {
        audioContextRef.current.suspend();
      }
    };
  }, []);
  
  // Play preview with fade-in (Web Audio API for iOS, requestAnimationFrame for smooth fades)
  const playPreview = async (previewUrl) => {
    if (!previewUrl) {
      console.warn('[PreviewMode] No preview URL provided');
      return false;
    }
    
    try {
      console.log('[PreviewMode] Loading preview:', previewUrl);
      
      // Cancel any ongoing fade animation
      if (fadeAnimationRef.current) {
        cancelAnimationFrame(fadeAnimationRef.current);
        fadeAnimationRef.current = null;
      }
      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      
      // Initialize Web Audio API for iOS (volume property is read-only on iOS)
      if (isIOSRef.current && !audioContextRef.current) {
        console.log('[PreviewMode] Initializing Web Audio API for iOS');
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        sourceNodeRef.current.connect(gainNodeRef.current);
      }
      
      // iOS Safari unlock
      if (!isUnlockedRef.current) {
        console.log('[PreviewMode] First play - unlocking audio');
        isUnlockedRef.current = true;
        if (isIOSRef.current && audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      }
      
      // Load new audio
      audioRef.current.src = previewUrl;
      audioRef.current.load();
      
      // Set initial volume/gain
      if (isIOSRef.current && gainNodeRef.current) {
        gainNodeRef.current.gain.value = 0;
      } else {
        audioRef.current.volume = 0;
      }
      
      // Play
      await audioRef.current.play();
      setCurrentPreviewUrl(previewUrl);
      setIsPlaying(true);
      
      // Fade in using requestAnimationFrame (more reliable than setInterval on iOS)
      const startTime = performance.now();
      const fadeInDuration = 1000;
      
      const fadeIn = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / fadeInDuration, 1);
        
        if (isIOSRef.current && gainNodeRef.current) {
          gainNodeRef.current.gain.value = progress;
        } else {
          audioRef.current.volume = progress;
        }
        
        if (progress < 1) {
          fadeAnimationRef.current = requestAnimationFrame(fadeIn);
        } else {
          fadeAnimationRef.current = null;
          console.log('[PreviewMode] Fade-in complete');
        }
      };
      
      fadeAnimationRef.current = requestAnimationFrame(fadeIn);
      console.log('[PreviewMode] Preview playing with fade-in');
      return true;
    } catch (error) {
      console.error('[PreviewMode] Error playing preview:', error);
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
