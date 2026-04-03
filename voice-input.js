// Voice input and manual food search module

let recognition = null;
let isListening = false;

// Callbacks
let onResultCallback = null;
let onErrorCallback = null;

// Check for Web Speech API support
export function isVoiceSupported() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

// Initialize speech recognition
function initRecognition() {
  if (recognition) return recognition;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('Speech recognition not supported');
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 3;

  recognition.onresult = handleResult;
  recognition.onerror = handleError;
  recognition.onend = handleEnd;

  return recognition;
}

// Start voice input
export function startVoiceInput(onResult, onError) {
  if (isListening) {
    console.log('Already listening');
    return;
  }

  if (!isVoiceSupported()) {
    if (onError) onError(new Error('Voice input not supported on this device'));
    return;
  }

  onResultCallback = onResult;
  onErrorCallback = onError;

  try {
    const rec = initRecognition();
    rec.start();
    isListening = true;
    console.log('Voice input started');
  } catch (error) {
    console.error('Failed to start voice input:', error);
    isListening = false;
    if (onError) onError(error);
  }
}

// Stop voice input
export function stopVoiceInput() {
  if (!isListening || !recognition) return;

  try {
    recognition.stop();
    isListening = false;
  } catch (error) {
    console.error('Error stopping voice input:', error);
  }
}

// Handle speech result
function handleResult(event) {
  isListening = false;

  const results = event.results;
  if (results.length > 0) {
    const transcript = results[0][0].transcript;
    const confidence = results[0][0].confidence;

    console.log('Voice input result:', transcript, 'confidence:', confidence);

    // Get alternative interpretations
    const alternatives = [];
    for (let i = 0; i < results[0].length; i++) {
      alternatives.push(results[0][i].transcript);
    }

    if (onResultCallback) {
      onResultCallback({
        transcript: transcript.trim(),
        confidence,
        alternatives: alternatives.map(a => a.trim())
      });
    }
  }
}

// Handle speech error
function handleError(event) {
  isListening = false;
  console.error('Speech recognition error:', event.error);

  if (onErrorCallback) {
    const errorMessages = {
      'no-speech': 'No speech detected. Please try again.',
      'aborted': 'Voice input was cancelled.',
      'audio-capture': 'No microphone available.',
      'network': 'Network error. Please check your connection.',
      'not-allowed': 'Microphone permission denied.',
      'service-not-allowed': 'Speech service not available.',
      'bad-grammar': 'Grammar error.',
      'language-not-supported': 'Language not supported.'
    };

    onErrorCallback({
      error: event.error,
      message: errorMessages[event.error] || `Error: ${event.error}`
    });
  }
}

// Handle speech end
function handleEnd() {
  isListening = false;
  console.log('Voice input ended');
}

// Check if currently listening
export function isVoiceListening() {
  return isListening;
}

// Search food by text query
export async function searchFoods(query) {
  if (!query || query.length < 2) {
    return [];
  }

  // Import dynamically to avoid circular dependencies
  const { searchLocalFoods, getQuickSuggestions } = await import('./food-db.js');

  // If query is very short, show suggestions
  if (query.length < 3) {
    return await getQuickSuggestions();
  }

  // Otherwise search
  return await searchLocalFoods(query);
}

// Common speech-to-text corrections for food items
const FOOD_CORRECTIONS = {
  'eg': 'egg',
  'eggs': 'egg',
  'chicken': 'chicken breast',
  'rise': 'rice',
  'malk': 'milk',
  'bannana': 'banana',
  'pinut': 'peanut',
  'pinnut': 'peanut',
  'buter': 'butter',
  'cheez': 'cheese',
  'yogert': 'yogurt',
  'yoğurt': 'yogurt'
};

// Normalize food search query
export function normalizeFoodQuery(query) {
  let normalized = query.toLowerCase().trim();

  // Remove common filler words
  const fillerWords = ['a', 'an', 'the', 'some', 'piece', 'pieces', 'of'];
  const words = normalized.split(/\s+/);
  const filtered = words.filter(w => !fillerWords.includes(w));
  normalized = filtered.join(' ');

  // Apply corrections
  for (const [mistake, correction] of Object.entries(FOOD_CORRECTIONS)) {
    if (normalized === mistake || normalized.startsWith(mistake + ' ')) {
      normalized = normalized.replace(mistake, correction);
    }
  }

  return normalized;
}

// Parse weight from voice input (e.g., "200 grams of chicken" -> { foodName: 'chicken', weight: 200 })
export function parseWeightFromInput(input) {
  const text = input.toLowerCase();

  // Weight patterns
  const patterns = [
    // "200 grams of chicken", "200 g of chicken"
    /(\d+(?:\.\d+)?)\s*(?:grams?|g|gram)\s+(?:of\s+)?(.+)/i,
    // "chicken 200 grams", "chicken 200g"
    /(.+?)\s+(\d+(?:\.\d+)?)\s*(?:grams?|g|gram)/i,
    // "200g chicken"
    /(\d+(?:\.\d+)?)\s*g\s+(.+)/i,
    // "2 eggs" (count as weight if egg)
    /(\d+)\s*(eggs?|egg whites?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Check which pattern matched and extract accordingly
      if (pattern.source.includes('grams?|g') && pattern.source.includes('of\\s+')) {
        // "200 grams of food"
        return {
          weight: parseFloat(match[1]),
          foodName: match[2].trim()
        };
      } else if (pattern.source.includes('.+?') && pattern.source.includes('\\s+')) {
        // "food 200 grams"
        return {
          weight: parseFloat(match[2]),
          foodName: match[1].trim()
        };
      } else if (pattern.source.includes('egg')) {
        // "2 eggs" - estimate 50g per egg
        const count = parseInt(match[1]);
        return {
          weight: count * 50,
          foodName: match[2].includes('white') ? 'egg white' : 'egg'
        };
      } else {
        // Default
        return {
          weight: parseFloat(match[1]),
          foodName: match[2].trim()
        };
      }
    }
  }

  // No weight found
  return { foodName: text, weight: null };
}
