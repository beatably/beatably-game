/**
 * Nostalgilistan.se Scraper — Svensktoppen 2013–Present
 *
 * Scrapes https://www.nostalgilistan.se/svensktoppen for weekly chart snapshots
 * to fill in Svensktoppen data beyond what the Wikipedia scraper covers (post-2012).
 *
 * By default samples the first Sunday of each month (monthly snapshots).
 * Use --weekly for full weekly coverage (~4x more requests).
 *
 * Data source: nostalgilistan.se
 * Output: backend/data/nostalgilistan.json
 *
 * Run once (or occasionally to refresh) — NOT called at server runtime.
 *
 * Usage:
 *   node backend/scripts/scrape-nostalgilistan.js
 *   node backend/scripts/scrape-nostalgilistan.js --yearMin=2013 --yearMax=2020
 *   node backend/scripts/scrape-nostalgilistan.js --dry-run
 *   node backend/scripts/scrape-nostalgilistan.js --merge
 *   node backend/scripts/scrape-nostalgilistan.js --weekly
 *
 * Options:
 *   --yearMin=YYYY     Start year (default: 2013)
 *   --yearMax=YYYY     End year   (default: current year)
 *   --output=PATH      Output file path (default: backend/data/nostalgilistan.json)
 *   --delay=MS         Delay between requests in ms (default: 500)
 *   --dry-run          Fetch 2 sample dates and print without writing
 *   --merge            Merge with existing file instead of overwriting (dedup by artist+title)
 *   --weekly           Sample every Sunday instead of first-Sunday-of-month
 */

'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
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
const isWeekly = !!args['weekly'];
const delayMs = Number(args.delay) || 500;
const defaultOutput = path.resolve(__dirname, '..', 'data', 'nostalgilistan.json');
const outputPath = args.output ? path.resolve(args.output) : defaultOutput;

const currentYear = new Date().getFullYear();
const yearMin = Number(args.yearMin) || 2013;
const yearMax = Number(args.yearMax) || currentYear;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'BeatablyGame/1.0 (music timeline guessing game; https://beatably.app)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'sv,en;q=0.9',
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns the first Sunday >= the given date.
 */
function nextSunday(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  if (day !== 0) d.setUTCDate(d.getUTCDate() + (7 - day));
  return d;
}

/**
 * Format a Date as YYYYMMDD for use in nostalgilistan URLs.
 */
