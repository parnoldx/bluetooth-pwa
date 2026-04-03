// Food database module - combines local data with OpenFoodFacts API

import { findFoodByBarcode, addCustomFood, getCustomFoods } from './database.js';

// Load local foods database
let localFoods = [];

// Detect device language - German iOS uses 'de-DE', 'de-AT', 'de-CH', etc.
export function getDeviceLocale() {
  return navigator.language || navigator.userLanguage || 'en-US';
}

export function isGermanLocale() {
  const locale = getDeviceLocale().toLowerCase();
  return locale.startsWith('de');
}

// Get localized name for a food
export function getLocalizedName(food) {
  if (!food) return 'Unknown';
  if (isGermanLocale() && food.name_de) {
    return food.name_de;
  }
  return food.name || 'Unknown';
}

export async function loadLocalFoods() {
  try {
    const response = await fetch('foods.json');
    const data = await response.json();
    localFoods = data.foods || [];
    return localFoods;
  } catch (error) {
    console.error('Failed to load local foods:', error);
    localFoods = [];
    return [];
  }
}

// Initialize on module load
loadLocalFoods();

// Search local foods by name (case-insensitive, partial match)
// Searches in both English and German names
export async function searchLocalFoods(query) {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const isGerman = isGermanLocale();

  // Get custom foods from IndexedDB
  const customFoods = await getCustomFoods();

  // Combine local and custom foods
  const allFoods = [...localFoods, ...customFoods];

  // Score and sort results
  const scored = allFoods.map(food => {
    const nameEn = (food.name || '').toLowerCase();
    const nameDe = (food.name_de || '').toLowerCase();
    let score = 0;

    // Check English name
    if (nameEn === lowerQuery) score += 100;
    else if (nameEn.startsWith(lowerQuery)) score += 50;
    else if (nameEn.includes(' ' + lowerQuery)) score += 30;
    else if (nameEn.includes(lowerQuery)) score += 10;

    // Check German name (only if German locale or query matches)
    if (nameDe === lowerQuery) score += 100;
    else if (nameDe.startsWith(lowerQuery)) score += 50;
    else if (nameDe.includes(' ' + lowerQuery)) score += 30;
    else if (nameDe.includes(lowerQuery)) score += 10;

    // Boost score for exact match in current locale language
    if (isGerman && nameDe === lowerQuery) score += 20;
    if (!isGerman && nameEn === lowerQuery) score += 20;

    return { food, score };
  }).filter(item => item.score > 0);

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map(item => item.food);
}

// Get food by barcode - checks cache first, then API
export async function getFoodByBarcode(barcode) {
  // Validate barcode
  if (!barcode || barcode.length < 8) {
    throw new Error('Invalid barcode');
  }

  // Check custom foods first (user may have added/corrected it)
  const customFood = await findFoodByBarcode(barcode);
  if (customFood) {
    return normalizeFoodData(customFood);
  }

  // Fetch from OpenFoodFacts
  try {
    const food = await fetchOpenFoodFacts(barcode);
    return food;
  } catch (error) {
    console.error('OpenFoodFacts lookup failed:', error);
    throw new Error('Product not found');
  }
}

// Fetch from OpenFoodFacts API
async function fetchOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CalorieTracker/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 1 || !data.product) {
    throw new Error('Product not found in database');
  }

  return normalizeOpenFoodFactsData(data.product, barcode);
}

// Normalize OpenFoodFacts data to our format
function normalizeOpenFoodFactsData(product, barcode) {
  const nutriments = product.nutriments || {};

  // OpenFoodFacts uses kJ for energy, convert to kcal if needed
  let calories = nutriments['energy-kcal_100g'] || nutriments['energy-kcal'];
  if (!calories && nutriments['energy-kj']) {
    // Convert kJ to kcal: 1 kcal = 4.184 kJ
    calories = nutriments['energy-kj'] / 4.184;
  }
  if (!calories && nutriments['energy']) {
    // Some products use kJ in 'energy' field
    const energy = nutriments['energy'];
    // If value is > 1000, it's likely kJ
    calories = energy > 1000 ? energy / 4.184 : energy;
  }

  // For German locale, try to use German product name from OpenFoodFacts
  const isGerman = isGermanLocale();
  const productName = isGerman && product.product_name_de
    ? product.product_name_de
    : (product.product_name || product.generic_name || 'Unknown Product');

  return {
    barcode,
    name: productName,
    brand: product.brands,
    calories: Math.round(calories || 0),
    protein: Math.round((nutriments.proteins_100g || 0) * 10) / 10,
    carbs: Math.round((nutriments.carbohydrates_100g || 0) * 10) / 10,
    fat: Math.round((nutriments.fat_100g || 0) * 10) / 10,
    // Optional fields
    fiber: nutriments.fiber_100g,
    sugar: nutriments.sugars_100g,
    sodium: nutriments.sodium_100g,
    servingSize: nutriments.serving_size,
    // Metadata
    source: 'openfoodfacts',
    imageUrl: product.image_url || product.image_thumb_url
  };
}

// Normalize any food data to ensure consistent fields
function normalizeFoodData(food) {
  return {
    id: food.id || food.barcode,
    barcode: food.barcode,
    name: food.name || 'Unknown',
    name_de: food.name_de,
    brand: food.brand,
    calories: Math.round(food.calories || 0),
    protein: Math.round((food.protein || 0) * 10) / 10,
    carbs: Math.round((food.carbs || 0) * 10) / 10,
    fat: Math.round((food.fat || 0) * 10) / 10,
    fiber: food.fiber,
    sugar: food.sugar,
    sodium: food.sodium,
    servingSize: food.servingSize,
    imageUrl: food.imageUrl,
    source: food.source || 'local'
  };
}

// Calculate nutrition for a given weight
export function calculateNutrition(food, weightGrams) {
  const factor = weightGrams / 100;

  return {
    calories: Math.round((food.calories || 0) * factor),
    protein: Math.round((food.protein || 0) * factor * 10) / 10,
    carbs: Math.round((food.carbs || 0) * factor * 10) / 10,
    fat: Math.round((food.fat || 0) * factor * 10) / 10,
    fiber: food.fiber ? Math.round(food.fiber * factor * 10) / 10 : undefined,
    sugar: food.sugar ? Math.round(food.sugar * factor * 10) / 10 : undefined
  };
}

// Save a scanned product to custom foods (for offline use)
export async function saveScannedFood(foodData) {
  if (!foodData.barcode) {
    throw new Error('Cannot save food without barcode');
  }

  const existing = await findFoodByBarcode(foodData.barcode);
  if (existing) {
    // Already saved
    return existing;
  }

  return await addCustomFood(foodData);
}

// Get quick suggestions (recent and common foods)
export async function getQuickSuggestions() {
  const { getRecentFoods } = await import('./database.js');
  const recent = await getRecentFoods(5);

  // Add some common staples if we don't have enough recent
  const staples = localFoods.filter(f =>
    ['egg_large', 'chicken_breast_cooked', 'white_rice_cooked', 'oats_cooked'].includes(f.id)
  );

  // Combine and deduplicate
  const seen = new Set();
  const suggestions = [];

  for (const food of [...recent.map(r => ({ ...r, isRecent: true })), ...staples]) {
    const id = food.foodId || food.id || food.barcode;
    if (!seen.has(id)) {
      seen.add(id);
      suggestions.push(food);
    }
    if (suggestions.length >= 8) break;
  }

  return suggestions;
}
