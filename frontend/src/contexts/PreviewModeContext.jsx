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
  const sourceCreatedRef = useRef(false); // Guard against double MediaElementSource creation
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
      audioRef.current.setAttribute('crossorigin', 'anonymous'); // For Spotify CDN
      audioRef.current.preload = 'auto';
      
      // Track if we're currently fading out
      const fadeOutTimerRef = { current: null };
      
      // Event listeners
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentTime(audioRef.current.currentTime);
        
        // Desktop fade-out using RAF
        if (!isIOSRef.current) {
          const timeRemaining = audioRef.current.duration - audioRef.current.currentTime;
          if (timeRemaining <= 8 && timeRemaining > 0 && !fadeOutTimerRef.current && !fadeAnimationRef.current) {
            console.log('[PreviewMode] Starting fade-out (desktop)');
            const fadeOutDuration = 8000; // 8 seconds for smoother fade
            const startTime = performance.now();
            const startValue = audioRef.current.volume;
            
            const fadeOut = (currentTime) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / fadeOutDuration, 1);
              // Exponential curve: (1-progress)^2 for more natural fade
              const exponentialProgress = (1 - progress) * (1 - progress);
              const value = startValue * exponentialProgress;
              audioRef.current.volume = Math.max(0, value);
              
              if (progress < 1 && audioRef.current.currentTime < audioRef.current.duration) {
                fadeAnimationRef.current = requestAnimationFrame(fadeOut);
              } else {
                fadeAnimationRef.current = null;
                fadeOutTimerRef.current = null;
                console.log('[PreviewMode] Fade-out complete');
              }
            };
            
            fadeOutTimerRef.current = true;
            fadeAnimationRef.current = requestAnimationFrame(fadeOut);
          }
        }
      });
      
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current.duration);
        
        // iOS: Schedule fade-out based on duration (audio-thread scheduling)
        if (isIOSRef.current && gainNodeRef.current && audioContextRef.current) {
          const ctx = audioContextRef.current;
          const gain = gainNodeRef.current;
          const fadeOutDuration = 8; // 8 seconds for smoother, more gradual fade
          const fadeOutStart = Math.max(0, audioRef.current.duration - fadeOutDuration);
          const when = ctx.currentTime + Math.max(0, fadeOutStart - audioRef.current.currentTime);
          
          console.log('[PreviewMode] iOS - Scheduling fade-out at', when, 'for duration', audioRef.current.duration);
          gain.gain.cancelScheduledValues(when);
          gain.gain.setValueAtTime(gain.gain.value, when);
          // Use exponential ramp for more natural volume perception
          gain.gain.exponentialRampToValueAtTime(0.0001, when + fadeOutDuration);
        }
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
        gainNodeRef.current.gain.setValueAtTime(1, audioContextRef.current.currentTime);
        gainNodeRef.current.connect(audioContextRef.current.destination);
        
        // CRITICAL: Only create MediaElementSource ONCE per audio element
        if (!sourceCreatedRef.current) {
          console.log('[PreviewMode] Creating MediaElementSource (once only)');
          sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
          sourceNodeRef.current.connect(gainNodeRef.current);
          sourceCreatedRef.current = true;
        }
      }
      
      // Load new audio
      audioRef.current.crossOrigin = 'anonymous'; // For Spotify CDN CORS
      audioRef.current.src = previewUrl;
      audioRef.current.load();
      
      // CRITICAL: Resume context MUST happen in user gesture, right before play
      if (isIOSRef.current && audioContextRef.current) {
        console.log('[PreviewMode] Resuming AudioContext before play');
        await audioContextRef.current.resume();
      }
      
      // iOS: Use epsilon (0.0001) and schedule fade on audio thread
      // Desktop: Start at 0 and fade with RAF
      if (isIOSRef.current && gainNodeRef.current && audioContextRef.current) {
        const ctx = audioContextRef.current;
        const gain = gainNodeRef.current;
        const now = ctx.currentTime;
        
        // Cancel any previous scheduled values
        gain.gain.cancelScheduledValues(0);
        
        // CRITICAL: Start from epsilon (0.0001), not 0 - prevents iOS "stuck at zero" bug
        gain.gain.setValueAtTime(0.0001, now);
        // Use exponential ramp for more natural, smooth fade-in (1.5s for gentler start)
        gain.gain.exponentialRampToValueAtTime(1, now + 1.5);
        
        console.log('[PreviewMode] iOS - Scheduled exponential fade-in from 0.0001 to 1 over 1.5s');
      } else {
        audioRef.current.volume = 0;
      }
      
      // Play
      await audioRef.current.play();
      setCurrentPreviewUrl(previewUrl);
      setIsPlaying(true);
      isUnlockedRef.current = true;
      
      // Desktop: fade with RAF using exponential curve for natural volume perception
      if (!isIOSRef.current) {
        const startTime = performance.now();
        const fadeInDuration = 1500; // 1.5 seconds for gentler fade-in
        
        const fadeIn = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / fadeInDuration, 1);
          // Exponential curve: progress^2 for more gradual start
          const exponentialProgress = progress * progress;
          audioRef.current.volume = exponentialProgress;
          
          if (progress < 1) {
            fadeAnimationRef.current = requestAnimationFrame(fadeIn);
          } else {
            fadeAnimationRef.current = null;
            console.log('[PreviewMode] Desktop fade-in complete');
          }
        };
        
        fadeAnimationRef.current = requestAnimationFrame(fadeIn);
        console.log('[PreviewMode] Desktop - fade-in started');
      }
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
