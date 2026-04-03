// Barcode scanning module using html5-qrcode

let scanner = null;
let isScanning = false;

// Callbacks set by caller
let onScanSuccessCallback = null;
let onScanErrorCallback = null;

// DOM element IDs
const READER_ELEMENT_ID = 'barcode-reader';

// Initialize the scanner (lazy load html5-qrcode)
async function getScanner() {
  if (scanner) return scanner;

  // Dynamically import html5-qrcode
  const { Html5Qrcode } = await import('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/esm/index.js');
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
