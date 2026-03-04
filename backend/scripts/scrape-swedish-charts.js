/**
 * Swedish Chart Scraper
 *
 * Scrapes weekly singles chart data from swedishcharts.com and saves it
 * as a local JSON file (backend/data/swedish-charts.json) that the admin
 * bulk import uses for the "Swedish Charts" mode.
 *
 * Run once (or occasionally to refresh) — NOT called at server runtime.
 *
 * Usage:
 *   node backend/scripts/scrape-swedish-charts.js
 *   node backend/scripts/scrape-swedish-charts.js --yearMin=1980 --yearMax=2024
 *   node backend/scripts/scrape-swedish-charts.js --decade=1990
 *   node backend/scripts/scrape-swedish-charts.js --dry-run --yearMin=2010 --yearMax=2012
 *   node backend/scripts/scrape-swedish-charts.js --output=./data/swedish-charts.json
 *
 * Options:
 *   --yearMin=YYYY     Start year (default: 1975)
 *   --yearMax=YYYY     End year   (default: current year)
 *   --decade=YYYY      Scrape only this decade (e.g. 1990 → 1990-1999), overrides yearMin/yearMax
 *   --output=PATH      Output file path (default: backend/data/swedish-charts.json)
 *   --delay=MS         Delay between requests in ms (default: 1200)
 *   --dry-run          Fetch 2 sample weeks and print without writing
 *   --merge            Merge with existing file instead of overwriting (dedup by artist+title)
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
const delayMs = Number(args.delay) || 1200;
const defaultOutput = path.resolve(__dirname, '..', 'data', 'swedish-charts.json');
const outputPath = args.output ? path.resolve(args.output) : defaultOutput;

let yearMin = Number(args.yearMin) || 1975;
let yearMax = Number(args.yearMax) || new Date().getFullYear() - 1;
if (args.decade) {
  const d = Number(args.decade);
  yearMin = d;
  yearMax = Math.min(d + 9, new Date().getFullYear() - 1);
}

// ---------------------------------------------------------------------------
// Date generation
// Site uses date=YYYYMMDD format. We sample the first Friday of each quarter.
// ---------------------------------------------------------------------------
function firstFriday(year, month) {
  const d = new Date(year, month, 1);
  const daysUntilFriday = (5 - d.getDay() + 7) % 7;
  d.setDate(1 + daysUntilFriday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function quarterDates(year) {
  return [0, 3, 6, 9].map((month) => firstFriday(year, month));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9,sv;q=0.8',
  // Old IIS server returns 500 with gzip — force plain text
  'Accept-Encoding': 'identity',
};

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

/**
 * Parse the chart table from a swedishcharts.com weekly chart page.
 *
 * The page structure (confirmed by inspection):
 * - Table index 13 (0-based) is the chart table
 * - Header row has cells with class "tabletitle": #, LW, (blank), Artist/Title, Label, Prefix, W
 * - Data rows: rank in <td class="text" bgcolor="#7B7B7B">, artist+title in <a class="navb"> as <b>Artist</b><br>Title
 * - Last week rank in <td bgcolor="#DDDDDD"> (first one per row)
 * - Weeks on chart in the last <td> per row (also bgcolor="#DDDDDD")
 */
