/**
 * Test script for production playback fixes
 * Run this in browser console to test the new production fix
 */

// Test the production playback fix
async function testProductionFix() {
  console.log('🧪 Testing Production Playback Fix...');
  
  // Check if fix is available
  if (typeof window.productionPlaybackFix === 'undefined') {
    console.error('❌ Production fix not available. Make sure the page is loaded.');
    return;
  }
  
  const fix = window.productionPlaybackFix;
  
  // Test 1: Check if fix is needed
  console.log('📋 Test 1: Checking if fix is needed...');
  try {
    const needsFix = await fix.shouldApplyFix();
    console.log('✅ shouldApplyFix result:', needsFix);
  } catch (error) {
    console.error('❌ shouldApplyFix failed:', error);
  }
  
  // Test 2: Get current Spotify state
  console.log('📋 Test 2: Getting current Spotify state...');
  try {
    const token = localStorage.getItem('access_token');
    if (!token) {
      console.warn('⚠️ No Spotify token found');
      return;
    }
    
    const response = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.status === 404) {
      console.log('ℹ️ No active Spotify session (404 - normal)');
    } else if (response.ok) {
      const state = await response.json();
      console.log('✅ Current Spotify state:', {
        is_playing: state.is_playing,
        progress_ms: state.progress_ms,
        device: state.device ? {
          id: state.device.id,
          name: state.device.name,
          is_active: state.device.is_active
        } : null,
        item: state.item ? {
          uri: state.item.uri,
          name: state.item.name
        } : null
      });
    } else {
      console.error('❌ Spotify API error:', response.status);
    }
  } catch (error) {
    console.error('❌ Error getting Spotify state:', error);
  }
  
  // Test 3: Get available devices
  console.log('📋 Test 3: Getting available devices...');
  try {
    const devices = await window.spotifyAuth.getDevices();
    console.log('✅ Available devices:', devices.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      is_active: d.is_active
    })));
  } catch (error) {
    console.error('❌ Error getting devices:', error);
  }
  
  console.log('🎯 Production fix test complete!');
}

// Test the nuclear reset function (use with caution)
async function testNuclearReset() {
  console.log('💥 Testing Nuclear Reset (use with caution)...');
  
  const deviceId = localStorage.getItem('spotify_device_id');
  const testUri = 'spotify:track:6s8WSX1MxNThrot8ThI6fG'; // Test track
  
  if (!deviceId) {
    console.error('❌ No device ID found in localStorage');
    return;
  }
  
  if (typeof window.productionPlaybackFix === 'undefined') {
    console.error('❌ Production fix not available');
    return;
  }
  
  const fix = window.productionPlaybackFix;
  
  try {
    console.log('🚀 Starting nuclear reset...');
    const success = await fix.forcePlaybackReset(deviceId, testUri);
    
    if (success) {
      console.log('✅ Nuclear reset successful!');
    } else {
      console.error('❌ Nuclear reset failed');
    }
  } catch (error) {
    console.error('❌ Nuclear reset error:', error);
  }
}

// Simulate the production issue
async function simulateProductionIssue() {
  console.log('🎭 Simulating production playback issue...');
  
  try {
    const token = localStorage.getItem('access_token');
    if (!token) {
      console.error('❌ No Spotify token found');
      return;
    }
    
    // Try to get current state
    const response = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const state = await response.json();
      console.log('📊 Current state before simulation:', {
        is_playing: state.is_playing,
        progress_ms: state.progress_ms,
        device_name: state.device?.name
      });
      
      // This simulates the issue where play commands don't work
      console.log('🎯 Issue: Play button pressed but nothing happens');
      console.log('🎯 Expected: Progress shows stale time from previous session');
      console.log('🎯 Expected: Play icon doesn\'t change to pause');
      
    } else {
      console.log('ℹ️ No active session to simulate issue with');
    }
  } catch (error) {
    console.error('❌ Error simulating issue:', error);
  }
}

// Export functions to global scope
window.testProductionFix = testProductionFix;
window.testNuclearReset = testNuclearReset;
window.simulateProductionIssue = simulateProductionIssue;

console.log('🔧 Production Fix Test Suite Loaded!');
console.log('Available commands:');
console.log('- testProductionFix() - Test the production fix detection');
console.log('- testNuclearReset() - Test the nuclear reset (use with caution)');
console.log('- simulateProductionIssue() - Simulate the production issue');
