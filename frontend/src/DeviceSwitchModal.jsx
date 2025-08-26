import React, { useState, useEffect } from 'react';
import spotifyAuth from './utils/spotifyAuth';
import deviceDiscoveryService from './utils/deviceDiscovery';

function DeviceSwitchModal({ isOpen, onClose, onDeviceSwitch }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
          }
        }
      } catch (e) {
        console.warn('[DeviceSwitchModal] Spotify API devices fetch failed, continuing with other discovery methods', e);
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
      const tokenValidation = await spotifyAuth.ensureValidToken();
      if (!tokenValidation.valid) {
        // Auto-trigger Spotify re-authentication (no manual button)
        spotifyAuth.initiateReauth();
        return;
      }

      // Check if there's a current song that should continue playing after device switch
      const shouldContinuePlayback = window.__beatablyPendingAutoplay || 
        (window.currentGameCard && window.currentGameCard.uri);

      let success = false;
      try {
        if (spotifyAuth.verifiedTransferAndPlay && shouldContinuePlayback && window.currentGameCard?.uri) {
          // Use verified transfer and play with the current song
          console.log('[DeviceSwitchModal] Using verified transfer+play for current song:', window.currentGameCard.uri);
          success = await spotifyAuth.verifiedTransferAndPlay(
            deviceId, 
            window.currentGameCard.uri, 
            0,
            { attempts: 3, delayMs: 350, verifyDelayMs: 250 }
          );
        } else {
          // Standard transfer without forcing playback
          success = await spotifyAuth.transferPlayback(deviceId, false);
          
          // If we should continue playback and have a current song, start it
          if (success && shouldContinuePlayback && window.currentGameCard?.uri) {
            setTimeout(async () => {
              try {
                await spotifyAuth.verifiedStartPlayback(
                  deviceId,
                  window.currentGameCard.uri,
                  0,
                  { pauseFirst: true, transferFirst: false, maxVerifyAttempts: 4, verifyDelayMs: 250 }
                );
                console.log('[DeviceSwitchModal] Started playback on new device after transfer');
              } catch (e) {
                console.warn('[DeviceSwitchModal] Failed to start playback after transfer:', e);
              }
            }, 300);
          }
        }
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
            <p className="text-muted-foreground text-sm mt-2">Make sure Spotify is open on your devices</p>
          </div>
        )}

        {!loading && !error && devices.length > 0 && (
          <div className="space-y-2">
            {devices.map((device) => (
              <div key={device.id} className="p-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => transferPlayback(device.id)}
                    className={`flex-1 text-left rounded-md setting-button touch-button h-12 px-3 ${
                      device.is_active
                        ? 'bg-primary text-primary-foreground border border-primary/20'
                        : 'bg-input text-foreground border border-border hover:bg-input/90'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{device.name}</div>
                        <div className="text-sm text-muted-foreground">{device.type}</div>
                      </div>
                      {device.is_active && (
                        <div className="text-sm bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded border border-primary/20">
                          ✓ Active
                        </div>
                      )}
                    </div>
                  </button>

                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-6">
          <button
            onClick={fetchDevices}
            className="w-full h-12 flex items-center justify-center border border-border bg-transparent text-foreground rounded-md font-semibold touch-button"
          >
            Refresh Devices
          </button>
          <button
            onClick={onClose}
            className="w-full h-12 flex items-center justify-center mt-3 border border-border bg-transparent text-foreground rounded-md font-semibold touch-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeviceSwitchModal;
