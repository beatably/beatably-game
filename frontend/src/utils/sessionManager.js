// Session management utility for robust game state persistence
class SessionManager {
  constructor() {
    this.SESSION_KEY = 'beatably_session';
    this.BACKUP_KEY = 'beatably_game_backup';
    this.SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  }

  // Save current session data
  saveSession(sessionData) {
    try {
      const session = {
        ...sessionData,
        timestamp: Date.now(),
        version: '1.0'
      };
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      console.log('[SessionManager] Session saved:', session);
      return true;
    } catch (error) {
      console.error('[SessionManager] Error saving session:', error);
      return false;
    }
  }

  // Get current session data
  getSession() {
    try {
      const sessionStr = localStorage.getItem(this.SESSION_KEY);
      if (!sessionStr) return null;

      const session = JSON.parse(sessionStr);
      
      // Check if session is expired
      if (Date.now() - session.timestamp > this.SESSION_TIMEOUT) {
        console.log('[SessionManager] Session expired, clearing');
        this.clearSession();
        return null;
      }

      console.log('[SessionManager] Session retrieved:', session);
      return session;
    } catch (error) {
      console.error('[SessionManager] Error retrieving session:', error);
      this.clearSession(); // Clear corrupted session
      return null;
    }
  }

  // Update specific session fields
  updateSession(updates) {
    const currentSession = this.getSession();
    if (!currentSession) return false;

    return this.saveSession({
      ...currentSession,
      ...updates
    });
  }

  // Clear session data
  clearSession() {
    try {
      localStorage.removeItem(this.SESSION_KEY);
      localStorage.removeItem(this.BACKUP_KEY);
      console.log('[SessionManager] Session cleared');
      return true;
    } catch (error) {
      console.error('[SessionManager] Error clearing session:', error);
      return false;
    }
  }

  // Save comprehensive game state backup
  saveGameBackup(gameState) {
    try {
      const backup = {
        ...gameState,
        timestamp: Date.now(),
        version: '1.0'
      };
      localStorage.setItem(this.BACKUP_KEY, JSON.stringify(backup));
      console.log('[SessionManager] Game backup saved');
      return true;
    } catch (error) {
      console.error('[SessionManager] Error saving game backup:', error);
      return false;
    }
  }

  // Get game state backup
  getGameBackup() {
    try {
      const backupStr = localStorage.getItem(this.BACKUP_KEY);
      if (!backupStr) return null;

      const backup = JSON.parse(backupStr);
      
      // Check if backup is recent (within session timeout)
      if (Date.now() - backup.timestamp > this.SESSION_TIMEOUT) {
        console.log('[SessionManager] Game backup expired, clearing');
        localStorage.removeItem(this.BACKUP_KEY);
        return null;
      }

      console.log('[SessionManager] Game backup retrieved');
      return backup;
    } catch (error) {
      console.error('[SessionManager] Error retrieving game backup:', error);
      localStorage.removeItem(this.BACKUP_KEY);
      return null;
    }
  }

  // Check if there's a valid session to restore
  hasValidSession() {
    const session = this.getSession();
    return session && session.roomCode && session.playerName;
  }

  // Check if there's a valid game backup to restore
  hasValidGameBackup() {
    const backup = this.getGameBackup();
    return backup && backup.view === 'game' && backup.roomCode;
  }

  // Create session data from current app state
  createSessionData(appState) {
    return {
      // Core session info
      sessionId: appState.sessionId || this.generateSessionId(),
      roomCode: appState.roomCode,
      playerName: appState.playerName,
      playerId: appState.playerId,
      isCreator: appState.isCreator,
      
      // Game state
      view: appState.view,
      players: appState.players,
      gameSettings: appState.gameSettings,
      
      // Current game progress (if in game)
      ...(appState.view === 'game' && {
        currentPlayerId: appState.currentPlayerId,
        currentPlayerIdx: appState.currentPlayerIdx,
        phase: appState.phase,
        timeline: appState.timeline,
        deck: appState.deck,
        gameRound: appState.gameRound,
        feedback: appState.feedback,
        lastPlaced: appState.lastPlaced,
        challenge: appState.challenge
      })
    };
  }

  // Generate unique session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Check if current state matches saved session
  isSessionValid(currentState, savedSession) {
    if (!savedSession || !currentState) return false;
    
    return (
      savedSession.roomCode === currentState.roomCode &&
      savedSession.playerName === currentState.playerName &&
      savedSession.playerId === currentState.playerId
    );
  }

  // Get reconnection data for backend
  getReconnectionData() {
    const session = this.getSession();
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      playerName: session.playerName,
      playerId: session.playerId,
      isCreator: session.isCreator,
      lastKnownState: {
        view: session.view,
        phase: session.phase,
        currentPlayerIdx: session.currentPlayerIdx,
        gameRound: session.gameRound
      }
    };
  }

  // Handle page visibility change (save state when page becomes hidden)
  handleVisibilityChange(appState) {
    if (document.hidden) {
      // Page is being hidden, save current state
      if (appState.view === 'game' || appState.view === 'waiting') {
        this.saveGameBackup(this.createSessionData(appState));
      }
    }
  }

  // Handle before unload (save state before page closes)
  handleBeforeUnload(appState) {
    if (appState.view === 'game' || appState.view === 'waiting') {
      this.saveGameBackup(this.createSessionData(appState));
    }
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

export default sessionManager;
