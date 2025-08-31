import React, { useState, useEffect } from 'react';
import spotifyAuth from './utils/spotifyAuth';
import deviceDiscoveryService from './utils/deviceDiscovery';

function DeviceSwitchModal({ isOpen, onClose, onDeviceSwitch, currentDeviceId }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  useEffect(() => {
    // When modal opens and devices are loaded, default to the active device or first device
    if (isOpen && devices && devices.length > 0) {
      const active = devices.find(d => d.is_active);
      setSelectedDeviceId(active ? active.id : devices[0].id);
    }
  }, [isOpen, devices]);

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
    }
  }, [isOpen]);

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);

    try {
      const tokenValidation = await spotifyAuth.ensureValidToken();
      if (!tokenValidation.valid) {
        // Auto-trigger Spotify re-authentication (no manual button)
        spotifyAuth.initiateReauth();
        setLoading(false);
        return;
      }

      // 1) Fetch devices via Spotify Web API (may be limited)
      let spotifyApiDevices = [];
      try {
        if (spotifyAuth.getDevices) {
          spotifyApiDevices = await spotifyAuth.getDevices();
        } else {
          const resp = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: { 'Authorization': `Bearer ${spotifyAuth.getToken()}` }
          });
          if (resp.ok) {
            const data = await resp.json();
            spotifyApiDevices = data.devices || [];
          } else {
            console.warn('[DeviceSwitchModal] Spotify API devices returned:', resp.status, resp.statusText);
          }
        }
        console.log('[DeviceSwitchModal] Found Spotify API devices:', spotifyApiDevices.length, spotifyApiDevices);
      } catch (e) {
        console.warn('[DeviceSwitchModal] Spotify API devices fetch failed, continuing with other discovery methods', e);
      }

      // 2) Always include the current web player device if available
      const currentWebDeviceId = currentDeviceId || localStorage.getItem('spotify_device_id');
      if (currentWebDeviceId) {
        const existingWebDevice = spotifyApiDevices.find(d => d.id === currentWebDeviceId);
        if (!existingWebDevice) {
          console.log('[DeviceSwitchModal] Adding current web player device:', currentWebDeviceId);
          spotifyApiDevices.push({
            id: currentWebDeviceId,
            name: 'Beatably Game Player (Web)',
            type: 'Computer',
            is_active: true, // Assume active since we're using it
            volume_percent: 50,
            source: 'current_web_player'
          });
        }
      }

      // 2) Run local/network discovery (placeholder OR backend-assisted)
      let discovered = [];
      try {
        discovered = await deviceDiscoveryService.discoverDevices();
      } catch (e) {
        console.warn('[DeviceSwitchModal] Local/network discovery failed (continuing):', e);
      }

      // 3) Merge and normalize devices
      const merged = [...(spotifyApiDevices || []), ...(discovered || [])];

      const normalized = merged.map(d => {
        // If this already resembles Spotify device object, preserve fields
        if (d.id && d.name && (d.type || d.device_type)) {
          return {
            id: d.id,
            name: d.name,
            type: d.type || d.device_type,
            is_active: !!d.is_active,
            raw: d,
            source: d.source || 'spotify_api'
          };
        }

        // For discovered/mock devices produce compatible shape
        return {
          id: d.id || `${d.source || 'unknown'}-${d.name || Math.random().toString(36).slice(2,8)}`,
          name: d.name || 'Unknown Device',
          type: d.type || 'Unknown',
          is_active: !!d.is_active,
          raw: d,
          source: d.source || 'discovered'
        };
      });

      // Deduplicate by id (keep first occurrence)
      const deduped = [];
      const seen = new Set();
      for (const dev of normalized) {
        if (!dev || !dev.id) continue;
        if (seen.has(dev.id)) continue;
        seen.add(dev.id);
        deduped.push(dev);
      }

      setDevices(deduped);
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError(err.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

    const transferPlayback = async (deviceId) => {
    try {
      // Check if PlayerSync v2 is available
      if (window.beatablyPlayerSync) {
        console.log('[DeviceSwitchModal] Using PlayerSync v2 for device transfer');
        
        // Check if there's a current song that should continue playing
        const shouldContinuePlayback = window.__beatablyPendingAutoplay || 
          (window.currentGameCard && window.currentGameCard.uri);
        
        await window.beatablyPlayerSync.transferTo(deviceId, shouldContinuePlayback);
        
        // Clear pending autoplay intent since PlayerSync handled it
        if (window.__beatablyPendingAutoplay) {
          window.__beatablyPendingAutoplay = false;
        }
        
        onDeviceSwitch(deviceId);
        onClose();
        return;
      }

      // Fallback to legacy transfer logic with enhanced pause-before-transfer
      console.log('[DeviceSwitchModal] Using legacy transfer logic with pause-before-transfer');
      
      const tokenValidation = await spotifyAuth.ensureValidToken();
      if (!tokenValidation.valid) {
        // Auto-trigger Spotify re-authentication (no manual button)
        spotifyAuth.initiateReauth();
        return;
      }

      // CRITICAL FIX: Always pause before transferring to prevent device switching issues
      let wasPlayingBeforeTransfer = false;
      try {
        // Check current playback state
        const currentState = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { 'Authorization': `Bearer ${spotifyAuth.getToken()}` }
        });
        
        if (currentState.ok) {
          const stateData = await currentState.json();
          wasPlayingBeforeTransfer = stateData?.is_playing || false;
          
          if (wasPlayingBeforeTransfer) {
            console.log('[DeviceSwitchModal] Music is playing, pausing before transfer...');
            await fetch('https://api.spotify.com/v1/me/player/pause', {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${spotifyAuth.getToken()}` }
            });
            
            // Wait for pause to take effect
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (pauseErr) {
        console.warn('[DeviceSwitchModal] Failed to pause before transfer:', pauseErr);
        // Continue with transfer anyway
      }

      let success = false;
      try {
        // SIMPLIFIED: Always use standard transfer without autoplay
        // Users can manually press play after switching devices
        console.log('[DeviceSwitchModal] Performing standard transfer to device:', deviceId);
        success = await spotifyAuth.transferPlayback(deviceId, false);
        
        // Don't attempt to resume playback - let users manually start playback
        console.log('[DeviceSwitchModal] Transfer completed, user can manually start playback');
        
      } catch (flowErr) {
        console.warn('[DeviceSwitchModal] transfer flow error, falling back to simple transfer:', flowErr);
        try {
          success = await spotifyAuth.transferPlayback(deviceId, false);
        } catch (e) {
          success = false;
        }
      }
      
      if (success) {
        console.log('[DeviceSwitchModal] Playback transferred to', deviceId);
        // Store the device ID for persistence
        spotifyAuth.storeDeviceId(deviceId);
        
        // Clear pending autoplay intent since we've handled it
        if (window.__beatablyPendingAutoplay) {
          window.__beatablyPendingAutoplay = false;
        }
        
        onDeviceSwitch(deviceId);
        onClose();
      } else {
        throw new Error('Failed to transfer playback');
      }
    } catch (err) {
      console.error('[DeviceSwitchModal] Error transferring playback:', err);
      setError('Failed to transfer playback. Please try again.');
    }
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card container-card border border-border p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-foreground">Switch Device</h2>
          
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-2">Loading devices...</p>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive rounded p-3 mb-4">
            <p className="text-destructive-foreground text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && devices.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No devices found</p>
            <div className="text-muted-foreground text-sm mt-2 space-y-1">
              <p>To make devices discoverable:</p>
              <p>• Open Spotify on your phone/computer</p>
              <p>• Start playing any song briefly</p>
              <p>• Then refresh this list</p>
            </div>
          </div>
        )}

        {!loading && !error && devices.length > 0 && (
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Available devices" className="space-y-2">
              {devices.map((device) => (
                <div key={device.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => setSelectedDeviceId(device.id)}
                    role="radio"
                    aria-checked={selectedDeviceId === device.id}
                    className="w-full flex items-center justify-between h-12 px-4 touch-button border-b border-border bg-transparent focus:outline-none"
                  >
                    <div className={`flex items-center gap-3 ${selectedDeviceId === device.id ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                      <span className="sr-only">{selectedDeviceId === device.id ? 'Selected' : 'Not selected'}</span>
                      <div className="font-medium">{device.name}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      {device.is_active && (
                        <div className="text-sm bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded border border-primary/20">
                          Active
                        </div>
                      )}
                      {selectedDeviceId === device.id ? (
                        <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <div className="w-5 h-5" aria-hidden />
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4">
          <div className="flex justify-center">
            <a
              href="#refresh"
              onClick={(e) => { e.preventDefault(); fetchDevices(); }}
              role="button"
              className="inline-link-button flex items-center text-foreground text-sm font-semibold pb-8 -m-2 hover:text-foreground/80 focus:outline-none"
            >
              <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-3-6.708"/>
                <path d="M21 3v6h-6"/>
              </svg>
              Refresh Devices
            </a>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="h-12 w-full border border-border bg-transparent text-foreground rounded-md font-semibold touch-button"
            >
              Cancel
            </button>
            <button
              onClick={() => transferPlayback(selectedDeviceId)}
              disabled={!selectedDeviceId}
              className={`h-12 w-full rounded-md font-semibold touch-button ${selectedDeviceId ? 'bg-primary text-primary-foreground' : 'bg-input text-muted-foreground cursor-not-allowed'}`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeviceSwitchModal;
