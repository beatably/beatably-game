// Test script for the enhanced song matching logic
// Run with: node test_matching.js

// Levenshtein distance function for fuzzy matching
const levenshteinDistance = (str1, str2) => {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
  
  const matrix = [];
  
  // Initialize first row and column
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill the matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

// Helper function to check if two strings are fuzzy matches
const isFuzzyMatch = (str1, str2) => {
  if (!str1 || !str2) return false;
  
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  // Allow more errors for longer strings
  let threshold;
  if (maxLength <= 4) {
    threshold = 1; // Very short words: allow 1 error
  } else if (maxLength <= 8) {
    threshold = 2; // Medium words: allow 2 errors
  } else {
    threshold = Math.min(3, Math.floor(maxLength * 0.25)); // Longer words: allow up to 25% errors, max 3
  }
  
  return distance <= threshold;
};

// Helper function to check if any variants match (exact or fuzzy)
const checkVariantMatch = (guessVariants, actualVariants, allowFuzzy = true) => {
  // First try exact matches
  const exactMatch = guessVariants.some(guessVariant => 
    actualVariants.some(actualVariant => guessVariant === actualVariant)
  );
  
  if (exactMatch) return { match: true, type: 'exact' };
  
  // If no exact match and fuzzy is allowed, try fuzzy matching
  if (allowFuzzy) {
    const fuzzyMatch = guessVariants.some(guessVariant => 
      actualVariants.some(actualVariant => isFuzzyMatch(guessVariant, actualVariant))
    );
    
    if (fuzzyMatch) return { match: true, type: 'fuzzy' };
  }
  
  return { match: false, type: 'none' };
};

// Helper function to normalize text for comparison
const normalizeText = (text) => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .trim()
    // Normalize accented characters
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Handle apostrophes and quotes - normalize all to standard apostrophe
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    // Handle common abbreviations and symbols BEFORE removing punctuation
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\bw\//g, 'with')
    .replace(/\bst\./g, 'saint')
    .replace(/\bdr\./g, 'doctor')
    .replace(/\bmr\./g, 'mister')
    .replace(/\bms\./g, 'miss')
    // Handle number-word equivalents
    .replace(/\b2\b/g, 'two')
    .replace(/\b4\b/g, 'four')
    .replace(/\b8\b/g, 'eight')
    .replace(/\btwo\b/g, '2')
    .replace(/\bfour\b/g, '4')
    .replace(/\beight\b/g, '8')
    // Remove articles at the beginning
    .replace(/^(the|a|an)\s+/i, '')
    // Remove most punctuation but keep apostrophes in contractions
    .replace(/[^\w\s']/g, ' ')
    // Normalize apostrophes in contractions (remove spaces around them)
    .replace(/\s*'\s*/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

// Helper function to extract alternative titles from parentheses
const extractAlternativeTitles = (title) => {
  if (!title) return [];
  
  const alternatives = [];
  
  // Extract main title (before parentheses)
  const mainTitle = title.replace(/\s*\([^)]*\)/g, '').trim();
  if (mainTitle) {
    alternatives.push(mainTitle);
  }
  
  // Extract content from parentheses
  const parenthesesMatches = title.match(/\(([^)]+)\)/g);
  if (parenthesesMatches) {
    parenthesesMatches.forEach(match => {
      const content = match.replace(/[()]/g, '').trim();
      if (content) {
        alternatives.push(content);
      }
    });
  }
  
  return alternatives;
};

// Enhanced function to normalize song titles for comparison
const normalizeSongTitle = (title) => {
  if (!title) return [];
  
  const alternatives = extractAlternativeTitles(title);
  const normalizedAlternatives = [];
  
  // If no alternatives found, use the original title
  if (alternatives.length === 0) {
    alternatives.push(title);
  }
  
  alternatives.forEach(alt => {
    let normalized = normalizeText(alt);
    
      // Remove common version indicators but be more selective
      normalized = normalized
        .replace(/\s*(radio edit|album version|single version|extended|acoustic|live|demo|instrumental)\s*.*$/i, '')
        .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
        .replace(/\s*[-–—]\s*.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Don't filter out "remaster/remastered" from parenthetical content as it might be the alternative title
      if (!alt.toLowerCase().includes('remaster')) {
        normalized = normalized.replace(/\s*(remaster|remastered)\s*.*$/i, '');
      }
    
    if (normalized) {
      normalizedAlternatives.push(normalized);
    }
  });
  
  // Remove duplicates
  return [...new Set(normalizedAlternatives)];
};

// Enhanced function to normalize artist names for comparison
const normalizeArtistName = (artist) => {
  if (!artist) return [];
  
  const alternatives = [artist];
  const normalizedAlternatives = [];
  
  alternatives.forEach(alt => {
    let normalized = normalizeText(alt);
    
    // Remove featuring artists
    normalized = normalized
      .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalized) {
      normalizedAlternatives.push(normalized);
    }
  });
  
  // Remove duplicates
  return [...new Set(normalizedAlternatives)];
};

// Test function with fuzzy matching support
const testMatching = (actualTitle, actualArtist, guessTitle, guessArtist) => {
  const normalizedGuessTitle = normalizeSongTitle(guessTitle);
  const normalizedActualTitle = normalizeSongTitle(actualTitle);
  const normalizedGuessArtist = normalizeArtistName(guessArtist);
  const normalizedActualArtist = normalizeArtistName(actualArtist);
  
  // Check title match (exact or fuzzy)
  const titleMatch = checkVariantMatch(normalizedGuessTitle, normalizedActualTitle, true);
  
  // Check artist match (exact or fuzzy)
  const artistMatch = checkVariantMatch(normalizedGuessArtist, normalizedActualArtist, true);
  
  const bothCorrect = titleMatch.match && artistMatch.match;
  
  console.log(`\n--- Test Case ---`);
  console.log(`Actual: "${actualTitle}" by "${actualArtist}"`);
  console.log(`Guess:  "${guessTitle}" by "${guessArtist}"`);
  console.log(`Normalized Actual Title: [${normalizedActualTitle.join(', ')}]`);
  console.log(`Normalized Guess Title:  [${normalizedGuessTitle.join(', ')}]`);
  console.log(`Normalized Actual Artist: [${normalizedActualArtist.join(', ')}]`);
  console.log(`Normalized Guess Artist:  [${normalizedGuessArtist.join(', ')}]`);
  console.log(`Title Match: ${titleMatch.match} (${titleMatch.type}), Artist Match: ${artistMatch.match} (${artistMatch.type}), Both: ${bothCorrect}`);
  
  return bothCorrect;
};

console.log('=== Enhanced Song Matching Test Suite ===');

// Test cases
const testCases = [
  // Basic exact matches
  ['Billie Jean', 'Michael Jackson', 'Billie Jean', 'Michael Jackson'],
  
  // Case insensitive
  ['Billie Jean', 'Michael Jackson', 'billie jean', 'michael jackson'],
  
  // Parenthetical content - main title
  ['Don\'t Stop Me Now (2011 Remaster)', 'Queen', 'Don\'t Stop Me Now', 'Queen'],
  
  // Parenthetical content - alternative title
  ['Bohemian Rhapsody (Remastered 2011)', 'Queen', 'Remastered 2011', 'Queen'],
  
  // Apostrophe normalization
  ['Don\'t Stop Believin\'', 'Journey', 'Dont Stop Believin', 'Journey'],
  
  // Article handling
  ['The Beatles', 'Yesterday', 'Beatles', 'Yesterday'],
  
  // Number/word equivalents
  ['2 Become 1', 'Spice Girls', 'Two Become 1', 'Spice Girls'],
  
  // Featuring artists
  ['Uptown Funk (feat. Bruno Mars)', 'Mark Ronson', 'Uptown Funk', 'Mark Ronson'],
  
  // Accented characters
  ['Café del Mar', 'Energy 52', 'Cafe del Mar', 'Energy 52'],
  
  // Common abbreviations
  ['Rock & Roll', 'Led Zeppelin', 'Rock and Roll', 'Led Zeppelin'],
  
  // Version indicators
  ['Song Title (Radio Edit)', 'Artist', 'Song Title', 'Artist'],
  
  // Complex case with multiple features
  ['Don\'t Stop Me Now (2011 Remaster)', 'The Beatles feat. Someone', 'dont stop me now', 'beatles'],
  
  // FUZZY MATCHING TEST CASES
  // Small spelling errors in titles
  ['Billie Jean', 'Michael Jackson', 'Bilie Jean', 'Michael Jackson'], // Missing 'l'
  ['Bohemian Rhapsody', 'Queen', 'Bohemian Rapsody', 'Queen'], // Missing 'h'
  ['Yesterday', 'The Beatles', 'Yesteday', 'The Beatles'], // Missing 'r'
  
  // Small spelling errors in artists
  ['Hello', 'Adele', 'Hello', 'Adel'], // Missing 'e'
  ['Shape of You', 'Ed Sheeran', 'Shape of You', 'Ed Sheran'], // Missing 'e'
  ['Imagine', 'John Lennon', 'Imagine', 'Jon Lennon'], // Missing 'h'
  
  // Character substitutions
  ['Smells Like Teen Spirit', 'Nirvana', 'Smells Like Teen Spirit', 'Nirvanna'], // Extra 'n'
  ['Hotel California', 'Eagles', 'Hotel California', 'Eagels'], // Swapped 'l' and 'e'
  
  // Should still fail - too many errors or completely wrong
  ['Billie Jean', 'Michael Jackson', 'Beat It', 'Michael Jackson'], // Completely different title
  ['Billie Jean', 'Michael Jackson', 'Billie Jean', 'Prince'], // Completely different artist
  ['Billie Jean', 'Michael Jackson', 'Blie Jen', 'Michael Jackson'], // Too many errors in title
];

let passed = 0;
let total = testCases.length;

testCases.forEach((testCase, index) => {
  const [actualTitle, actualArtist, guessTitle, guessArtist] = testCase;
  const result = testMatching(actualTitle, actualArtist, guessTitle, guessArtist);
  
  // Expected results (all should pass except the last three - they test failure cases)
  const shouldPass = index < total - 3;
  
  if (result === shouldPass) {
    console.log(`✅ PASS`);
    passed++;
  } else {
    console.log(`❌ FAIL - Expected ${shouldPass}, got ${result}`);
  }
});

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}/${total}`);
console.log(`Success Rate: ${Math.round((passed/total) * 100)}%`);

if (passed === total) {
  console.log('🎉 All tests passed! Enhanced matching system is working correctly.');
} else {
  console.log('⚠️  Some tests failed. Please review the matching logic.');
}
