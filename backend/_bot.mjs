#!/usr/bin/env node
// Minimal lobby bot: joins a room and stays connected so the host can start.
// Usage: node backend/_bot.mjs <roomCode> [playerName]
import { io } from 'socket.io-client';

const [, , roomCode, name = 'Bot'] = process.argv;
if (!roomCode) { console.error('Usage: _bot.mjs <roomCode> [name]'); process.exit(1); }

const socket = io('http://127.0.0.1:3001', { transports: ['websocket'] });

socket.on('connect', () => {
    console.log(`[bot] connected, joining ${roomCode} as ${name}`);
    socket.emit('join_lobby', { name, code: roomCode }, (res) => {
        if (res?.error) { console.error('[bot] join failed:', res.error); process.exit(1); }
        console.log('[bot] joined lobby');
    });
});

socket.on('game_started', () => console.log('[bot] game started'));
socket.on('game_update', (state) => {
    const phase = state?.phase;
    if (phase === 'player-turn' && state?.currentPlayerId !== socket.id) return;
    // Bot places at index 0 on its turn, skips everything else
    if (phase === 'player-turn' && state?.currentPlayerId === socket.id) {
        setTimeout(() => socket.emit('place_card', { index: 0 }), 800);
    }
    if (phase === 'song-guess' && state?.currentPlayerId === socket.id) {
        socket.emit('skip_song_guess');
    }
    if (phase === 'challenge-window') {
        socket.emit('skip_challenge');
    }
    if (phase === 'reveal' && state?.isCreator === false) return;
});

socket.on('disconnect', () => { console.log('[bot] disconnected'); process.exit(0); });
socket.on('connect_error', (e) => { console.error('[bot] error:', e.message); });

// Keep alive
process.on('SIGTERM', () => socket.disconnect());
process.on('SIGINT',  () => socket.disconnect());
