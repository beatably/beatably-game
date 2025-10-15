// Debug logger that sends console logs to backend for analysis
// Only active when localStorage.getItem('debug_logging') === 'true'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const LOG_ENDPOINT = `${BACKEND_URL}/api/debug/frontend-logs`;

class DebugLogger {
  constructor() {
    this.isEnabled = false;
    this.playerInfo = {};
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };
  }

  enable(playerInfo = {}) {
    if (this.isEnabled) return;
    
    this.isEnabled = true;
    this.playerInfo = playerInfo;
    
    console.log('[DebugLogger] Enabled with player info:', playerInfo);
    
    // Intercept console methods
    console.log = (...args) => {
      this.originalConsole.log(...args);
      this.sendLog('log', args);
    };
    
    console.warn = (...args) => {
      this.originalConsole.warn(...args);
      this.sendLog('warn', args);
    };
    
    console.error = (...args) => {
      this.originalConsole.error(...args);
      this.sendLog('error', args);
    };
  }

  disable() {
    if (!this.isEnabled) return;
    
    this.isEnabled = false;
    
    // Restore original console methods
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    
    this.originalConsole.log('[DebugLogger] Disabled');
  }

  updatePlayerInfo(playerInfo) {
    this.playerInfo = { ...this.playerInfo, ...playerInfo };
  }

  sendLog(level, args) {
    if (!this.isEnabled) return;
    
    try {
      // Format message from arguments
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }).join(' ');
      
      // Extract data objects from arguments
      const data = args.filter(arg => 
        arg && typeof arg === 'object' && !(arg instanceof Error)
      );
      
      const logEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        playerInfo: this.playerInfo,
        data: data.length > 0 ? data : null
      };
      
      // Send to backend (non-blocking)
      fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logEntry)
      }).catch(err => {
        // Silently fail - don't spam console with log delivery errors
      });
    } catch (error) {
      // Silently fail
    }
  }
}

// Singleton instance
const debugLogger = new DebugLogger();

// Auto-enable if localStorage flag is set
if (typeof window !== 'undefined' && localStorage.getItem('debug_logging') === 'true') {
  debugLogger.enable();
}

export default debugLogger;
