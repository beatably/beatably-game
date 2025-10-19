#!/usr/bin/env node
/**
 * Check Genres in Curated DB
 * Shows all unique genres in the curated songs database with their counts.
 *
 * Usage:
 *   node backend/scripts/check-genres.js
 * Optional flags:
 *   --file=backend/cache/curated-songs.json
 *   --detailed  (show multi-genre support details)
 */

const fs = require('fs');
const path = require('path');

function readArg(name, def) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const file = readArg('file', path.resolve(__dirname, '..', 'cache', 'curated-songs.json'));
const detailed = hasFlag('detailed');

function main() {
  try {
    if (!fs.existsSync(file)) {
      console.log(`❌ Database file not found: ${file}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(file, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.log(`❌ Failed to parse database: ${e.message}`);
      process.exit(1);
    }

    if (!Array.isArray(data)) {
      console.log('❌ Database is not an array');
      process.exit(1);
    }

    console.log(`\n📊 Genre Analysis for Curated Songs Database`);
    console.log(`Database: ${file}`);
    console.log(`Total Songs: ${data.length}\n`);

    // Collect genres from both single genre field and genres array
    const genreCounts = new Map();
    const multiGenreSongs = [];
    const noGenreSongs = [];

    for (const song of data) {
      let hasGenre = false;

      // Check genres[] array (new multi-genre support)
      if (Array.isArray(song.genres) && song.genres.length > 0) {
        hasGenre = true;
        if (song.genres.length > 1) {
          multiGenreSongs.push({
            title: song.title,
            artist: song.artist,
            genres: song.genres
          });
        }
        for (const genre of song.genres) {
          const g = String(genre || '').toLowerCase().trim();
          if (g) {
            genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
          }
        }
      }

      // Check single genre field (backward compatibility)
      if (song.genre && typeof song.genre === 'string') {
        const g = song.genre.toLowerCase().trim();
        if (g) {
          hasGenre = true;
          // Only count if not already counted from genres[]
          if (!Array.isArray(song.genres) || song.genres.length === 0) {
            genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
          }
        }
      }

      if (!hasGenre) {
        noGenreSongs.push({
          title: song.title,
          artist: song.artist,
          id: song.id
        });
      }
    }

    // Sort genres by count (descending)
    const sortedGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    // Display results
    console.log(`🎵 Genres Found: ${sortedGenres.length}\n`);

    console.log('Genre Breakdown:');
    console.log('─'.repeat(50));
    sortedGenres.forEach(([genre, count]) => {
      const percentage = ((count / data.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(count / (data.length / 30)));
      console.log(`${genre.padEnd(25)} ${String(count).padStart(4)} (${percentage.padStart(5)}%) ${bar}`);
    });

    // Summary stats
    console.log('\n' + '─'.repeat(50));
    console.log(`\n📈 Summary:`);
    console.log(`   Total Unique Genres: ${sortedGenres.length}`);
    console.log(`   Songs with Multi-Genres: ${multiGenreSongs.length}`);
    console.log(`   Songs without Genre: ${noGenreSongs.length}`);

    if (detailed) {
      if (multiGenreSongs.length > 0) {
        console.log(`\n🎭 Songs with Multiple Genres (${multiGenreSongs.length}):`);
        console.log('─'.repeat(50));
        multiGenreSongs.slice(0, 10).forEach(song => {
          console.log(`   ${song.title} - ${song.artist}`);
          console.log(`   Genres: ${song.genres.join(', ')}\n`);
        });
        if (multiGenreSongs.length > 10) {
          console.log(`   ... and ${multiGenreSongs.length - 10} more\n`);
        }
      }

      if (noGenreSongs.length > 0) {
        console.log(`\n⚠️  Songs Missing Genre (${noGenreSongs.length}):`);
        console.log('─'.repeat(50));
        noGenreSongs.slice(0, 10).forEach(song => {
          console.log(`   ${song.title} - ${song.artist} (${song.id})`);
        });
        if (noGenreSongs.length > 10) {
          console.log(`   ... and ${noGenreSongs.length - 10} more\n`);
        }
      }
    }

    console.log(`\n✅ Analysis complete!\n`);

  } catch (e) {
    console.log(`❌ Unexpected error: ${e.message}`);
    console.log(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
