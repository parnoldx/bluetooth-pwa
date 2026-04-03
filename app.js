// Arboleaf Scale Web Bluetooth PWA

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
const statusEl = document.getElementById('status');
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
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

// Check if Web Bluetooth is supported
if (!navigator.bluetooth) {
    statusEl.textContent = 'Web Bluetooth not supported - use Android Chrome';
    connectBtn.disabled = true;
}

// Event listeners
connectBtn.addEventListener('click', handleConnect);
connectAnyBtn.addEventListener('click', handleConnectAny);
tareBtn.addEventListener('click', handleTare);

// Auto-reconnect on load
window.addEventListener('load', () => {
    const savedDeviceId = localStorage.getItem('scaleDeviceId');
    if (savedDeviceId && navigator.bluetooth) {
        // Try to auto-reconnect
        tryAutoReconnect();
    }
});

async function tryAutoReconnect() {
    try {
        // Check if getDevices is available (requires chrome://flags on some versions)
        if (navigator.bluetooth.getDevices) {
            const devices = await navigator.bluetooth.getDevices();
            const savedId = localStorage.getItem('scaleDeviceId');
            const matchingDevice = devices.find(d => d.id === savedId);
            if (matchingDevice) {
                // Attempt to connect (device may or may not be currently connected)
                await connectToDevice(matchingDevice);
            }
        }
    } catch (e) {
        console.log('Auto-reconnect failed, user will need to connect manually:', e.message);
    }
}

async function handleConnect() {
    try {
        if (isConnected) {
            await disconnect();
            return;
        }

        statusEl.textContent = 'Scanning for Arboleaf scale...';
        connectBtn.disabled = true;
        connectAnyBtn.disabled = true;

        // Request device with name prefix filter (more permissive than exact match)
        device = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'QN' }
            ],
            optionalServices: [SERVICE_UUID]
        });

        await connectToDevice(device);

    } catch (error) {
        console.error('Connection error:', error);
        statusEl.textContent = 'Connection failed: ' + error.message;
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

        statusEl.textContent = 'Scanning all BLE devices...';
        connectBtn.disabled = true;
        connectAnyBtn.disabled = true;

        // Request device WITHOUT service filter - shows all BLE devices
        device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID, 'battery_service', 'device_information']
        });

        await connectToDevice(device);

    } catch (error) {
        console.error('Connection error:', error);
        statusEl.textContent = 'Connection failed: ' + error.message;
        connectBtn.disabled = false;
        connectAnyBtn.disabled = false;
    }
}

async function connectToDevice(targetDevice) {
    try {
        statusEl.textContent = 'Connecting to GATT server...';

        device = targetDevice;

        // Listen for disconnection
        device.addEventListener('gattserverdisconnected', handleDisconnect);

        // Connect to GATT server with timeout
        const connectPromise = device.gatt.connect();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 10000)
        );
        server = await Promise.race([connectPromise, timeoutPromise]);

        statusEl.textContent = 'Getting service...';

        // Get service
        const service = await server.getPrimaryService(SERVICE_UUID);

        statusEl.textContent = 'Getting characteristics...';

        // Get characteristics
        notifyChar = await service.getCharacteristic(NOTIFY_UUID);
        writeChar = await service.getCharacteristic(WRITE_UUID);

        statusEl.textContent = 'Starting notifications...';

        // Start notifications
        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', handleWeightNotification);

        statusEl.textContent = 'Setting units...';

        // Send startup command to set unit to grams
        await sendCommand(UNIT_G_CMD);

        // Save device ID for auto-reconnect
        localStorage.setItem('scaleDeviceId', device.id);
        localStorage.setItem('scaleDeviceName', device.name || 'Unknown');

        // Update UI
        isConnected = true;
        updateUIConnected();

        // Show device info
        deviceInfoEl.textContent = `Device: ${device.name || 'Unknown'} (${device.id})`;
        deviceInfoEl.classList.remove('hidden');

        statusEl.textContent = 'Connected - waiting for data...';
        statusEl.className = 'status connected';

    } catch (error) {
        console.error('Connection error:', error);
        statusEl.textContent = 'Connection failed: ' + error.message;
        throw error;
    } finally {
        connectBtn.disabled = false;
    }
}

