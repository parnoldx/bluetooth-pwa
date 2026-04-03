// Arboleaf Scale Web Bluetooth PWA
// This file handles the Bluetooth scale connection

// UUIDs from protocol spec
const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const NOTIFY_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
const WRITE_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';

// Commands
const TARE_CMD = new Uint8Array([0x13, 0x04, 0x20, 0x37]);
const UNIT_G_CMD = new Uint8Array([0x13, 0x04, 0x01, 0x18]);

// Protocol constants (from spec)
const PACKET_LENGTH = 18;
const HEADER_BYTE = 0x10;
const WEIGHT_HIGH_BYTE = 9;
const WEIGHT_LOW_BYTE = 10;
const STATUS_BYTE = 8;
const STABLE_BIT = 0x08;
const NEGATIVE_BIT = 0x02;
const WEIGHT_DIVISOR = 10;

// DOM elements
const weightEl = document.getElementById('weight');
const stabilityEl = document.getElementById('stability');
const connectBtn = document.getElementById('connectBtn');
const connectAnyBtn = document.getElementById('connectAnyBtn');
const tareBtn = document.getElementById('tareBtn');
const deviceInfoEl = document.getElementById('deviceInfo');

// State
let device = null;
let server = null;
let notifyChar = null;
let writeChar = null;
let isConnected = false;
let hasReceivedData = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

// Make isConnected available globally
window.isConnected = false;

// Check if Web Bluetooth is supported
if (!navigator.bluetooth) {
  const scaleStatusEl = document.getElementById('scaleStatus');
  if (scaleStatusEl) {
    scaleStatusEl.textContent = 'Web Bluetooth not supported - use Android Chrome';
  }
  if (connectBtn) connectBtn.disabled = true;
}

// Event listeners
connectBtn.addEventListener('click', handleConnect);
connectAnyBtn.addEventListener('click', handleConnectAny);
tareBtn.addEventListener('click', handleTare);

// Check for saved device on load
window.addEventListener('load', () => {
  const savedDeviceId = localStorage.getItem('scaleDeviceId');
  const savedDeviceName = localStorage.getItem('scaleDeviceName');
  if (savedDeviceId && navigator.bluetooth) {
    connectBtn.textContent = `Reconnect to ${savedDeviceName || 'Scale'}`;
  }
});

async function tryAutoReconnect() {
  try {
    if (navigator.bluetooth.getDevices) {
      const devices = await navigator.bluetooth.getDevices();
      const savedId = localStorage.getItem('scaleDeviceId');
      const matchingDevice = devices.find(d => d.id === savedId);
      if (matchingDevice) {
        await connectToDevice(matchingDevice);
      }
    }
  } catch (e) {
    console.log('Auto-reconnect failed:', e.message);
  }
}

async function handleConnect() {
  try {
    if (isConnected) {
      await disconnect();
      return;
    }

    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Scanning for scale...';
    connectBtn.disabled = true;
    connectAnyBtn.disabled = true;

    device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'QN' }],
      optionalServices: [SERVICE_UUID]
    });

    console.log('Device selected:', device.name, device.id);
    await connectToDevice(device);

  } catch (error) {
    console.log('Connect error:', error.name, error.message);
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Connection failed: ' + error.message;
    connectBtn.disabled = false;
    connectAnyBtn.disabled = false;
  }
}

async function handleConnectAny() {
  try {
    if (isConnected) {
      await disconnect();
      return;
    }

    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Scanning all BLE devices...';
    connectBtn.disabled = true;
    connectAnyBtn.disabled = true;

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID, 'battery_service', 'device_information']
    });

    console.log('Device selected:', device.name, device.id);
    await connectToDevice(device);

  } catch (error) {
    console.log('Connect error:', error.name, error.message);
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Connection failed: ' + error.message;
    connectBtn.disabled = false;
    connectAnyBtn.disabled = false;
  }
}

async function connectToDevice(targetDevice) {
  try {
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Connecting...';

    device = targetDevice;
    device.addEventListener('gattserverdisconnected', handleDisconnect);

    const connectPromise = device.gatt.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    );
    server = await Promise.race([connectPromise, timeoutPromise]);

    if (scaleStatusEl) scaleStatusEl.textContent = 'Getting service...';
    const service = await server.getPrimaryService(SERVICE_UUID);

    if (scaleStatusEl) scaleStatusEl.textContent = 'Getting characteristics...';
    notifyChar = await service.getCharacteristic(NOTIFY_UUID);
    writeChar = await service.getCharacteristic(WRITE_UUID);

    if (scaleStatusEl) scaleStatusEl.textContent = 'Starting notifications...';
    await notifyChar.startNotifications();
    notifyChar.addEventListener('characteristicvaluechanged', handleWeightNotification);

    if (scaleStatusEl) scaleStatusEl.textContent = 'Setting units...';
    await sendCommand(UNIT_G_CMD);

    // Save device ID
    localStorage.setItem('scaleDeviceId', device.id);
    localStorage.setItem('scaleDeviceName', device.name || 'Unknown');

    // Update state
    isConnected = true;
    window.isConnected = true;
    updateUIConnected();

    // Show device info
    deviceInfoEl.textContent = `Device: ${device.name || 'Unknown'} (${device.id})`;
    deviceInfoEl.classList.remove('hidden');

    if (scaleStatusEl) {
      scaleStatusEl.textContent = 'Connected';
      scaleStatusEl.className = 'scale-status connected';
    }

  } catch (error) {
    console.log('Connection error:', error.name, error.message);
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Connection failed: ' + error.message;
    throw error;
  } finally {
    connectBtn.disabled = false;
  }
}

