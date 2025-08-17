/**
 * Local network discovery helper
 * - Uses bonjour (mDNS) and node-ssdp (SSDP) to discover devices on the LAN
 * - Provides a single exported function `discoverLocalDevices(timeoutMs)` which
 *   returns an array of normalized device objects.
 *
 * Notes:
 * - mDNS/SSDP discovery must run on a machine on the same LAN as devices.
 * - Running this inside the existing backend will work when that backend runs
 *   on the same network as the devices (recommended).
 */

const Bonjour = require('bonjour');
const { Client: SsdpClient } = require('node-ssdp');

const DEFAULT_TIMEOUT = 3000; // ms

function nowIso() {
  return new Date().toISOString();
}

/**
 * Normalize a discovered item into common shape:
 * { id, name, type, source, ip, raw, lastSeen }
 */
function normalizeDevice({ id, name, type, source, ip, raw }) {
  return {
    id: id || `${source || 'local'}-${(name || 'device').replace(/\s+/g, '-').toLowerCase()}-${Math.random().toString(36).slice(2,8)}`,
    name: name || 'Unknown Device',
    type: type || 'Unknown',
    source: source || 'local',
    ip: ip || null,
    raw: raw || null,
    lastSeen: nowIso()
  };
}

/**
 * Discover devices via mDNS (bonjour). Returns array of normalized devices.
 */
async function discoverMdns(timeoutMs = DEFAULT_TIMEOUT) {
  const bonjour = new Bonjour();
  const services = [];
  return new Promise((resolve) => {
    // Browse for common service types that could indicate media devices
    const serviceTypes = [
      // Chromecast/Google Cast uses _googlecast._tcp
      '_googlecast._tcp',
      // Sonos uses _sonos._tcp and _http._tcp may show speakers/TVs
      '_sonos._tcp',
      '_spotify-connect._tcp',
      '_airplay._tcp',
      '_http._tcp',
      '_workstation._tcp'
    ];

    const browsers = serviceTypes.map(type => bonjour.find({ type }, (service) => {
      try {
        services.push(service);
      } catch (e) {
        // ignore
      }
    }));

    // Stop browsing after timeout
    setTimeout(() => {
      try {
        browsers.forEach(b => b.stop && b.stop());
        bonjour.destroy();
      } catch (_) {}
      const normalized = services.map(s => normalizeDevice({
        id: s?.fqdn || s?.name || `${s?.host || 'mdns'}`,
        name: s?.name || s?.fqdn || s?.host,
        type: s?.type || s?.subtypes?.join(',') || 'mDNS',
        source: 'mdns',
        ip: (s?.addresses && s.addresses.length) ? s.addresses[0] : (s?.host || null),
        raw: s
      }));
      resolve(normalized);
    }, timeoutMs);
  });
}

/**
 * Discover devices via SSDP. Returns array of normalized devices.
 */
async function discoverSsdp(timeoutMs = DEFAULT_TIMEOUT) {
  const client = new SsdpClient();
  const found = new Map();

  return new Promise((resolve) => {
    // Listen for responses
    client.on('response', (headers, statusCode, rinfo) => {
      try {
        const usn = headers.USN || headers.NT || headers.LOCATION || `${rinfo.address}:${rinfo.port}`;
        if (!found.has(usn)) {
          const name = headers.SERVER || headers.ST || headers.USN || 'ssdp-device';
          const device = normalizeDevice({
            id: usn,
            name: name,
            type: headers.ST || headers.NT || 'ssdp',
            source: 'ssdp',
            ip: rinfo.address,
            raw: { headers, rinfo }
          });
          found.set(usn, device);
        }
      } catch (e) {
        // ignore per-device errors
      }
    });

    // Search for common media/service types (Chromecast, DIAL, DLNA, Sonos)
    const searchTargets = [
      'ssdp:all',
      'urn:dial-multiscreen-org:service:dial:1',
      'urn:schemas-upnp-org:device:MediaRenderer:1',
      'urn:schemas-upnp-org:service:ContentDirectory:1',
      'urn:schemas-sony-com:service:ScalarWebAPI:1'
    ];

    // Issue searches
    try {
      searchTargets.forEach(st => {
        try {
          client.search(st);
        } catch (_) {}
      });
    } catch (_) {}

    // End search after timeout
    setTimeout(() => {
      try { client.stop(); } catch(_) {}
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}

/**
 * Master discovery function - runs both mDNS and SSDP in parallel and merges results.
 */
async function discoverLocalDevices(timeoutMs = DEFAULT_TIMEOUT) {
  try {
    const [mdnsResults, ssdpResults] = await Promise.all([
      discoverMdns(timeoutMs),
      discoverSsdp(timeoutMs)
    ]);

    // Merge deduped by id/ip/name heuristics
    const merged = [];
    const seen = new Set();

    const pushIfNew = (d) => {
      const key = d.id || `${d.source}-${d.ip || d.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(d);
    };

    (mdnsResults || []).forEach(pushIfNew);
    (ssdpResults || []).forEach(pushIfNew);

    // Add some simple normalization for Chromecast devices that expose googlecast name in mdns
    const final = merged.map(d => {
      const normalized = { ...d };
      if (!normalized.type && normalized.raw && normalized.raw.txt && normalized.raw.txt.fn) {
        normalized.type = normalized.raw.txt.fn.includes('Chromecast') ? 'Chromecast' : normalized.type;
      }
      return normalized;
    });

    return final;
  } catch (e) {
    console.warn('[discovery] Local discovery failed:', e && e.message);
    return [];
  }
}

module.exports = {
  discoverLocalDevices,
  discoverMdns,
  discoverSsdp
};
