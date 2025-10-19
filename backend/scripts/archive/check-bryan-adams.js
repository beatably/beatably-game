#!/usr/bin/env node
const curatedDb = require('../curatedDb');
curatedDb.load();
const results = curatedDb.list({ q: 'Bryan Adams', limit: 20 });

console.log('='.repeat(60));
console.log('BRYAN ADAMS SONGS');
console.log('='.repeat(60));

results.items.forEach(s => {
  console.log(`\nTitle: ${s.title}`);
  console.log(`Origin (geography): ${s.geography}`);
  console.log(`Markets: [${s.markets.join(', ')}]`);
  console.log('-'.repeat(40));
});

const specificSong = results.items.find(s => 
  s.title.toLowerCase().includes('everything i do')
);

if (specificSong) {
  console.log('\n' + '='.repeat(60));
  console.log('SPECIFIC SONG: (Everything I Do) I Do It For You');
  console.log('='.repeat(60));
  console.log(`Origin: ${specificSong.geography} ${specificSong.geography === 'CA' ? '✅ FIXED (was SE, now CA - Canada)' : specificSong.geography === 'SE' ? '❌ Still SE' : ''}`);
  console.log(`Markets: [${specificSong.markets.join(', ')}]`);
}
