/**
 * Svensktoppen Wikipedia Scraper
 *
 * Scrapes Swedish Wikipedia's "Lista över svensktoppsmelodier YYYY" pages
 * (1962–present) to build a comprehensive list of all songs that have ever
 * appeared on Svensktoppen — Sweden's domestic Swedish-language chart.
 *
 * Unlike swedishcharts.com (which includes international hits), Svensktoppen
 * is exclusively for Swedish domestic/Swedish-language music, so every entry
 * is Swedish origin by definition.
 *
 * Data source: sv.wikipedia.org MediaWiki API (action=parse&prop=wikitext)
 * Output: backend/data/svensktoppen-wiki.json
 *
 * Run once (or occasionally to refresh) — NOT called at server runtime.
 *
 * Usage:
 *   node backend/scripts/scrape-svensktoppen-wikipedia.js
 *   node backend/scripts/scrape-svensktoppen-wikipedia.js --yearMin=1962 --yearMax=1980
 *   node backend/scripts/scrape-svensktoppen-wikipedia.js --dry-run
 *   node backend/scripts/scrape-svensktoppen-wikipedia.js --merge
 *
 * Options:
 *   --yearMin=YYYY     Start year (default: 1962)
 *   --yearMax=YYYY     End year   (default: current year)
 *   --output=PATH      Output file path (default: backend/data/svensktoppen-wiki.json)
 *   --delay=MS         Delay between requests in ms (default: 500)
 *   --dry-run          Fetch 3 sample years and print without writing
 *   --merge            Merge with existing file instead of overwriting (dedup by artist+title)
 */

'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val === undefined ? true : val;
  return acc;
}, {});

const isDryRun = !!args['dry-run'];
const isMerge = !!args['merge'];
const delayMs = Number(args.delay) || 500;
const defaultOutput = path.resolve(__dirname, '..', 'data', 'svensktoppen-wiki.json');
const outputPath = args.output ? path.resolve(args.output) : defaultOutput;

const currentYear = new Date().getFullYear();
let yearMin = Number(args.yearMin) || 1962;
let yearMax = Number(args.yearMax) || currentYear;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikipedia requires a descriptive User-Agent
const HEADERS = {
  'User-Agent': 'BeatablyGame/1.0 (music timeline guessing game; https://beatably.app)',
  'Accept': 'application/json',
};

/**
 * Fetch the wikitext for a given Wikipedia page title via the MediaWiki API.
 * Returns { wikitext, missing } where missing=true if the page doesn't exist.
 */
async function fetchWikitext(pageTitle) {
  const url = 'https://sv.wikipedia.org/w/api.php';
  const params = {
    action: 'parse',
    page: pageTitle,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
  };

  const resp = await axios.get(url, { headers: HEADERS, params, timeout: 15000 });
  const data = resp.data;

  if (data.error) {
    if (data.error.code === 'missingtitle') return { wikitext: null, missing: true };
    throw new Error(`Wikipedia API error: ${data.error.info}`);
  }

  const wikitext = data.parse?.wikitext || null;
  return { wikitext, missing: !wikitext };
}

// ---------------------------------------------------------------------------
// Wikitext parsing
// ---------------------------------------------------------------------------

/**
 * Strip wikilinks: [[Page|Display]] → Display, [[Page]] → Page
 */
function stripWikilinks(s) {
  return s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
           .replace(/\[\[([^\]]+)\]\]/g, '$1');
}

/**
 * Strip {{...}} templates (refs, footnotes, formatting templates).
 * Extracts the value from known display templates like {{nts|25}} → "25".
 * Handles nested braces.
 */
function stripTemplates(s) {
  let result = s;
  let prev;
  do {
    prev = result;
    // Extract value from numeric sort / display templates: {{nts|25}} → 25, {{sortname|...|Name}} → Name
    result = result.replace(/\{\{(?:nts|n2s|sort)\|([^|{}]*)\}\}/gi, '$1');
    // Then strip remaining templates entirely
    result = result.replace(/\{\{[^{}]*\}\}/g, '');
  } while (result !== prev);
  return result;
}

/**
 * Strip HTML tags and XML entities.
 */
