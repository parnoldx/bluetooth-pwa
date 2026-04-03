// Barcode scanning module using html5-qrcode

let scanner = null;
let isScanning = false;

// Callbacks set by caller
let onScanSuccessCallback = null;
let onScanErrorCallback = null;

// DOM element IDs
const READER_ELEMENT_ID = 'barcode-reader';

// Load html5-qrcode from CDN with fallback
let html5QrcodeLoaded = false;
let Html5QrcodeConstructor = null;

async function loadHtml5Qrcode() {
  if (html5QrcodeLoaded) return Html5QrcodeConstructor;

  // Try multiple CDN sources
  const cdnUrls = [
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/dist/html5-qrcode.min.js'
  ];

  for (const url of cdnUrls) {
    try {
      await loadScript(url);
      if (window.Html5Qrcode) {
        Html5QrcodeConstructor = window.Html5Qrcode;
        html5QrcodeLoaded = true;
        console.log('html5-qrcode loaded from', url);
        return Html5QrcodeConstructor;
      }
    } catch (e) {
      console.warn('Failed to load from', url, e.message);
    }
  }

  throw new Error('Failed to load html5-qrcode library');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// Initialize the scanner
async function getScanner() {
  if (scanner) return scanner;

  const Html5Qrcode = await loadHtml5Qrcode();
  scanner = new Html5Qrcode(READER_ELEMENT_ID);
  return scanner;
}

// Start scanning
export async function startScanning(onSuccess, onError) {
  if (isScanning) {
    console.log('Already scanning');
    return;
  }

  onScanSuccessCallback = onSuccess;
  onScanErrorCallback = onError;

  try {
    const html5QrCode = await getScanner();

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      disableFlip: false
    };

    // Use back camera on mobile
    const cameraConfig = { facingMode: 'environment' };

    await html5QrCode.start(
      cameraConfig,
      config,
      onScanSuccess,
      onScanFailure
    );

    isScanning = true;
    console.log('Barcode scanning started');

  } catch (error) {
    console.error('Failed to start scanner:', error);
    if (onError) onError(error);
    throw error;
  }
}

// Stop scanning
export async function stopScanning() {
  if (!isScanning || !scanner) {
    return;
  }

  try {
    await scanner.stop();
    isScanning = false;
    console.log('Barcode scanning stopped');
  } catch (error) {
    console.error('Error stopping scanner:', error);
    // Force reset
    isScanning = false;
    scanner = null;
  }
}

// Check if currently scanning
export function isScanningActive() {
  return isScanning;
}

// Successful scan handler
function onScanSuccess(decodedText, decodedResult) {
  console.log('Barcode detected:', decodedText);

  // Validate barcode format (should be numeric)
  const barcode = decodedText.trim().replace(/\D/g, '');

  if (barcode.length < 8) {
    console.log('Invalid barcode length, ignoring');
    return;
  }

  // Stop scanning after successful read
  stopScanning();

  if (onScanSuccessCallback) {
    onScanSuccessCallback(barcode);
  }
}

// Scan failure handler (called frequently when no barcode)
function onScanFailure(error) {
  // This is called frequently when no barcode is detected - don't spam logs
  // Only report actual errors
  if (error && typeof error === 'string' && !error.includes('No barcode')) {
    console.warn('Scan warning:', error);
  }

  // Don't call onScanErrorCallback for normal "no barcode detected" messages
  // Only for actual errors
}

// Request camera permission (can be called before scanning)
export async function requestCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('Camera permission denied:', error);
    return false;
  }
}

// Check if camera is available
export async function isCameraAvailable() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(d => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

// Clean up resources
export async function cleanup() {
  if (scanner) {
    try {
      if (isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch (error) {
      console.error('Error cleaning up scanner:', error);
    }
    scanner = null;
    isScanning = false;
  }
}