function formatDateCompact(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Format a Date as YYYY-MM-DD for storage in JSON.
 */
function formatDateISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generate all sample dates (Sundays) between yearMin and yearMax.
 * Monthly mode: first Sunday of each month.
 * Weekly mode: every Sunday.
 */
function generateSampleDates(yearMin, yearMax, weekly) {
  const dates = [];
  const end = new Date(Date.UTC(yearMax, 11, 31));

  if (weekly) {
    // Start from first Sunday of yearMin
    let current = nextSunday(new Date(Date.UTC(yearMin, 0, 1)));
    while (current <= end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 7);
    }
  } else {
    // First Sunday of each month
    for (let year = yearMin; year <= yearMax; year++) {
      for (let month = 0; month < 12; month++) {
        const firstOfMonth = new Date(Date.UTC(year, month, 1));
        const firstSunday = nextSunday(firstOfMonth);
        if (firstSunday.getUTCFullYear() === year && firstSunday <= end) {
          dates.push(new Date(firstSunday));
        }
      }
    }
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Title case helper
// ---------------------------------------------------------------------------

// Swedish/common short words that stay lowercase unless at start
const LOWERCASE_WORDS = new Set([
  'och', 'av', 'i', 'på', 'med', 'för', 'till', 'från', 'om', 'ur',
  'mot', 'utan', 'under', 'över', 'vid', 'hos', 'efter', 'innan',
  'sedan', 'att', 'men', 'eller', 'an', 'de', 'det', 'den', 'ett',
  'en', 'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on',
  'at', 'to', 'for', 'with', 'by', 'from',
]);

function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (!word) return word;
      // Always capitalize first word; capitalize others unless in lowercase set
      if (idx === 0 || !LOWERCASE_WORDS.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Fetch + parse a single chart page
// ---------------------------------------------------------------------------

/**
 * Fetch and parse a nostalgilistan Svensktoppen page for a given date.
 * Returns an array of raw entry objects (without year/chartDate yet).
 */
async function fetchChartPage(dateCompact) {
  const url = `https://www.nostalgilistan.se/svensktoppen/${dateCompact}`;
  const resp = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return parseChartPage(resp.data, dateCompact);
}

function parseChartPage(html, dateCompact) {
  const $ = cheerio.load(html);
  const entries = [];

  const year = parseInt(dateCompact.slice(0, 4), 10);
  const month = dateCompact.slice(4, 6);
  const day = dateCompact.slice(6, 8);
  const chartDate = `${year}-${month}-${day}`;

  $('.chartItem').each((_, el) => {
    const $el = $(el);

    // Prefer data attributes (reliable, already parsed by the site)
    const rawArtist = $el.attr('data-song-artist') || '';
    const rawTitle = $el.attr('data-song-title') || '';

    if (!rawArtist || !rawTitle) return;

    // Rank: first .position element inside this chart item
    const rankText = $el.find('.position').first().text().trim();
    const rank = parseInt(rankText, 10) || null;

    // Weeks on chart: <span title="X veckor på Svensktoppen">
    const weeksSpan = $el.find('[title*="veckor på Svensktoppen"]').first();
    let weeksOnChart = null;
    if (weeksSpan.length) {
      const weeksTitle = weeksSpan.attr('title') || '';
      const weeksMatch = weeksTitle.match(/^(\d+)\s+veckor/);
      if (weeksMatch) weeksOnChart = parseInt(weeksMatch[1], 10);
    }

    const title = toTitleCase(rawTitle);
    const artist = toTitleCase(rawArtist);

    if (title.length < 2 || artist.length < 2) return;

    entries.push({
      title,
      artist,
      rank,
      weeksOnChart,
      year,
      peakPos: rank,
      chartDate,
      source: 'nostalgilistan',
    });
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Normalization and deduplication (mirrors the Wikipedia scraper)
// ---------------------------------------------------------------------------

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s*[-–—]\s*.*$/, '')
    .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeByBestRank(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${normKey(e.artist)}|${normKey(e.title)}`;
    const prev = map.get(key);
    const ePeak = Number.isFinite(e.peakPos) ? e.peakPos : 9999;
    const pPeak = Number.isFinite(prev?.peakPos) ? prev.peakPos : 9999;
    const eRank = Number.isFinite(e.rank) ? e.rank : 9999;
    const pRank = Number.isFinite(prev?.rank) ? prev.rank : 9999;
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
  let dates = generateSampleDates(yearMin, yearMax, isWeekly);

  if (isDryRun) {
    dates = dates.slice(0, 2);
    console.log(`[NostalgilistanScraper] DRY RUN — fetching ${dates.length} sample dates`);
  }

  const mode = isWeekly ? 'weekly' : 'monthly (first Sunday)';
  console.log(`[NostalgilistanScraper] ${yearMin}–${yearMax}, ${dates.length} dates (${mode}), delay: ${delayMs}ms`);

  const allEntries = [];
  let totalFetched = 0;
  let totalParsed = 0;
  let totalErrors = 0;

  for (const date of dates) {
    const compact = formatDateCompact(date);
    const iso = formatDateISO(date);

    if (totalFetched > 0) await sleep(delayMs);

    try {
      const entries = await fetchChartPage(compact);
      totalFetched++;

      if (entries.length === 0) {
        console.warn(`[NostalgilistanScraper] ${iso}: 0 entries parsed`);
      } else {
        allEntries.push(...entries);
        totalParsed += entries.length;
        console.log(`[NostalgilistanScraper] ${iso}: ${entries.length} entries → running total ${totalParsed}`);
      }
    } catch (e) {
      const status = e.response?.status ? ` (HTTP ${e.response.status})` : '';
      console.warn(`[NostalgilistanScraper] ${iso}: ${e.message}${status}`);
      totalErrors++;
      totalFetched++;
    }
  }

  console.log(`\n[NostalgilistanScraper] Done — ${totalFetched} requests, ${totalParsed} raw entries, ${totalErrors} errors`);

  const deduped = dedupeByBestRank(allEntries);
  console.log(`[NostalgilistanScraper] After dedup: ${deduped.length} unique tracks`);

  deduped.sort((a, b) => {
    if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
    return (a.rank || 9999) - (b.rank || 9999);
  });

  if (isDryRun) {
    console.log('\n[NostalgilistanScraper] Sample output:');
    console.log(JSON.stringify(deduped.slice(0, 20), null, 2));
    return;
  }

  let finalEntries = deduped;
  if (isMerge && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const merged = dedupeByBestRank([...existing, ...deduped]);
      console.log(`[NostalgilistanScraper] Merged: ${existing.length} existing + ${deduped.length} new → ${merged.length} unique`);
      finalEntries = merged;
      finalEntries.sort((a, b) => {
        if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
        return (a.rank || 9999) - (b.rank || 9999);
      });
    } catch (e) {
      console.warn('[NostalgilistanScraper] Could not merge with existing file:', e.message);
    }
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalEntries, null, 2), 'utf-8');
  console.log(`[NostalgilistanScraper] Wrote ${finalEntries.length} entries to ${outputPath}`);
  console.log('[NostalgilistanScraper] Commit this file to the repo so the backend can use it without scraping at runtime.');
}

scrape().catch((e) => {
  console.error('[NostalgilistanScraper] Fatal error:', e.message);
  process.exit(1);
});