function stripHtml(s) {
  return s
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/**
 * Clean a wikitext cell value: strip links, templates, HTML, then trim.
 */
function cleanCell(raw) {
  let s = String(raw || '');
  s = stripHtml(s);
  s = stripTemplates(s);
  s = stripWikilinks(s);
  // Strip leading/trailing wiki formatting (bold/italic markers, etc.)
  s = s.replace(/'{2,3}/g, '');
  // Strip footnote markers like [1], [a]
  s = s.replace(/\[[^\]]{1,4}\]/g, '');
  // Strip trailing asterisks used as annotation markers (e.g. "Song title *")
  s = s.replace(/\s*\*+\s*$/, '');
  return s.trim();
}

/**
 * Parse a number from a cell value, returns null if not valid.
 */
function parseNum(s) {
  const n = parseInt(String(s).replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Identify which column index corresponds to each field by examining header text.
 * Returns { titleIdx, artistIdx, weeksIdx, rankIdx } (any can be null if not found).
 */
function detectColumns(headers) {
  const result = { titleIdx: null, artistIdx: null, weeksIdx: null, rankIdx: null };

  const titlePat = /titel|sång\b|låt|song\b|title/i;
  const artistPat = /artist|framförd|sångare|interpret|utövare/i;
  const weeksPat = /veckor|weeks|antal/i;
  const rankPat = /plats|placering|position|rank|nr\b|#/i;

  headers.forEach((h, i) => {
    const clean = cleanCell(h).toLowerCase();
    if (result.rankIdx === null && rankPat.test(clean)) result.rankIdx = i;
    else if (result.titleIdx === null && titlePat.test(clean)) result.titleIdx = i;
    if (result.artistIdx === null && artistPat.test(clean)) result.artistIdx = i;
    if (result.weeksIdx === null && weeksPat.test(clean)) result.weeksIdx = i;
  });

  return result;
}

/**
 * Split a wikitable row into cells, handling || inline separators.
 * Input: the content after the leading |  (not including |- row separator lines or ! header lines).
 */
function splitCells(rowContent) {
  // rowContent may look like: " cell1 || cell2 || cell3"
  // But cells can also be on individual lines starting with |
  // We normalize: if the row uses || separators on one line, split by ||
  // If cells are on separate | lines, we'll handle that in the table parser.
  return rowContent.split(/\|\|/).map((c) => c.trim());
}

/**
 * Parse a numbered list format used in some years (e.g. 1976, 2008–2011).
 * Format: # [[Title]] – [[Artist]], N poäng
 */
function parseNumberedList(wikitext, year) {
  const entries = [];
  let rank = 0;

  for (const line of wikitext.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#') || trimmed.startsWith('##')) continue;

    rank++;
    let content = trimmed.slice(1).trim();

    // Strip HTML entities
    content = content.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

    // Remove points annotation at end: ", 17 405 poäng" or "17 405 poäng"
    content = content.replace(/,?\s*[\d\s]*\s*poäng\s*$/i, '').trim();

    // Find the separator between title and artist: em dash (–), en dash (—), or spaced hyphen " - "
    // We split at the first occurrence of  " – ", " — ", or " - [[" (only when followed by a wikilink)
    let sepIdx = -1;
    const emDash = content.indexOf(' – ');
    const enDash = content.indexOf(' — ');
    const hyphenLink = content.indexOf(' - [[');

    if (emDash !== -1) sepIdx = emDash;
    else if (enDash !== -1) sepIdx = enDash;
    else if (hyphenLink !== -1) sepIdx = hyphenLink;

    if (sepIdx === -1) continue;

    const rawTitle = content.slice(0, sepIdx).trim();
    const rawArtist = content.slice(sepIdx).replace(/^\s*[-–—]\s*/, '').trim();

    const title = cleanCell(rawTitle);
    const artist = cleanCell(rawArtist);

    if (!title || !artist || title.length < 2 || artist.length < 2) continue;

    entries.push({
      title,
      artist,
      rank,
      weeksOnChart: null,
      year,
      peakPos: rank,
      chartDate: `${year}-01-01`,
      source: 'svensktoppen-wiki',
    });
  }

  return entries;
}

/**
 * Parse all wikitables in the wikitext and extract song entries.
 * Falls back to numbered list parsing if no table entries are found.
 */
function parseWikitables(wikitext, year) {
  const entries = [];

  // Split wikitext into table blocks: {| ... |}
  // We handle this by iterating through the wikitext and finding table boundaries.
  const tableRegex = /\{\|[\s\S]*?\|\}/g;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(wikitext)) !== null) {
    const tableText = tableMatch[0];
    const tableEntries = parseOneTable(tableText, year);
    entries.push(...tableEntries);
  }

  // Fallback: if no table entries found, try numbered list format (used in some years)
  if (entries.length === 0) {
    const listEntries = parseNumberedList(wikitext, year);
    entries.push(...listEntries);
  }

  return entries;
}

function parseOneTable(tableText, year) {
  const lines = tableText.split('\n');
  const entries = [];

  let headers = [];
  let colMap = { titleIdx: null, artistIdx: null, weeksIdx: null, rankIdx: null };
  let currentRowCells = [];
  let inRow = false;
  let rankCounter = 0; // fallback rank if no rank column

  // We'll collect row lines, then process them when we hit |- or |}
  const flushRow = () => {
    if (currentRowCells.length === 0) return;

    const cells = currentRowCells;
    currentRowCells = [];

    // Check if this looks like a header row (all cells are empty or this is the first row)
    if (headers.length === 0) {
      // Treat as header
      headers = cells;
      colMap = detectColumns(headers);
      return;
    }

    // Skip rows with too few cells
    if (cells.length < 2) return;

    let title = null;
    let artist = null;
    let weeksOnChart = null;
    let rank = null;

    if (colMap.titleIdx !== null && colMap.titleIdx < cells.length) {
      title = cleanCell(cells[colMap.titleIdx]);
    }
    if (colMap.artistIdx !== null && colMap.artistIdx < cells.length) {
      artist = cleanCell(cells[colMap.artistIdx]);
    }
    if (colMap.weeksIdx !== null && colMap.weeksIdx < cells.length) {
      weeksOnChart = parseNum(cleanCell(cells[colMap.weeksIdx]));
    }
    if (colMap.rankIdx !== null && colMap.rankIdx < cells.length) {
      rank = parseNum(cleanCell(cells[colMap.rankIdx]));
    }

    // Fallback column assignment: if we couldn't identify columns by header,
    // try a positional heuristic. Typical Svensktoppen table has: rank, title, artist, weeks
    if (colMap.titleIdx === null && colMap.artistIdx === null) {
      if (cells.length >= 2) {
        // Try: col 0 = rank (number), col 1 = title, col 2 = artist
        const maybeRank = parseNum(cleanCell(cells[0]));
        if (maybeRank !== null && cells.length >= 3) {
          rank = maybeRank;
          title = cleanCell(cells[1]);
          artist = cleanCell(cells[2]);
          if (cells.length >= 4) weeksOnChart = parseNum(cleanCell(cells[3]));
        } else {
          // No rank column: col 0 = title, col 1 = artist
          title = cleanCell(cells[0]);
          artist = cleanCell(cells[1]);
          if (cells.length >= 3) weeksOnChart = parseNum(cleanCell(cells[2]));
        }
      }
    }

    if (!title || !artist) return;
    // Skip very short strings that are likely garbage
    if (title.length < 2 || artist.length < 2) return;
    // Skip rows that look like section headers embedded in the table
    if (/^\d{4}$/.test(title.trim())) return;

    if (!rank) {
      rankCounter++;
      rank = rankCounter;
    }

    entries.push({ title, artist, rank, weeksOnChart });
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('{|') || trimmed.startsWith('|}')) {
      // Table open/close — flush any pending row
      flushRow();
      continue;
    }

    if (trimmed.startsWith('|-')) {
      // Row separator — flush current row cells
      flushRow();
      inRow = true;
      currentRowCells = [];
      continue;
    }

    if (trimmed.startsWith('!')) {
      // Header cell(s)
      flushRow();
      const headerContent = trimmed.slice(1);
      // May be "! header1 !! header2 !! header3"
      const headerCells = headerContent.split(/!!/).map((c) => c.trim());
      // Set headers if not yet set, or if the current colMap has no recognized columns
      // (handles cases where a colspan note row was mistakenly treated as a header)
      if (headers.length === 0 || (colMap.titleIdx === null && colMap.artistIdx === null)) {
        headers = headerCells;
        colMap = detectColumns(headers);
      }
      continue;
    }

    if (trimmed.startsWith('|')) {
      // Data cell line
      inRow = true;
      const cellContent = trimmed.slice(1);

      // Inline multi-cell: "cell1 || cell2 || cell3"
      const rawCells = cellContent.includes('||')
        ? cellContent.split(/\|\|/)
        : [cellContent];

      for (const raw of rawCells) {
        // Strip cell attributes: "align="left" | content" or "style=... | content"
        // Pattern: one or more key=value pairs followed by | separator
        const attrStripped = raw.replace(/^[^|]*=[^|"]*(?:"[^"]*"[^|"]*)*\|/, '');
        currentRowCells.push((attrStripped !== raw ? attrStripped : raw).trim());
      }
      continue;
    }

    // Non-table-markup lines (plain text continuation of a cell) — skip or append
    // We skip them to keep things simple
  }

  // Flush any remaining row
  flushRow();

  // Attach year to all entries
  return entries.map((e) => ({
    ...e,
    year,
    peakPos: e.rank,
    chartDate: `${year}-01-01`,
    source: 'svensktoppen-wiki',
  }));
}

// ---------------------------------------------------------------------------
// Normalization and deduplication
// ---------------------------------------------------------------------------

/** Normalize artist/title for deduplication */
function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s*[-–—]\s*.*$/, '')
    .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deduplicate entries, keeping best (lowest) rank per artist+title */
function dedupeByBestRank(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${normKey(e.artist)}|${normKey(e.title)}`;
    const prev = map.get(key);
    const ePeak = Number.isFinite(e.peakPos) ? e.peakPos : 9999;
    const pPeak = Number.isFinite(prev?.peakPos) ? prev.peakPos : 9999;
    const eRank = Number.isFinite(e.rank) ? e.rank : 9999;
    const pRank = Number.isFinite(prev?.rank) ? prev.rank : 9999;
    // Prefer entry with more weeks info if ranks are equal
    const eWeeks = Number.isFinite(e.weeksOnChart) ? e.weeksOnChart : 0;
    const pWeeks = Number.isFinite(prev?.weeksOnChart) ? prev.weeksOnChart : 0;
    if (
      !prev ||
      ePeak < pPeak ||
      (ePeak === pPeak && eRank < pRank) ||
      (ePeak === pPeak && eRank === pRank && eWeeks > pWeeks)
    ) {
      map.set(key, e);
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Main scrape loop
// ---------------------------------------------------------------------------
async function scrape() {
  const years = [];
  for (let y = yearMin; y <= yearMax; y++) {
    years.push(y);
  }

  if (isDryRun) {
    // Sample just 3 years
    const sample = years.slice(0, 3);
    console.log(`[SvenskToppenScraper] DRY RUN — sampling years: ${sample.join(', ')}`);
    years.length = 0;
    years.push(...sample);
  }

  console.log(`[SvenskToppenScraper] Scraping ${yearMin}–${yearMax}, ${years.length} year pages, delay: ${delayMs}ms`);

  const allEntries = [];
  let totalRequests = 0;
  let totalParsed = 0;
  let totalMissing = 0;
  let totalErrors = 0;

  for (const year of years) {
    const pageTitle = `Svensktoppen ${year}`;

    if (totalRequests > 0) await sleep(delayMs);

    try {
      const { wikitext, missing } = await fetchWikitext(pageTitle);
      totalRequests++;

      if (missing) {
        console.log(`[SvenskToppenScraper] ${year}: page missing (skipping)`);
        totalMissing++;
        continue;
      }

      const entries = parseWikitables(wikitext, year);

      if (entries.length === 0) {
        console.warn(`[SvenskToppenScraper] ${year}: 0 entries parsed (page exists but no recognized tables)`);
      } else {
        allEntries.push(...entries);
        totalParsed += entries.length;
        console.log(`[SvenskToppenScraper] ${year}: ${entries.length} entries → running total ${totalParsed}`);
      }
    } catch (e) {
      console.warn(`[SvenskToppenScraper] ${year}: ${e.message}`);
      totalErrors++;
      totalRequests++;
    }
  }

  console.log(`\n[SvenskToppenScraper] Done — ${totalRequests} requests, ${totalParsed} raw entries, ${totalMissing} missing pages, ${totalErrors} errors`);

  const deduped = dedupeByBestRank(allEntries);
  console.log(`[SvenskToppenScraper] After dedup: ${deduped.length} unique tracks`);

  deduped.sort((a, b) => {
    if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
    return (a.rank || 9999) - (b.rank || 9999);
  });

  if (isDryRun) {
    console.log('\n[SvenskToppenScraper] Sample (first 20):');
    console.log(JSON.stringify(deduped.slice(0, 20), null, 2));
    return;
  }

  let finalEntries = deduped;
  if (isMerge && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const merged = dedupeByBestRank([...existing, ...deduped]);
      console.log(`[SvenskToppenScraper] Merged: ${existing.length} existing + ${deduped.length} new → ${merged.length} unique`);
      finalEntries = merged;
      // Re-sort after merge
      finalEntries.sort((a, b) => {
        if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
        return (a.rank || 9999) - (b.rank || 9999);
      });
    } catch (e) {
      console.warn('[SvenskToppenScraper] Could not merge with existing file:', e.message);
    }
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalEntries, null, 2), 'utf-8');
  console.log(`[SvenskToppenScraper] Wrote ${finalEntries.length} entries to ${outputPath}`);
  console.log('[SvenskToppenScraper] Commit this file to the repo so the backend can use it without scraping at runtime.');
}

scrape().catch((e) => {
  console.error('[SvenskToppenScraper] Fatal error:', e.message);
  process.exit(1);
});