function handleDisconnect() {
    const wasConnected = isConnected;
    isConnected = false;
    updateUIDisconnected();
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status disconnected';

    // Attempt auto-reconnect if connection was previously established
    if (wasConnected && device && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        statusEl.textContent = `Reconnecting... (attempt ${reconnectAttempts})`;
        setTimeout(() => {
            if (!isConnected) {
                connectToDevice(device).catch(() => {
                    // Connection failed, will retry or give up
                });
            }
        }, RECONNECT_DELAY);
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        statusEl.textContent = 'Connection lost - please reconnect manually';
        reconnectAttempts = 0;
    }
}

async function disconnect() {
    if (notifyChar) {
        try {
            await notifyChar.stopNotifications();
        } catch (e) {
            console.warn('Error stopping notifications:', e);
        }
    }

    if (server && server.connected) {
        await server.disconnect();
    }

    handleDisconnect();
}

function handleWeightNotification(event) {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);

    console.log('Received data:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '), 'Length:', data.length);

    // Verify packet length
    if (data.length !== PACKET_LENGTH) {
        console.warn('Unexpected packet length:', data.length, 'expected', PACKET_LENGTH);
        return;
    }

    // Verify header
    if (data[0] !== HEADER_BYTE) {
        console.warn('Bad header:', data[0].toString(16), 'expected', HEADER_BYTE.toString(16));
        return;
    }

    // Decode weight
    const status = data[STATUS_BYTE];
    const isStable = (status & STABLE_BIT) !== 0;
    const isNegative = (status & NEGATIVE_BIT) !== 0;

    // Weight in 0.1g units, big-endian uint16
    const weightRaw = (data[WEIGHT_HIGH_BYTE] << 8) | data[WEIGHT_LOW_BYTE];
    let weight = weightRaw / WEIGHT_DIVISOR;

    if (isNegative) {
        weight = -weight;
    }

    // Update UI
    weightEl.textContent = weight.toFixed(1);

    // Update stability indicator
    stabilityEl.className = 'stability ' + (isStable ? 'stable' : 'unstable');

    console.log('Weight:', weight, 'g', 'Stable:', isStable, 'Raw bytes:', weightRaw);
}

async function handleTare() {
    if (!isConnected || !writeChar) {
        statusEl.textContent = 'Not connected';
        return;
    }

    try {
        await sendCommand(TARE_CMD);
        statusEl.textContent = 'Tare sent';
        setTimeout(() => {
            if (isConnected) {
                statusEl.textContent = 'Connected';
            }
        }, 1000);
    } catch (error) {
        console.error('Tare error:', error);
        statusEl.textContent = 'Tare failed: ' + error.message;
    }
}

async function sendCommand(cmd) {
    if (!writeChar) {
        throw new Error('Not connected');
    }
    await writeChar.writeValue(cmd);
}

function updateUIConnected() {
    reconnectAttempts = 0; // Reset reconnection counter on successful connection
    connectBtn.textContent = 'Disconnect';
    connectBtn.classList.remove('btn-primary');
    connectBtn.classList.add('btn-secondary');
    connectAnyBtn.textContent = 'Disconnect';
    connectAnyBtn.classList.remove('btn-secondary');
    connectAnyBtn.classList.add('btn-secondary');
    tareBtn.disabled = false;
}

function updateUIDisconnected() {
    connectBtn.textContent = 'Connect to Scale';
    connectBtn.classList.add('btn-primary');
    connectBtn.classList.remove('btn-secondary');
    connectBtn.disabled = false;
    connectAnyBtn.textContent = 'Scan All BLE';
    connectAnyBtn.classList.remove('btn-secondary');
    connectAnyBtn.classList.add('btn-secondary');
    connectAnyBtn.disabled = false;
    tareBtn.disabled = true;
    weightEl.textContent = '---';
    stabilityEl.className = 'stability';
    device = null;
    server = null;
    notifyChar = null;
    writeChar = null;
}

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg))
            .catch(err => console.log('SW registration failed:', err));
    });
}
