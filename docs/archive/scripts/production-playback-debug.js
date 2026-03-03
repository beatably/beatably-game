/**
 * Production Playback Debugger
 * Paste this into browser console on production to diagnose playback issues
 */

class ProductionPlaybackDebugger {
  constructor() {
    this.logs = [];
    this.startTime = Date.now();
  }

  log(message, data = null) {
    const timestamp = Date.now() - this.startTime;
    const logEntry = {
      timestamp: `+${timestamp}ms`,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null,
      time: new Date().toISOString()
    };
    
    console.log(`[${logEntry.timestamp}] ${message}`, data || '');
    this.logs.push(logEntry);
  }

  async getSpotifyState() {
    const token = localStorage.getItem('access_token');
    if (!token) {
      this.log('❌ No Spotify token found');
      return null;
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 404) {
        this.log('⚠️ No active Spotify session (404)');
        return { status: 'no_active_session' };
      }

      if (!response.ok) {
        this.log(`❌ Spotify API error: ${response.status}`, { status: response.status });
        return null;
      }

      const state = await response.json();
      this.log('✅ Current Spotify state:', {
        is_playing: state.is_playing,
        progress_ms: state.progress_ms,
        device: state.device ? {
          id: state.device.id,
          name: state.device.name,
          type: state.device.type,
          is_active: state.device.is_active,
          is_private_session: state.device.is_private_session,
          is_restricted: state.device.is_restricted,
          volume_percent: state.device.volume_percent
        } : null,
        item: state.item ? {
          uri: state.item.uri,
          name: state.item.name,
          artists: state.item.artists.map(a => a.name).join(', ')
        } : null,
        context: state.context ? {
          uri: state.context.uri,
          type: state.context.type
        } : null
      });

      return state;
    } catch (error) {
      this.log('❌ Error getting Spotify state:', { error: error.message });
      return null;
    }
  }

  async getDevices() {
    const token = localStorage.getItem('access_token');
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        this.log(`❌ Device discovery failed: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const devices = data.devices || [];
      
      this.log(`📱 Found ${devices.length} devices:`, devices.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        is_active: d.is_active,
        is_private_session: d.is_private_session,
        is_restricted: d.is_restricted,
        volume_percent: d.volume_percent
      })));

      return devices;
    } catch (error) {
      this.log('❌ Error getting devices:', { error: error.message });
      return [];
    }
  }

  async testPlaybackControl(testUri = 'spotify:track:6s8WSX1MxNThrot8ThI6fG') {
    this.log('🎵 Testing playback control with URI:', testUri);
    
    const token = localStorage.getItem('access_token');
    const devices = await this.getDevices();
    
    if (devices.length === 0) {
      this.log('❌ No devices available for testing');
      return false;
    }

    // Find active device or use first available
    const targetDevice = devices.find(d => d.is_active) || devices[0];
    this.log(`🎯 Using device: ${targetDevice.name} (${targetDevice.id})`);

    try {
      // Step 1: Pause current playback
      this.log('⏸️ Pausing current playback...');
      const pauseResponse = await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      this.log(`Pause response: ${pauseResponse.status}`, { 
        ok: pauseResponse.ok,
        status: pauseResponse.status 
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Start playback with specific URI
      this.log('▶️ Starting playback with test URI...');
      const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevice.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [testUri],
          position_ms: 0
        })
      });

      this.log(`Play response: ${playResponse.status}`, { 
        ok: playResponse.ok,
        status: playResponse.status 
      });

      if (!playResponse.ok) {
        const errorText = await playResponse.text();
        this.log('❌ Play request failed:', { 
          status: playResponse.status,
          error: errorText 
        });
        return false;
      }

      // Step 3: Verify playback after delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.log('🔍 Verifying playback state...');
      const finalState = await this.getSpotifyState();
      
      if (finalState && finalState.item) {
        const isCorrectTrack = finalState.item.uri === testUri;
        const isPlaying = finalState.is_playing;
        
        this.log(`✅ Verification complete:`, {
          correct_track: isCorrectTrack,
          is_playing: isPlaying,
          expected_uri: testUri,
          actual_uri: finalState.item.uri,
          progress_ms: finalState.progress_ms
        });

        return isCorrectTrack && isPlaying;
      } else {
        this.log('❌ No playback state after play command');
        return false;
      }

    } catch (error) {
      this.log('❌ Playback test error:', { error: error.message });
      return false;
    }
  }

  async diagnosePlaybackIssue() {
    this.log('🔧 Starting production playback diagnosis...');
    
    // Check 1: Token validation
    const token = localStorage.getItem('access_token');
    if (!token) {
      this.log('❌ CRITICAL: No Spotify access token found');
      return { issue: 'no_token', severity: 'critical' };
    }

    // Validate token
    try {
      const meResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!meResponse.ok) {
        this.log('❌ CRITICAL: Spotify token is invalid or expired', { status: meResponse.status });
        return { issue: 'invalid_token', severity: 'critical' };
      }
      
      const userInfo = await meResponse.json();
      this.log('✅ Token valid for user:', { 
        id: userInfo.id, 
        display_name: userInfo.display_name,
        country: userInfo.country,
        product: userInfo.product 
      });
    } catch (error) {
      this.log('❌ Error validating token:', { error: error.message });
      return { issue: 'token_validation_error', severity: 'critical' };
    }

    // Check 2: Device availability
    const devices = await this.getDevices();
    if (devices.length === 0) {
      this.log('❌ CRITICAL: No Spotify devices available');
      return { issue: 'no_devices', severity: 'critical' };
    }

    // Check 3: Current playback state
    const currentState = await this.getSpotifyState();
    if (!currentState) {
      this.log('⚠️ WARNING: Could not get current playback state');
    }

    // Check 4: Test actual playback control
    this.log('🧪 Testing playback control...');
    const playbackWorking = await this.testPlaybackControl();
    
    if (!playbackWorking) {
      this.log('❌ CRITICAL: Playback control is not working');
      return { issue: 'playback_control_failed', severity: 'critical' };
    }

    this.log('✅ All checks passed - playback should be working');
    return { issue: 'none', severity: 'info' };
  }

  async checkGameState() {
    this.log('🎮 Checking game state...');
    
    // Check if we're in a game
    if (typeof window.currentGameCard !== 'undefined') {
      this.log('🎵 Current game card:', window.currentGameCard);
    } else {
      this.log('⚠️ No current game card found');
    }

    // Check device aware playback
    if (typeof window.beatablyDeviceAware !== 'undefined') {
      this.log('✅ DeviceAware playback available');
    } else {
      this.log('❌ DeviceAware playback not available');
    }

    // Check stored device
    const storedDevice = localStorage.getItem('spotify_device_id');
    if (storedDevice) {
      this.log('📱 Stored device ID:', storedDevice);
    } else {
      this.log('⚠️ No stored device ID');
    }
  }

  exportLogs() {
    const exportData = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      logs: this.logs,
      localStorage: {
        access_token: localStorage.getItem('access_token') ? '***EXISTS***' : null,
        spotify_device_id: localStorage.getItem('spotify_device_id'),
        showSongsButton: localStorage.getItem('showSongsButton')
      }
    };

    console.log('📋 Debug logs exported to clipboard (if supported)');
    console.log('Full export data:', exportData);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    }

    return exportData;
  }

  async runFullDiagnosis() {
    this.log('🚀 Starting full production diagnosis...');
    
    await this.checkGameState();
    const diagnosis = await this.diagnosePlaybackIssue();
    
    this.log('📊 Diagnosis complete:', diagnosis);
    
    const exportData = this.exportLogs();
    window.lastDiagnosisResults = exportData;
    
    return diagnosis;
  }
}

// Auto-setup for browser console
if (typeof window !== 'undefined') {
  window.ProductionPlaybackDebugger = ProductionPlaybackDebugger;
  
  window.debugPlayback = async () => {
    const debug = new ProductionPlaybackDebugger();
    const result = await debug.runFullDiagnosis();
    console.log('🎯 Quick diagnosis result:', result);
    return result;
  };
  
  window.testPlayback = async (uri) => {
    const debug = new ProductionPlaybackDebugger();
    const result = await debug.testPlaybackControl(uri);
    console.log('🎵 Playback test result:', result);
    return result;
  };
  
  console.log('🔧 Production Playback Debugger loaded!');
  console.log('Run: debugPlayback() for full diagnosis');
  console.log('Run: testPlayback() to test playback control');
  console.log('Results saved to: window.lastDiagnosisResults');
}