function parseChartPage(html, dateStr) {
  const $ = cheerio.load(html);
  const entries = [];
  const year = Number(dateStr.slice(0, 4));

  // Find the chart table: width=574 and contains class "tabletitle"
  let chartTable = null;
  $('table').each((_, el) => {
    const t = $(el);
    if (t.find('.tabletitle').length > 0 && t.attr('width') === '574') {
      chartTable = t;
      return false; // break
    }
  });

  if (!chartTable) {
    // Fallback: find any table with tabletitle cells
    $('table').each((_, el) => {
      if ($(el).find('.tabletitle').length > 0) {
        chartTable = $(el);
        return false;
      }
    });
  }

  if (!chartTable) return [];

  chartTable.find('tr').each((_, row) => {
    const $row = $(row);

    // Rank: first td with bgcolor="#7B7B7B" and class "text"
    const rankCell = $row.find('td.text[bgcolor="#7B7B7B"]').first();
    if (!rankCell.length) return;
    const rank = parseInt(rankCell.text().trim(), 10);
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) return;

    // Artist + Title: inside <a class="navb"> as <b>Artist</b><br>Title
    const link = $row.find('a.navb').first();
    if (!link.length) return;

    const artistEl = link.find('b').first();
    const artist = artistEl.text().trim();

    // Title is the text node after <b>...</b><br> — get the full link HTML and extract
    const linkHtml = link.html() || '';
    // Pattern: <b>Artist</b><br>Title
    const titleMatch = linkHtml.match(/<br\s*\/?>([\s\S]+)$/i);
    const title = titleMatch
      ? cheerio.load(titleMatch[1]).text().trim()
      : link.text().replace(artist, '').trim();

    if (!artist || !title) return;

    // Last week rank: first <td bgcolor="#DDDDDD"> with numeric content
    let lastWeek = null;
    $row.find('td[bgcolor="#DDDDDD"]').each((_, td) => {
      const v = parseInt($(td).text().trim(), 10);
      if (Number.isFinite(v) && v > 0 && lastWeek === null) lastWeek = v;
    });

    // Weeks on chart: last <td bgcolor="#DDDDDD"> — the rightmost one
    let weeksOnChart = null;
    const ddCells = $row.find('td[bgcolor="#DDDDDD"]');
    if (ddCells.length > 1) {
      const v = parseInt($(ddCells.last()).text().trim(), 10);
      if (Number.isFinite(v) && v > 0) weeksOnChart = v;
    }

    // Chart date from dateStr (YYYYMMDD → YYYY-MM-DD)
    const chartDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

    entries.push({
      title,
      artist,
      year,
      rank,
      peakPos: rank, // We scrape per week — treat current rank as peak proxy (dedup keeps best)
      weeksOnChart,
      lastWeek,
      chartDate,
      source: 'sweden',
    });
  });

  return entries;
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
    if (!prev || ePeak < pPeak || (ePeak === pPeak && eRank < pRank)) {
      map.set(key, e);
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Main scrape loop
// ---------------------------------------------------------------------------
async function scrape() {
  const dates = [];
  for (let year = yearMin; year <= yearMax; year++) {
    dates.push(...quarterDates(year));
  }

  if (isDryRun) {
    // Just sample 2 dates
    dates.length = 2;
    console.log('[SwedishChartScraper] DRY RUN — will not write output');
  }

  console.log(`[SwedishChartScraper] Scraping ${yearMin}–${yearMax}, ${dates.length} dates, delay: ${delayMs}ms`);

  const allEntries = [];
  let totalRequests = 0;
  let totalParsed = 0;
  let totalErrors = 0;

  for (const dateStr of dates) {
    const url = `https://www.swedishcharts.com/weekchart.asp?cat=s&date=${dateStr}`;

    if (totalRequests > 0) await sleep(delayMs);

    try {
      const resp = await axios.get(url, { headers: HEADERS, timeout: 15000, decompress: false });
      totalRequests++;

      if (resp.status !== 200) {
        console.warn(`[SwedishChartScraper] ${dateStr}: HTTP ${resp.status}`);
        totalErrors++;
        continue;
      }

      const entries = parseChartPage(resp.data, dateStr);
      if (entries.length === 0) {
        console.log(`[SwedishChartScraper] ${dateStr}: 0 entries (date may not exist for this period)`);
      } else {
        allEntries.push(...entries);
        totalParsed += entries.length;
        console.log(`[SwedishChartScraper] ${dateStr}: ${entries.length} entries → total ${totalParsed}`);
      }
    } catch (e) {
      console.warn(`[SwedishChartScraper] ${dateStr}: ${e.message}`);
      totalErrors++;
      totalRequests++;
    }
  }

  console.log(`\n[SwedishChartScraper] Done — ${totalRequests} requests, ${totalParsed} raw entries, ${totalErrors} errors`);

  const deduped = dedupeByBestRank(allEntries);
  console.log(`[SwedishChartScraper] After dedup: ${deduped.length} unique tracks`);

  deduped.sort((a, b) => {
    if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
    return (a.rank || 9999) - (b.rank || 9999);
  });

  if (isDryRun) {
    console.log('\n[SwedishChartScraper] Sample (first 10):');
    console.log(JSON.stringify(deduped.slice(0, 10), null, 2));
    return;
  }

  let finalEntries = deduped;
  if (isMerge && fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const merged = dedupeByBestRank([...existing, ...deduped]);
      console.log(`[SwedishChartScraper] Merged: ${existing.length} + ${deduped.length} → ${merged.length} unique tracks`);
      finalEntries = merged;
    } catch (e) {
      console.warn('[SwedishChartScraper] Could not merge with existing file:', e.message);
    }
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalEntries, null, 2), 'utf-8');
  console.log(`[SwedishChartScraper] Wrote ${finalEntries.length} entries to ${outputPath}`);
  console.log('[SwedishChartScraper] Commit this file to the repo so the backend can use it without scraping at runtime.');
}

scrape().catch((e) => {
  console.error('[SwedishChartScraper] Fatal error:', e.message);
  process.exit(1);
});
