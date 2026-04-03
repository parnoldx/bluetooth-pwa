// IndexedDB wrapper for Calorie Tracker

const DB_NAME = 'calorie-tracker-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store for daily food entries
      if (!db.objectStoreNames.contains('entries')) {
        const entriesStore = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entriesStore.createIndex('date', 'date', { unique: false });
        entriesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Store for custom/user-added foods
      if (!db.objectStoreNames.contains('customFoods')) {
        const foodsStore = db.createObjectStore('customFoods', { keyPath: 'id', autoIncrement: true });
        foodsStore.createIndex('name', 'name', { unique: false });
        foodsStore.createIndex('barcode', 'barcode', { unique: true });
      }

      // Store for recent/frequent foods
      if (!db.objectStoreNames.contains('recentFoods')) {
        const recentStore = db.createObjectStore('recentFoods', { keyPath: 'foodId' });
        recentStore.createIndex('lastUsed', 'lastUsed', { unique: false });
        recentStore.createIndex('useCount', 'useCount', { unique: false });
      }
    };
  });

  return dbPromise;
}

// Helper to get today's date string (YYYY-MM-DD)
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

// ENTRIES

export async function getEntriesByDate(date = getTodayString()) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const index = store.index('date');
    const request = index.getAll(date);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function addEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');

    const entryWithDate = {
      ...entry,
      date: entry.date || getTodayString(),
      timestamp: entry.timestamp || new Date().toISOString()
    };

    const request = store.add(entryWithDate);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updateEntry(id, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');

    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (!entry) {
        reject(new Error('Entry not found'));
        return;
      }

      const updated = { ...entry, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// CUSTOM FOODS

export async function getCustomFoods() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readonly');
    const store = tx.objectStore('customFoods');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function addCustomFood(food) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readwrite');
    const store = tx.objectStore('customFoods');

    const foodWithDefaults = {
      ...food,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fat: food.fat || 0,
      addedAt: new Date().toISOString()
    };

    const request = store.add(foodWithDefaults);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function findFoodByBarcode(barcode) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customFoods', 'readonly');
    const store = tx.objectStore('customFoods');
    const index = store.index('barcode');
    const request = index.get(barcode);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// RECENT FOODS (for quick access)

export async function recordFoodUse(foodId, foodData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recentFoods', 'readwrite');
    const store = tx.objectStore('recentFoods');

    const getReq = store.get(foodId);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      const record = existing
        ? { ...existing, useCount: existing.useCount + 1, lastUsed: new Date().toISOString() }
        : { foodId, ...foodData, useCount: 1, lastUsed: new Date().toISOString() };

      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getRecentFoods(limit = 10) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recentFoods', 'readonly');
    const store = tx.objectStore('recentFoods');
    const index = store.index('lastUsed');

    // Get all and sort by last used (descending), then limit
    const request = index.openCursor(null, 'prev');
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// CALCULATE DAILY TOTALS

export async function getDailyTotals(date = getTodayString()) {
  const entries = await getEntriesByDate(date);

  return entries.reduce((totals, entry) => ({
    calories: totals.calories + (entry.calories || 0),
    protein: totals.protein + (entry.protein || 0),
    carbs: totals.carbs + (entry.carbs || 0),
    fat: totals.fat + (entry.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

// Clear all data (for testing/debugging)
export async function clearAllData() {
  const db = await openDB();
  return Promise.all([
    new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
    new Promise((resolve, reject) => {
      const tx = db.transaction('customFoods', 'readwrite');
      const store = tx.objectStore('customFoods');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })
  ]);
}
