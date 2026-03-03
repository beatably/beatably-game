/**
 * Test script to validate playback fixes for production issues
 * Run this in the browser console while in a game to test various scenarios
 */

// Test configuration
const TEST_CONFIG = {
  // Test URIs (replace with actual URIs from your curated database)
  testUris: [
    'spotify:track:6s8WSX1MxNThrot8ThI6fG', // Travis Scott - 4X4
    'spotify:track:6ZGkfAtpzimwD4597JhIsl'  // Shaboozey - A Bar Song
  ],
  delayBetweenTests: 3000, // 3 seconds between tests
  maxRetries: 3
};

class PlaybackTester {
  constructor() {
    this.results = [];
    this.currentTest = 0;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
    this.results.push({ timestamp, type, message });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Test 1: URI Validation
  async testUriValidation() {
    this.log('=== Testing URI Validation ===');
    
    const validUris = [
      'spotify:track:6s8WSX1MxNThrot8ThI6fG',
      'spotify:track:1234567890abcdef1234'
    ];
    
    const invalidUris = [
      'invalid:track:123',
      'spotify:album:123',
      '',
      null,
      undefined
    ];

    // Test valid URIs
    for (const uri of validUris) {
      const isValid = uri && uri.startsWith('spotify:track:');
      this.log(`Valid URI test: ${uri} -> ${isValid ? 'PASS' : 'FAIL'}`, isValid ? 'success' : 'error');
    }

    // Test invalid URIs
    for (const uri of invalidUris) {
      const isValid = uri && uri.startsWith('spotify:track:');
      this.log(`Invalid URI test: ${uri} -> ${!isValid ? 'PASS' : 'FAIL'}`, !isValid ? 'success' : 'error');
    }
  }

  // Test 2: Device Aware Playback Initialization
  async testDeviceAwarePlayback() {
    this.log('=== Testing DeviceAwarePlayback Initialization ===');
    
    if (typeof window.beatablyDeviceAware === 'undefined') {
      this.log('DeviceAwarePlayback not exposed globally', 'error');
      return false;
    }

    try {
      // Test initialization timeout
      const deviceAware = (await import('./frontend/src/utils/deviceAwarePlayback.js')).default;
      const initResult = await deviceAware.waitForInitialization(1000);
      this.log(`DeviceAware initialization: ${initResult ? 'PASS' : 'TIMEOUT'}`, initResult ? 'success' : 'warn');
      return initResult;
    } catch (error) {
      this.log(`DeviceAware initialization error: ${error.message}`, 'error');
      return false;
    }
  }

  // Test 3: Spotify Auth Token Validation
  async testSpotifyAuth() {
    this.log('=== Testing Spotify Authentication ===');
    
    const token = localStorage.getItem('access_token');
    if (!token) {
      this.log('No Spotify token found', 'error');
      return false;
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const isValid = response.ok;
      this.log(`Token validation: ${isValid ? 'PASS' : 'FAIL'}`, isValid ? 'success' : 'error');
      
      if (!isValid) {
        this.log(`Token validation failed with status: ${response.status}`, 'error');
      }
      
      return isValid;
    } catch (error) {
      this.log(`Token validation error: ${error.message}`, 'error');
      return false;
    }
  }

  // Test 4: Device Discovery
  async testDeviceDiscovery() {
    this.log('=== Testing Device Discovery ===');
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        this.log(`Device discovery failed: ${response.status}`, 'error');
        return [];
      }
      
      const data = await response.json();
      const devices = data.devices || [];
      
      this.log(`Found ${devices.length} devices:`, 'info');
      devices.forEach(device => {
        this.log(`  - ${device.name} (${device.type}) - Active: ${device.is_active}`, 'info');
      });
      
      return devices;
    } catch (error) {
      this.log(`Device discovery error: ${error.message}`, 'error');
      return [];
    }
  }

  // Test 5: Playback Start/Stop Cycle
  async testPlaybackCycle() {
    this.log('=== Testing Playback Start/Stop Cycle ===');
    
    const devices = await this.testDeviceDiscovery();
    if (devices.length === 0) {
      this.log('No devices available for playback test', 'error');
      return false;
    }

    const targetDevice = devices.find(d => d.is_active) || devices[0];
    const testUri = TEST_CONFIG.testUris[0];
    
    if (!testUri) {
      this.log('No test URI available', 'error');
      return false;
    }

    try {
      // Test pause
      this.log(`Pausing playback on device: ${targetDevice.name}`);
      const pauseResponse = await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      });
      
      if (pauseResponse.ok || pauseResponse.status === 404) {
        this.log('Pause command sent successfully', 'success');
      } else {
        this.log(`Pause failed: ${pauseResponse.status}`, 'warn');
      }

      await this.delay(1000);

      // Test play
      this.log(`Starting playback: ${testUri} on device: ${targetDevice.name}`);
      const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevice.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [testUri],
          position_ms: 0
        })
      });

      if (playResponse.ok) {
        this.log('Play command sent successfully', 'success');
        
        // Verify playback after delay
        await this.delay(2000);
        const stateResponse = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        
        if (stateResponse.ok) {
          const state = await stateResponse.json();
          const isPlaying = state && !state.paused && state.item?.uri === testUri;
          this.log(`Playback verification: ${isPlaying ? 'PASS' : 'FAIL'}`, isPlaying ? 'success' : 'warn');
          
          if (state?.item) {
            this.log(`Currently playing: ${state.item.name} by ${state.item.artists[0]?.name}`, 'info');
          }
        }
        
        return true;
      } else {
        this.log(`Play failed: ${playResponse.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Playback cycle error: ${error.message}`, 'error');
      return false;
    }
  }

  // Test 6: Position Reset Behavior
  async testPositionReset() {
    this.log('=== Testing Position Reset Behavior ===');
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Get current state
      const stateResponse = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!stateResponse.ok) {
        this.log('Cannot get playback state for position test', 'warn');
        return false;
      }
      
      const state = await stateResponse.json();
      if (!state || !state.item) {
        this.log('No active playback for position test', 'warn');
        return false;
      }
      
      const originalPosition = state.progress_ms;
      this.log(`Original position: ${originalPosition}ms`, 'info');
      
      // Test seek to 0
      const seekResponse = await fetch('https://api.spotify.com/v1/me/player/seek?position_ms=0', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (seekResponse.ok) {
        this.log('Seek to position 0 successful', 'success');
        
        // Verify position after delay
        await this.delay(1000);
        const newStateResponse = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (newStateResponse.ok) {
          const newState = await newStateResponse.json();
          const newPosition = newState?.progress_ms || 0;
          this.log(`New position: ${newPosition}ms`, 'info');
          
          const resetWorked = newPosition < 5000; // Within 5 seconds of start
          this.log(`Position reset verification: ${resetWorked ? 'PASS' : 'FAIL'}`, resetWorked ? 'success' : 'warn');
        }
        
        return true;
      } else {
        this.log(`Seek failed: ${seekResponse.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Position reset test error: ${error.message}`, 'error');
      return false;
    }
  }

  // Run all tests
  async runAllTests() {
    this.log('🎵 Starting Beatably Playback Tests 🎵');
    this.log(`Test configuration: ${JSON.stringify(TEST_CONFIG)}`);
    
    const tests = [
      { name: 'URI Validation', fn: () => this.testUriValidation() },
      { name: 'Device Aware Playback', fn: () => this.testDeviceAwarePlayback() },
      { name: 'Spotify Authentication', fn: () => this.testSpotifyAuth() },
      { name: 'Device Discovery', fn: () => this.testDeviceDiscovery() },
      { name: 'Playback Cycle', fn: () => this.testPlaybackCycle() },
      { name: 'Position Reset', fn: () => this.testPositionReset() }
    ];
    
    const results = {};
    
    for (const test of tests) {
      try {
        this.log(`\n--- Running ${test.name} ---`);
        const result = await test.fn();
        results[test.name] = result;
        this.log(`${test.name}: ${result ? 'PASSED' : 'FAILED'}`, result ? 'success' : 'error');
      } catch (error) {
        this.log(`${test.name} threw error: ${error.message}`, 'error');
        results[test.name] = false;
      }
      
      if (test !== tests[tests.length - 1]) {
        await this.delay(TEST_CONFIG.delayBetweenTests);
      }
    }
    
    // Summary
    this.log('\n=== TEST SUMMARY ===');
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    Object.entries(results).forEach(([name, result]) => {
      this.log(`${name}: ${result ? '✅ PASS' : '❌ FAIL'}`);
    });
    
    this.log(`\nOverall: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
    
    if (passed === total) {
      this.log('🎉 All tests passed! Playback should work correctly.', 'success');
    } else {
      this.log('⚠️  Some tests failed. Check the logs above for details.', 'warn');
    }
    
    return results;
  }

  // Export results for analysis
  exportResults() {
    const exportData = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      testConfig: TEST_CONFIG,
      results: this.results
    };
    
    console.log('Test results exported to clipboard (if supported)');
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    }
    
    return exportData;
  }
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  window.PlaybackTester = PlaybackTester;
  
  // Provide easy access
  window.runPlaybackTests = async () => {
    const tester = new PlaybackTester();
    const results = await tester.runAllTests();
    window.lastTestResults = tester.exportResults();
    return results;
  };
  
  console.log('🎵 Beatably Playback Tester loaded!');
  console.log('Run: runPlaybackTests() to start testing');
  console.log('Export results: window.lastTestResults after running tests');
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlaybackTester;
}
