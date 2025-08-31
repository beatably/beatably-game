import { API_BASE_URL } from '../config';
/**
 * Enhanced device discovery service for Spotify devices
 * Includes Chromecast, UPnP/DLNA, and local network discovery
 *
 * NOTE: Browser environments restrict direct mDNS/SSDP usage.
 * This module provides a unified interface and placeholders for
 * real local-network discovery logic (server-assisted or SDK-based).
 */

class DeviceDiscoveryService {
  constructor() {
    this.discoveredDevices = new Map();
    this.isScanning = false;
  }

  /**
   * Discover all available devices including Chromecast and Spotify clients
   */
  async discoverDevices() {
    console.log('[DeviceDiscovery] Starting comprehensive device discovery...');
    
    this.isScanning = true;

    try {
      const spotifyDevices = await this.getSpotifyDevices();
      const additionalDevices = await this.discoverAdditionalDevices();
      
      const allDevices = [...spotifyDevices, ...additionalDevices];
      const uniqueDevices = this.deduplicateDevices(allDevices);
      
      console.log('[DeviceDiscovery] Found total devices:', uniqueDevices.length);
      return uniqueDevices;

    } catch (error) {
      console.error('[DeviceDiscovery] Error during device discovery:', error);
      // Fallback to Spotify-only devices
      return await this.getSpotifyDevices();
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get devices from Spotify Web API
   */
  async getSpotifyDevices() {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        console.log('[DeviceDiscovery] No access token available');
        return [];
      }

      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[DeviceDiscovery] Token expired, clearing token');
          localStorage.removeItem('access_token');
        } else if (response.status === 404) {
          console.log('[DeviceDiscovery] No active Spotify session (404 is normal)');
        } else {
          console.warn('[DeviceDiscovery] Spotify API returned:', response.status, response.statusText);
        }
        return [];
      }

      const data = await response.json();
      const devices = (data.devices || []).map(device => ({
        ...device,
        source: 'spotify_api',
        discoveryMethod: 'spotify_web_api',
        lastSeen: new Date().toISOString()
      }));

