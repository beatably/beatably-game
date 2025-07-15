import React, { useState, useEffect } from 'react';
import spotifyAuth from './utils/spotifyAuth';

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
        setError('Spotify authentication expired. Please re-authenticate.');
        setLoading(false);
        return;
      }

      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${spotifyAuth.getToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch devices');
      }

      const data = await response.json();
      setDevices(data.devices || []);
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
        setError('Spotify authentication expired. Please re-authenticate.');
        return;
      }

      const success = await spotifyAuth.transferPlayback(deviceId, true);
      
      if (success) {
        console.log('Playback transferred to', deviceId);
        // Store the device ID for persistence
        spotifyAuth.storeDeviceId(deviceId);
        onDeviceSwitch(deviceId);
        onClose();
      } else {
        throw new Error('Failed to transfer playback');
      }
    } catch (err) {
      console.error('Error transferring playback:', err);
      setError('Failed to transfer playback. Please try again.');
    }
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Switch Device</h2>
          
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
            <p className="text-gray-400 mt-2">Loading devices...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && devices.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">No devices found</p>
            <p className="text-gray-500 text-sm mt-2">Make sure Spotify is open on your devices</p>
          </div>
        )}

        {!loading && !error && devices.length > 0 && (
          <div className="space-y-2">
            {devices.map((device) => (
              <button
                key={device.id}
                onClick={() => transferPlayback(device.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  device.is_active
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{device.name}</div>
                    <div className="text-sm opacity-75">{device.type}</div>
                  </div>
                  {device.is_active && (
                    <div className="text-sm">✓ Active</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 pt-6">
          <button
            onClick={fetchDevices}
            className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
          >
            Refresh Devices
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 mt-3 bg-green-700 hover:bg-green-600 text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeviceSwitchModal;
