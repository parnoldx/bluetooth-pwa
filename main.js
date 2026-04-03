// Main application module - orchestrates scale, database, scanning, and logging

import {
  startScanning,
  stopScanning,
  isCameraAvailable,
  cleanup as cleanupScanner
} from './scan.js';
import {
  startVoiceInput,
  searchFoods,
  parseWeightFromInput,
  isVoiceSupported,
  normalizeFoodQuery
} from './voice-input.js';
import {
  initLog,
  addToLog,
  removeFromLog,
  getCurrentEntries,
  getCurrentTotals,
  getCurrentDate,
  previousDay,
  nextDay,
  isToday,
  getQuickFoods,
  formatWeight,
  formatMacros
} from './log.js';
import {
  getFoodByBarcode,
  calculateNutrition,
  getQuickSuggestions
} from './food-db.js';

// State
let currentWeight = 0;
let isWeightStable = false;
let selectedFood = null;
let currentFoodWeight = 100; // Default weight for confirmation

// DOM Elements - Scale
const weightEl = document.getElementById('weight');
const stabilityEl = document.getElementById('stability');
const scaleStatusEl = document.getElementById('scaleStatus');
const connectBtn = document.getElementById('connectBtn');
const connectAnyBtn = document.getElementById('connectAnyBtn');
const tareBtn = document.getElementById('tareBtn');
const addToLogBtn = document.getElementById('addToLogBtn');
const deviceInfoEl = document.getElementById('deviceInfo');

// DOM Elements - Daily Totals
const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const totalCarbsEl = document.getElementById('totalCarbs');
const totalFatEl = document.getElementById('totalFat');
const currentDateEl = document.getElementById('currentDate');
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');

// DOM Elements - Food Log
const foodLogEl = document.getElementById('foodLog');

// DOM Elements - Modals
const scannerModal = document.getElementById('scannerModal');
const searchModal = document.getElementById('searchModal');
const confirmModal = document.getElementById('confirmModal');

// DOM Elements - Scanner
const scanBarcodeBtn = document.getElementById('scanBarcodeBtn');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const scannerStatus = document.getElementById('scannerStatus');

// DOM Elements - Search
const voiceInputBtn = document.getElementById('voiceInputBtn');
const searchInput = document.getElementById('searchInput');
const closeSearchBtn = document.getElementById('closeSearchBtn');
const searchResults = document.getElementById('searchResults');
const quickFoodsList = document.getElementById('quickFoodsList');
const startVoiceBtn = document.getElementById('startVoiceBtn');
const voiceStatus = document.getElementById('voiceStatus');

// DOM Elements - Confirmation
const confirmFoodName = document.getElementById('confirmFoodName');
const confirmFoodBrand = document.getElementById('confirmFoodBrand');
const confirmCalories = document.getElementById('confirmCalories');
const weightInput = document.getElementById('weightInput');
const useScaleWeightBtn = document.getElementById('useScaleWeightBtn');
const calcCalories = document.getElementById('calcCalories');
const calcProtein = document.getElementById('calcProtein');
const calcCarbs = document.getElementById('calcCarbs');
const calcFat = document.getElementById('calcFat');
const saveFoodBtn = document.getElementById('saveFoodBtn');
const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
const closeConfirmBtn = document.getElementById('closeConfirmBtn');

// DOM Elements - Loading & Toast
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const toastContainer = document.getElementById('toastContainer');

// Initialize
async function init() {
  // Initialize log
  await initLog(onLogUpdate);

  // Set up scale integration
  setupScaleIntegration();

  // Set up event listeners
  setupEventListeners();

  // Load quick foods
  await loadQuickFoods();

  // Update date display
  updateDateDisplay();

  console.log('Calorie Tracker initialized');
}

