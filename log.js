// Daily food log management module

import {
  addEntry,
  deleteEntry,
  getEntriesByDate,
  getDailyTotals,
  recordFoodUse,
  getRecentFoods,
  clearAllData
} from './database.js';
import { calculateNutrition } from './food-db.js';

// Current state
let currentDate = new Date().toISOString().split('T')[0];
let entries = [];
let dailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

// UI update callback
let onUpdateCallback = null;

// Initialize log
export async function initLog(onUpdate) {
  onUpdateCallback = onUpdate;
  await refreshLog();
}

// Refresh log from database
export async function refreshLog(date = currentDate) {
  currentDate = date;
  entries = await getEntriesByDate(date);
  dailyTotals = await getDailyTotals(date);

  if (onUpdateCallback) {
    onUpdateCallback({ entries, dailyTotals, date });
  }

  return { entries, dailyTotals };
}

// Add food to log
export async function addToLog(food, weightGrams) {
  if (!food || !weightGrams || weightGrams <= 0) {
    throw new Error('Invalid food or weight');
  }

  // Calculate nutrition for this weight
  const nutrition = calculateNutrition(food, weightGrams);

  const entry = {
    date: currentDate,
    foodId: food.id || food.barcode,
    barcode: food.barcode,
    name: food.name,
    brand: food.brand,
    weight: weightGrams,
    ...nutrition,
    timestamp: new Date().toISOString()
  };

  // Save to database
  const id = await addEntry(entry);
  entry.id = id;

  // Record this food as recently used
  if (food.id || food.barcode) {
    await recordFoodUse(food.id || food.barcode, {
      name: food.name,
      brand: food.brand,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      barcode: food.barcode
    });
  }

  // Refresh
  await refreshLog();

  return entry;
}

// Remove entry from log
export async function removeFromLog(entryId) {
  await deleteEntry(entryId);
  await refreshLog();
}

// Update entry weight
export async function updateEntryWeight(entryId, newWeight) {
  const { updateEntry } = await import('./database.js');
  const entry = entries.find(e => e.id === entryId);

  if (!entry) {
    throw new Error('Entry not found');
  }

  // Get the original food data (stored in entry or fetch from foodId)
  const foodData = {
    calories: entry.calories / (entry.weight / 100),
    protein: entry.protein / (entry.weight / 100),
    carbs: entry.carbs / (entry.weight / 100),
    fat: entry.fat / (entry.weight / 100)
  };

  // Recalculate nutrition
  const factor = newWeight / 100;
  const updates = {
    weight: newWeight,
    calories: Math.round(foodData.calories * factor),
    protein: Math.round(foodData.protein * factor * 10) / 10,
    carbs: Math.round(foodData.carbs * factor * 10) / 10,
    fat: Math.round(foodData.fat * factor * 10) / 10
  };

  await updateEntry(entryId, updates);
  await refreshLog();
}

// Get current entries
export function getCurrentEntries() {
  return [...entries];
}

// Get current totals
export function getCurrentTotals() {
  return { ...dailyTotals };
}

// Get current date
export function getCurrentDate() {
  return currentDate;
}

// Set current date and refresh
export async function setDate(date) {
  await refreshLog(date);
}

// Go to previous day
export async function previousDay() {
  const date = new Date(currentDate);
  date.setDate(date.getDate() - 1);
  await setDate(date.toISOString().split('T')[0]);
}

// Go to next day
export async function nextDay() {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 1);

  // Don't allow future dates
  const today = new Date().toISOString().split('T')[0];
  const newDateStr = date.toISOString().split('T')[0];

  if (newDateStr > today) {
    return; // Can't go to future
  }

  await setDate(newDateStr);
}

// Check if current date is today
export function isToday() {
  const today = new Date().toISOString().split('T')[0];
  return currentDate === today;
}

// Get recent foods for quick add
export async function getQuickFoods() {
  return await getRecentFoods(10);
}

// Format weight for display
export function formatWeight(grams) {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)} kg`;
  }
  return `${Math.round(grams)} g`;
}

// Format calories for display
export function formatCalories(cal) {
  return `${cal.toLocaleString()} cal`;
}

// Format macros
export function formatMacros(protein, carbs, fat) {
  return `P: ${protein}g | C: ${carbs}g | F: ${fat}g`;
}

// Clear all data (for debugging)
export async function clearAll() {
  if (!confirm('Clear all data? This cannot be undone.')) {
    return;
  }
  await clearAllData();
  await refreshLog();
}
