# Calorie Tracker - Project Documentation

## Overview
A Progressive Web App (PWA) for tracking calories using a Bluetooth kitchen scale, barcode scanning, and food search. German/English localization auto-detected from device locale.

## Architecture
- **No build system** - Vanilla JS with ES modules
- **PWA** with offline support via Service Worker
- **IndexedDB** for data persistence
- **Web Bluetooth** for scale connection (Arboleaf protocol)

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Main UI shell |
| `app.js` | Web Bluetooth scale connection (Arboleaf protocol) |
| `main.js` | App orchestration, UI logic, event handling |
| `scan.js` | Barcode scanning via html5-qrcode (CDN) |
| `food-db.js` | Food database - local JSON + OpenFoodFacts API |
| `log.js` | Daily food log, entries, totals calculation |
| `database.js` | IndexedDB wrapper |
| `voice-input.js` | Search utilities, text parsing |
| `foods.json` | Local food database (60 items, EN+DE) |
| `sw.js` | Service Worker for offline support |
| `styles.css` | Mobile-first styling |
| `manifest.json` | PWA manifest |

## Key Workflows

### 1. Scan Barcode
Click Scan → Camera opens → Scan barcode → Lookup via OpenFoodFacts → Confirmation dialog with live scale weight → Add to log

### 2. Search Food
Click Search → Modal opens (input focused, keyboard with dictation) → Type to search → Results appear, quick foods hidden → Select food → Confirmation dialog with live scale weight → Add to log

### 3. Scale Integration
- Auto-connects via Web Bluetooth
- 18-byte protocol: header 0x10, weight at bytes 9-10, status at byte 8
- Live weight updates in confirmation dialog
- Manual input shown only when scale disconnected

## Localization
- `getDeviceLocale()` detects `navigator.language`
- German (`de-*`) shows `name_de` from foods.json
- All other locales show English `name`
- Search works in both languages regardless of locale

## Data Model

### Food Entry
```javascript
{
  id: string,
  name: string,
  name_de?: string,
  calories: number,      // per 100g
  protein: number,
  carbs: number,
  fat: number,
  servingSize?: number
}
```

### Log Entry (IndexedDB)
```javascript
{
  id: number,
  foodId: string,
  name: string,
  weight: number,      // grams
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  date: string,        // YYYY-MM-DD
  timestamp: Date
}
```

## IndexedDB Schema
- `entries` - Daily food entries (key: id, index: date)
- `customFoods` - User-added foods (key: barcode)
- `settings` - App settings
- `recentFoods` - Recently used foods for quick access

## External APIs
- **OpenFoodFacts**: `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
- **html5-qrcode**: Loaded via CDN (unpkg fallback)

## UI Components
- Daily totals header (cal/protein/carbs/fat)
- Weight display with stability indicator
- Connect/Tare buttons
- Scan Barcode / Search Food buttons
- Modals: Scanner, Search, Confirmation
- Live weight display in confirmation (updates as scale changes)

## Cache Strategy
Service Worker: Cache-first with network fallback, auto-update on fetch. Version bumps (`v8`) force refresh.

## Current State
- Branch: `master` (calorie-tracker merged & deleted)
- Merged: PR #1 with full calorie tracking features
- Status: Production ready