// Scale Integration
function setupScaleIntegration() {
  // Override the original handleWeightNotification to also update our state
  const originalHandler = window.handleWeightNotification;

  window.handleWeightNotification = function(event) {
    // Call original handler
    if (originalHandler) {
      originalHandler(event);
    }

    // Parse weight from the data
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);

    // Same parsing as app.js
    const PACKET_LENGTH = 18;
    const HEADER_BYTE = 0x10;
    const WEIGHT_HIGH_BYTE = 9;
    const WEIGHT_LOW_BYTE = 10;
    const STATUS_BYTE = 8;
    const STABLE_BIT = 0x08;
    const NEGATIVE_BIT = 0x02;
    const WEIGHT_DIVISOR = 10;

    if (data.length !== PACKET_LENGTH || data[0] !== HEADER_BYTE) {
      return;
    }

    const status = data[STATUS_BYTE];
    const isStable = (status & STABLE_BIT) !== 0;
    const isNegative = (status & NEGATIVE_BIT) !== 0;

    const weightRaw = (data[WEIGHT_HIGH_BYTE] << 8) | data[WEIGHT_LOW_BYTE];
    let weight = weightRaw / WEIGHT_DIVISOR;
    if (isNegative) weight = -weight;

    // Update our state
    currentWeight = weight;
    isWeightStable = isStable;

    // Update Add button state
    updateAddButtonState();
  };

  // Hook into connection state
  const originalUpdateUIConnected = window.updateUIConnected;
  window.updateUIConnected = function() {
    if (originalUpdateUIConnected) originalUpdateUIConnected();
    scaleStatusEl.textContent = 'Connected';
    scaleStatusEl.className = 'scale-status connected';
    updateAddButtonState();
  };

  const originalUpdateUIDisconnected = window.updateUIDisconnected;
  window.updateUIDisconnected = function() {
    if (originalUpdateUIDisconnected) originalUpdateUIDisconnected();
    scaleStatusEl.textContent = 'Disconnected';
    scaleStatusEl.className = 'scale-status disconnected';
    updateAddButtonState();
  };
}

function updateAddButtonState() {
  // Enable "Add to Log" button when connected and has stable weight > 0
  const isConnected = window.isConnected;
  const canAdd = isConnected && isWeightStable && currentWeight > 0;
  addToLogBtn.disabled = !canAdd;
}

// Event Listeners
function setupEventListeners() {
  // Date navigation
  prevDayBtn.addEventListener('click', async () => {
    await previousDay();
    updateDateDisplay();
  });

  nextDayBtn.addEventListener('click', async () => {
    await nextDay();
    updateDateDisplay();
  });

  // Add to log from scale
  addToLogBtn.addEventListener('click', () => {
    if (currentWeight > 0) {
      currentFoodWeight = Math.round(currentWeight);
      openSearchModal();
      showToast('Select a food for ' + formatWeight(currentFoodWeight), 'info');
    }
  });

  // Scanner
  scanBarcodeBtn.addEventListener('click', openScannerModal);
  closeScannerBtn.addEventListener('click', closeScannerModal);

  // Search
  voiceInputBtn.addEventListener('click', openSearchModal);
  closeSearchBtn.addEventListener('click', closeSearchModal);
  searchInput.addEventListener('input', debounce(onSearchInput, 300));
  startVoiceBtn.addEventListener('click', onVoiceButtonClick);

  // Confirmation
  closeConfirmBtn.addEventListener('click', closeConfirmModal);
  cancelConfirmBtn.addEventListener('click', closeConfirmModal);
  saveFoodBtn.addEventListener('click', onSaveFood);
  weightInput.addEventListener('input', onWeightInputChange);
  useScaleWeightBtn.addEventListener('click', () => {
    if (currentWeight > 0) {
      weightInput.value = Math.round(currentWeight);
      onWeightInputChange();
    }
  });

  // Close modals on backdrop click
  scannerModal.addEventListener('click', (e) => {
    if (e.target === scannerModal) closeScannerModal();
  });
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearchModal();
  });
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

// Log Update Handler
function onLogUpdate({ entries, dailyTotals, date }) {
  // Update totals display
  totalCaloriesEl.textContent = Math.round(dailyTotals.calories);
  totalProteinEl.textContent = Math.round(dailyTotals.protein);
  totalCarbsEl.textContent = Math.round(dailyTotals.carbs);
  totalFatEl.textContent = Math.round(dailyTotals.fat);

  // Update log display
  renderFoodLog(entries);
}

