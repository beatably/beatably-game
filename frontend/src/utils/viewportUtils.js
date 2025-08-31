/**
 * Viewport utilities for mobile Safari toolbar minimization
 * Handles dynamic viewport height and safe area management
 */

class ViewportManager {
  constructor() {
    this.isInitialized = false;
    this.lastHeight = 0;
    this.callbacks = new Set();
    
    // Bind methods
    this.handleResize = this.handleResize.bind(this);
    this.handleOrientationChange = this.handleOrientationChange.bind(this);
    this.updateViewportHeight = this.updateViewportHeight.bind(this);
  }

  init() {
    if (this.isInitialized) return;
    
    console.log('[Viewport] Initializing viewport manager');
    
    // Set initial viewport height
    this.updateViewportHeight();
    
    // Add event listeners
    window.addEventListener('resize', this.handleResize, { passive: true });
    window.addEventListener('orientationchange', this.handleOrientationChange, { passive: true });
    
    // Handle iOS Safari specific events
    if (this.isMobileSafari()) {
      // Trigger toolbar hide on initial load
      this.triggerToolbarHide();
      
      // Listen for scroll events to maintain toolbar state
      this.setupScrollHandler();
    }
    
    this.isInitialized = true;
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    this.callbacks.clear();
    this.isInitialized = false;
  }

  updateViewportHeight() {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    
    // Update CSS custom properties for dynamic viewport
    document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    document.documentElement.style.setProperty('--vw', `${vw * 0.01}px`);
    document.documentElement.style.setProperty('--viewport-height', `${vh}px`);
    document.documentElement.style.setProperty('--viewport-width', `${vw}px`);
    
    // Store for comparison
    if (Math.abs(vh - this.lastHeight) > 50) { // Significant change
      console.log('[Viewport] Height changed:', this.lastHeight, '->', vh);
      this.lastHeight = vh;
      
      // Notify callbacks
      this.callbacks.forEach(callback => {
        try {
          callback({ height: vh, width: vw });
        } catch (error) {
          console.warn('[Viewport] Callback error:', error);
        }
      });
    }
  }

  handleResize() {
    // Debounce resize events
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.updateViewportHeight();
    }, 100);
  }

  handleOrientationChange() {
    // Handle orientation change with delay for iOS
    setTimeout(() => {
      this.updateViewportHeight();
      if (this.isMobileSafari()) {
        this.triggerToolbarHide();
      }
    }, 500);
  }

  triggerToolbarHide() {
    // Programmatically scroll to encourage Safari to hide the toolbar
    if (window.scrollY === 0) {
      window.scrollTo(0, 1);
      // Scroll back to top after a brief moment
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
    }
  }

  setupScrollHandler() {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateViewportHeight();
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  isMobileSafari() {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const webkit = /WebKit/.test(ua);
    const chrome = /CriOS|Chrome/.test(ua);
    
    return iOS && webkit && !chrome;
  }

  isStandalone() {
    return window.navigator.standalone === true || 
           window.matchMedia('(display-mode: standalone)').matches;
  }

  onViewportChange(callback) {
    this.callbacks.add(callback);
    
    // Return cleanup function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  // Get safe area insets (for devices with notches)
  getSafeAreaInsets() {
    const computedStyle = getComputedStyle(document.documentElement);
    
    return {
      top: computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0px',
      right: computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0px',
      bottom: computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0px',
      left: computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0px'
    };
  }

  // Force full screen mode for PWA-like experience
  requestFullscreen() {
    if (this.isMobileSafari() && !this.isStandalone()) {
      // Show instructions for adding to home screen
      console.log('[Viewport] Consider adding to home screen for full-screen experience');
      return false;
    }
    return true;
  }
}

// Create singleton instance
const viewportManager = new ViewportManager();

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => viewportManager.init());
} else {
  viewportManager.init();
}

export default viewportManager;