function handleDisconnect() {
  const wasConnected = isConnected;
  isConnected = false;
  window.isConnected = false;
  hasReceivedData = false;
  updateUIDisconnected();

  const scaleStatusEl = document.getElementById('scaleStatus');
  if (scaleStatusEl) {
    scaleStatusEl.textContent = 'Disconnected';
    scaleStatusEl.className = 'scale-status disconnected';
  }

  // Auto-reconnect
  if (wasConnected && device && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    if (scaleStatusEl) {
      scaleStatusEl.textContent = `Reconnecting... (attempt ${reconnectAttempts})`;
    }
    setTimeout(() => {
      if (!isConnected) {
        connectToDevice(device).catch(() => {});
      }
    }, RECONNECT_DELAY);
  } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (scaleStatusEl) scaleStatusEl.textContent = 'Connection lost - please reconnect manually';
    reconnectAttempts = 0;
  }
}

async function disconnect() {
  if (notifyChar) {
    try { await notifyChar.stopNotifications(); } catch (e) {}
  }
  if (server && server.connected) {
    await server.disconnect();
  }
  handleDisconnect();
}

// Make handleWeightNotification available globally for main.js to extend
window.handleWeightNotification = function(event) {
  const value = event.target.value;
  const data = new Uint8Array(value.buffer);

  // Verify packet
  if (data.length !== PACKET_LENGTH || data[0] !== HEADER_BYTE) {
    return;
  }

  // Decode
  const status = data[STATUS_BYTE];
  const isStable = (status & STABLE_BIT) !== 0;
  const isNegative = (status & NEGATIVE_BIT) !== 0;

  const weightRaw = (data[WEIGHT_HIGH_BYTE] << 8) | data[WEIGHT_LOW_BYTE];
  let weight = weightRaw / WEIGHT_DIVISOR;
  if (isNegative) weight = -weight;

  // Update UI
  if (weightEl) weightEl.textContent = weight.toFixed(1);
  if (stabilityEl) stabilityEl.className = 'stability ' + (isStable ? 'stable' : 'unstable');

  if (!hasReceivedData) {
    hasReceivedData = true;
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl && isConnected) {
      scaleStatusEl.textContent = 'Receiving data';
    }
  }
};

async function handleTare() {
  if (!isConnected || !writeChar) {
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Not connected';
    return;
  }

  try {
    await sendCommand(TARE_CMD);
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Tare sent';
    setTimeout(() => {
      if (isConnected && scaleStatusEl) {
        scaleStatusEl.textContent = 'Connected';
      }
    }, 1000);
  } catch (error) {
    console.log('Tare error:', error.message);
    const scaleStatusEl = document.getElementById('scaleStatus');
    if (scaleStatusEl) scaleStatusEl.textContent = 'Tare failed';
  }
}

async function sendCommand(cmd) {
  if (!writeChar) throw new Error('Not connected');
  await writeChar.writeValue(cmd);
}

// Make updateUI functions available globally for main.js to extend
window.updateUIConnected = function() {
  reconnectAttempts = 0;
  connectBtn.classList.add('hidden');
  connectAnyBtn.classList.add('hidden');
  tareBtn.disabled = false;
};

window.updateUIDisconnected = function() {
  const savedDeviceId = localStorage.getItem('scaleDeviceId');
  const savedDeviceName = localStorage.getItem('scaleDeviceName');

  connectBtn.textContent = savedDeviceId ? `Reconnect to ${savedDeviceName || 'Scale'}` : 'Connect Scale';
  connectBtn.classList.remove('hidden');
  connectAnyBtn.classList.remove('hidden');
  tareBtn.disabled = true;
  if (weightEl) weightEl.textContent = '---';
  if (stabilityEl) stabilityEl.className = 'stability';
  device = null;
  server = null;
  notifyChar = null;
  writeChar = null;
};

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg))
      .catch(err => console.log('SW registration failed:', err));
  });
}
