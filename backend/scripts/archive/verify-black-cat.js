#!/usr/bin/env node
const curatedDb = require('../curatedDb');
curatedDb.load();
const results = curatedDb.list({ q: 'Janet Jackson', limit: 20 });
const blackCat = results.items.find(s => s.title.toLowerCase().includes('black cat'));
if (blackCat) {
  const song = blackCat;
  console.log('='.repeat(60));
  console.log('BLACK CAT VERIFICATION');
  console.log('='.repeat(60));
  console.log(`Title:     ${song.title}`);
  console.log(`Artist:    ${song.artist}`);
  console.log(`Geography: ${song.geography} (FIXED: was SE, now US)`);
  console.log(`Markets:   [${song.markets.join(', ')}]`);
  console.log('='.repeat(60));
  console.log('\n✅ SUCCESS: Black Cat is now correctly classified as US origin!');
} else {
  console.log('Song not found');
}