function renderFoodLog(entries) {
  if (entries.length === 0) {
    foodLogEl.innerHTML = '<p class="empty-log">No entries yet. Add food from the scale or search.</p>';
    return;
  }

  foodLogEl.innerHTML = entries.map(entry => `
    <div class="food-entry" data-id="${entry.id}">
      <div class="food-entry-info">
        <div class="food-entry-name">${escapeHtml(entry.name)}</div>
        <div class="food-entry-details">${formatWeight(entry.weight)}</div>
        <div class="food-entry-macros">${formatMacros(entry.protein, entry.carbs, entry.fat)}</div>
      </div>
      <div class="food-entry-calories">
        <div class="calories">${entry.calories}</div>
        <div class="unit">cal</div>
      </div>
      <button class="btn-delete" onclick="window.deleteEntry(${entry.id})" title="Delete">🗑️</button>
    </div>
  `).join('');
}

// Make deleteEntry available globally for the onclick handler
window.deleteEntry = async function(id) {
  if (confirm('Delete this entry?')) {
    await removeFromLog(id);
    showToast('Entry deleted', 'success');
  }
};

// Date Display
function updateDateDisplay() {
  const date = getCurrentDate();
  const today = new Date().toISOString().split('T')[0];

  if (date === today) {
    currentDateEl.textContent = 'Today';
  } else {
    const d = new Date(date);
    currentDateEl.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Disable next button if on today
  nextDayBtn.disabled = isToday();
}

// Scanner Modal
async function openScannerModal() {
  scannerModal.classList.remove('hidden');
  scannerStatus.textContent = 'Starting camera...';

  const hasCamera = await isCameraAvailable();
  if (!hasCamera) {
    scannerStatus.textContent = 'Camera not available';
    showToast('Camera not available on this device', 'error');
    return;
  }

  try {
    await startScanning(onBarcodeScanned, (error) => {
      scannerStatus.textContent = 'Error: ' + error.message;
      showToast('Scanner error: ' + error.message, 'error');
    });
    scannerStatus.textContent = 'Position barcode in frame';
  } catch (error) {
    scannerStatus.textContent = 'Failed to start camera';
    showToast('Failed to start camera', 'error');
  }
}

async function closeScannerModal() {
  await stopScanning();
  scannerModal.classList.add('hidden');
}

async function onBarcodeScanned(barcode) {
  scannerStatus.textContent = 'Looking up product...';
  showLoading('Looking up product...');

  try {
    const food = await getFoodByBarcode(barcode);
    hideLoading();
    await closeScannerModal();
    openConfirmModal(food);
    showToast(`Found: ${food.name}`, 'success');
  } catch (error) {
    hideLoading();
    scannerStatus.textContent = 'Product not found';
    showToast('Product not found. Try manual search.', 'error');

    // Switch to manual search after a delay
    setTimeout(async () => {
      await closeScannerModal();
      openSearchModal();
      searchInput.value = '';
      searchInput.placeholder = 'Type product name...';
      searchInput.focus();
    }, 1500);
  }
}

// Search Modal
async function openSearchModal() {
  searchModal.classList.remove('hidden');
  searchInput.value = '';
  searchResults.innerHTML = '';
  await loadQuickFoods();
  searchInput.focus();
}

async function closeSearchModal() {
  searchModal.classList.add('hidden');
  stopVoiceInput();
}

async function loadQuickFoods() {
  const foods = await getQuickFoods();

  if (foods.length === 0) {
    quickFoodsList.innerHTML = '<span class="quick-food-chip">Start typing to search</span>';
    return;
  }

  quickFoodsList.innerHTML = foods.map(food => `
    <span class="quick-food-chip" data-food='${escapeHtml(JSON.stringify(food))}'>
      ${escapeHtml(food.name)}
    </span>
  `).join('');

  // Add click handlers
  quickFoodsList.querySelectorAll('.quick-food-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const foodData = JSON.parse(chip.dataset.food);
      closeSearchModal();
      openConfirmModal(foodData);
    });
  });
}