      console.log('[DeviceDiscovery] Found Spotify devices:', devices.length);
      return devices;
    } catch (error) {
      console.error('[DeviceDiscovery] Error fetching Spotify devices:', error);
      return [];
    }
  }

  /**
   * Discover additional devices through various methods
   * NOTE: In-browser discovery for mDNS/SSDP is limited. For reliable discovery
   * of Chromecast/UPnP/other devices you should run discovery on a backend service
   * and expose results via an API.
   *
   * Removed mock placeholder devices — this function now returns only real
   * backend-discovered devices (or empty array if backend discovery fails).
   */
  async discoverAdditionalDevices() {
    try {
      if (typeof API_BASE_URL === 'undefined' || !API_BASE_URL) {
        console.warn('[DeviceDiscovery] API_BASE_URL not configured; no backend discovery available');
        return [];
      }

      const resp = await fetch(`${API_BASE_URL}/api/local-devices?timeout=3000`);
      if (!resp.ok) {
        console.warn('[DeviceDiscovery] Backend local-devices responded with', resp.status);
        return [];
      }
      const json = await resp.json();
      if (!json || !Array.isArray(json.devices)) {
        console.warn('[DeviceDiscovery] Backend local-devices returned unexpected payload');
        return [];
      }

      // Normalize backend devices into frontend-friendly shape
      const remote = json.devices.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type || d.device_type || 'Unknown',
        is_active: !!d.is_active,
        source: d.source || 'local',
        discoveryMethod: d.discoveryMethod || 'backend_mdns_ssdp',
        ip: d.ip || d.ip_address || null,
        capabilities: d.capabilities || [],
        lastSeen: d.lastSeen || new Date().toISOString(),
        raw: d.raw || d
      }));

      return remote;
    } catch (error) {
      console.warn('[DeviceDiscovery] Backend discovery request failed:', error?.message || error);
      return [];
    }
  }

  /**
   * Deduplicate devices by ID, keeping the most recent entry
   */
  deduplicateDevices(devices) {
    const deviceMap = new Map();
    
    devices.forEach(device => {
      if (!device || !device.id) return;
      const existing = deviceMap.get(device.id);
      if (!existing) {
        deviceMap.set(device.id, device);
        return;
      }
      // Keep the one with the most recent lastSeen
      try {
        const existingTime = new Date(existing.lastSeen).getTime();
        const newTime = new Date(device.lastSeen).getTime();
        if (Number.isFinite(newTime) && newTime > existingTime) {
          deviceMap.set(device.id, device);
        }
      } catch {
        // If any parsing fails, prefer the new device
        deviceMap.set(device.id, device);
      }
    });
    
    return Array.from(deviceMap.values());
  }

  /**
   * Small helper to get a simple icon key for device types.
   * UI can map the returned key to an actual SVG/icon.
   */
  getDeviceIcon(deviceType = '') {
    const type = (deviceType || '').toLowerCase();
    const map = {
      'chromecast': 'cast',
      'chromecast audio': 'cast',
      'sonos': 'speaker',
      'amazon echo': 'voice',
      'smart tv': 'tv',
      'speaker': 'speaker',
      'computer': 'computer',
      'unknown': 'device'
    };
    return map[type] || 'device';
  }

  /**
   * Find device by id in last discovered set
   */
  async findDeviceById(id) {
    if (!id) return null;
    // Attempt to refresh discovery first (fast)
    const devices = await this.discoverDevices();
    return devices.find(d => d.id === id) || null;
  }

  /**
   * Start continuous scanning.
   * Attempts to use backend SSE stream if available; falls back to polling discoverDevices().
   */
  async startScan(pollMs = 10000) {
    if (this.isScanning) return;
    this.isScanning = true;

    // Try SSE subscription to backend stream first
    try {
      if (typeof EventSource !== 'undefined' && API_BASE_URL) {
        const esUrl = `${API_BASE_URL.replace(/\/$/, '')}/api/local-devices/stream`;
        this._sse = new EventSource(esUrl);
        this._sse.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data && Array.isArray(data.devices)) {
              // Normalize and cache devices
              const normalized = data.devices.map(d => ({
                id: d.id,
                name: d.name,
                type: d.type || d.device_type || 'Unknown',
                is_active: !!d.is_active,
                source: d.source || 'local',
                discoveryMethod: d.discoveryMethod || 'backend_mdns_ssdp',
                ip: d.ip || d.ip_address || null,
                capabilities: d.capabilities || [],
                lastSeen: d.lastSeen || new Date().toISOString(),
                raw: d.raw || d
              }));
              // Merge with Spotify devices on next discoverDevices call if needed
              this.discoveredDevicesFromSse = normalized;
              // Update global discovered map for quick access
              normalized.forEach(d => this.discoveredDevices.set(d.id, d));
            }
          } catch (e) {
            console.warn('[DeviceDiscovery] SSE parse error:', e);
          }
        };
        this._sse.onerror = (err) => {
          console.warn('[DeviceDiscovery] SSE error, falling back to polling:', err);
          try { this._sse.close(); } catch (_) {}
          this._sse = null;
          // start polling
          this.scanInterval = setInterval(() => { this.discoverDevices().catch(()=>{}); }, pollMs);
        };

        // If SSE is set, we also kick off an immediate on-demand discover to include Spotify API devices
        await this.discoverDevices();
        return;
      }
    } catch (e) {
      console.warn('[DeviceDiscovery] SSE subscription failed, falling back to polling:', e);
    }

    // Fallback: polling discovery
    this.scanInterval = setInterval(() => {
      this.discoverDevices().catch(() => {});
    }, pollMs);
    await this.discoverDevices();
  }

  stopScan() {
    this.isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this._sse) {
      try { this._sse.close(); } catch (_) {}
      this._sse = null;
    }
  }
}

const deviceDiscoveryService = new DeviceDiscoveryService();
export default deviceDiscoveryService;
