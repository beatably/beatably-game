/**
 * Cast Utilities - AirPlay (Safari/iOS) support
 * 
 * Provides detection and control for routing audio to AirPlay speakers
 * from the web app. Works on Safari (macOS and iOS) using WebKit APIs.
 * 
 * Note: The PreviewModeContext uses a <video> element (not <audio>) because
 * Safari only exposes webkitShowPlaybackTargetPicker on <video> elements.
 * AirPlay works transparently — once routed, all browser play/pause/seek
 * controls continue working normally, audio just comes from the AirPlay device.
 */

/**
 * Check if AirPlay is supported in the current browser.
 * AirPlay is available on Safari (macOS and iOS) via WebKit APIs.
 */
export function isAirPlaySupported() {
  // Safari exposes webkitShowPlaybackTargetPicker on HTMLVideoElement
  const video = document.createElement('video');
  return typeof video.webkitShowPlaybackTargetPicker === 'function';
}

/**
 * Show the native AirPlay device picker.
 * Must be called on a <video> element (not <audio>) — Safari restriction.
 * Must be called from a user gesture (click/tap handler).
 * 
 * @param {HTMLVideoElement} videoElement - The video element playing audio
 * @returns {boolean} true if picker was shown, false if not supported
 */
export function showAirPlayPicker(videoElement) {
  if (!videoElement || typeof videoElement.webkitShowPlaybackTargetPicker !== 'function') {
    console.warn('[CastUtils] AirPlay not supported or no video element provided');
    return false;
  }
  
  try {
    videoElement.webkitShowPlaybackTargetPicker();
    console.log('[CastUtils] AirPlay picker shown');
    return true;
  } catch (error) {
    console.error('[CastUtils] Error showing AirPlay picker:', error);
    return false;
  }
}

/**
 * Listen for AirPlay availability changes.
 * Fires when AirPlay devices become available or unavailable on the network.
 * 
 * @param {HTMLVideoElement} videoElement 
 * @param {function} callback - (available: boolean) => void
 * @returns {function} cleanup function to remove listener
 */
export function onAirPlayAvailabilityChange(videoElement, callback) {
  if (!videoElement) return () => {};
  
  const handler = (event) => {
    const available = event.availability === 'available';
    console.log('[CastUtils] AirPlay availability changed:', available);
    callback(available);
  };
  
  videoElement.addEventListener('webkitplaybacktargetavailabilitychanged', handler);
  
  return () => {
    videoElement.removeEventListener('webkitplaybacktargetavailabilitychanged', handler);
  };
}

/**
 * Listen for when playback is routed to/from an AirPlay device.
 * 
 * @param {HTMLVideoElement} videoElement
 * @param {function} callback - (isRemote: boolean) => void
 * @returns {function} cleanup function
 */
export function onAirPlayTargetChange(videoElement, callback) {
  if (!videoElement) return () => {};
  
  const handler = () => {
    // webkitCurrentPlaybackTargetIsWireless indicates if playing on external device
    const isRemote = videoElement.webkitCurrentPlaybackTargetIsWireless || false;
    console.log('[CastUtils] AirPlay target changed, wireless:', isRemote);
    callback(isRemote);
  };
  
  videoElement.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', handler);
  
  return () => {
    videoElement.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', handler);
  };
}