async function onSearchInput(e) {
  const query = e.target.value.trim();

  if (query.length < 2) {
    searchResults.innerHTML = '';
    await loadQuickFoods();
    return;
  }

  const foods = await searchFoods(query);
  renderSearchResults(foods);
}

function renderSearchResults(foods) {
  if (foods.length === 0) {
    searchResults.innerHTML = '<p class="empty-log">No foods found. Try a different search.</p>';
    return;
  }

  searchResults.innerHTML = foods.map(food => `
    <div class="food-result" data-food='${escapeHtml(JSON.stringify(food))}'>
      <div class="food-result-info">
        <div class="food-result-name">${escapeHtml(food.name)}</div>
        ${food.brand ? `<div class="food-result-brand">${escapeHtml(food.brand)}</div>` : ''}
      </div>
      <div class="food-result-nutrition">
        ${food.calories} cal/100g
      </div>
    </div>
  `).join('');

  // Add click handlers
  searchResults.querySelectorAll('.food-result').forEach(result => {
    result.addEventListener('click', () => {
      const foodData = JSON.parse(result.dataset.food);
      closeSearchModal();
      openConfirmModal(foodData);
    });
  });
}

// Voice Input
function onVoiceButtonClick() {
  if (!isVoiceSupported()) {
    showToast('Voice input not supported on this device', 'error');
    searchInput.focus();
    return;
  }

  voiceStatus.classList.remove('hidden');
  startVoiceInput(
    (result) => {
      voiceStatus.classList.add('hidden');

      // Parse the transcript
      const { foodName, weight } = parseWeightFromInput(result.transcript);

      if (weight) {
        currentFoodWeight = weight;
      }

      searchInput.value = foodName;
      onSearchInput({ target: searchInput });
    },
    (error) => {
      voiceStatus.classList.add('hidden');
      showToast(error.message, 'error');
    }
  );
}

// Confirmation Modal
function openConfirmModal(food) {
  selectedFood = food;

  // Set food info
  confirmFoodName.textContent = food.name;
  confirmFoodBrand.textContent = food.brand || '';
  confirmCalories.textContent = food.calories || 0;

  // Set default weight
  weightInput.value = currentFoodWeight;

  // Calculate initial nutrition
  updateCalculatedNutrition();

  // Show modal
  confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  confirmModal.classList.add('hidden');
  selectedFood = null;
}

function onWeightInputChange() {
  currentFoodWeight = parseFloat(weightInput.value) || 0;
  updateCalculatedNutrition();
}

function updateCalculatedNutrition() {
  if (!selectedFood || currentFoodWeight <= 0) {
    calcCalories.textContent = '0';
    calcProtein.textContent = '0';
    calcCarbs.textContent = '0';
    calcFat.textContent = '0';
    return;
  }

  const nutrition = calculateNutrition(selectedFood, currentFoodWeight);
  calcCalories.textContent = nutrition.calories;
  calcProtein.textContent = nutrition.protein;
  calcCarbs.textContent = nutrition.carbs;
  calcFat.textContent = nutrition.fat;
}

async function onSaveFood() {
  if (!selectedFood || currentFoodWeight <= 0) {
    showToast('Please enter a valid weight', 'error');
    return;
  }

  try {
    await addToLog(selectedFood, currentFoodWeight);
    closeConfirmModal();
    showToast('Added to log!', 'success');

    // Reset weight for next time
    currentFoodWeight = 100;
  } catch (error) {
    showToast('Failed to add: ' + error.message, 'error');
  }
}

// Utility Functions
function showLoading(text) {
  loadingText.textContent = text || 'Loading...';
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Remove after animation
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function closeAllModals() {
  closeScannerModal();
  closeSearchModal();
  closeConfirmModal();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, ms) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Handle page visibility change (pause/resume scanner)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopScanning();
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupScanner();
});

// Start the app
init().catch(console.error);
