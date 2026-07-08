# Beatably — App Store Listing (draft)

Copy-paste fields for App Store Connect. Character limits noted in parentheses.

**Note:** App Store Connect splits these fields across two pages (left sidebar):
- **Version page** ("iOS App 1.0"): screenshots, promotional text, description, keywords,
  support/marketing URL, version, copyright, "What's New".
- **App Information page** (General): subtitle, category, age rating, privacy policy URL.

---

## App name (30)
`Beatably`

## Subtitle (30)
`The music timeline party game`

## Promotional text (170) — editable anytime without review
`Hear a song, guess when it dropped, and build your timeline. Challenge your friends' picks and steal their cards. First to fill their timeline wins!`

## Description (4000)
```
Beatably is the multiplayer music game where your ear for a hit decides who wins.

Listen to a track, then place it on your timeline — before or after the songs already there. Get the order right and the card is yours. First player to build a full timeline takes the game.

Think a rival placed a song in the wrong spot? Challenge it. Guess better than they did and you steal the card for yourself. Earn credits by naming the artist and title, then spend them to skip tricky songs or launch challenges.

• Fast, social rounds — perfect for parties, road trips, or a quick match with friends
• Play across decades of music, from classics to modern hits
• Simple to learn: tap where the song belongs on the timeline
• Challenge mechanic that rewards knowing your music history
• No account required — just pick a name and play

How well do you really know when the music happened? Start a game and find out.
```

## Keywords (100, comma-separated, no spaces after commas)
`music,trivia,party,timeline,songs,guess,multiplayer,quiz,friends,family,hits,year,name that tune`

## Category
- Primary: **Games** → **Trivia**
- Secondary: **Games** → **Music**

## URLs
- Support URL: `https://beatably.app`
- Marketing URL (optional): `https://beatably.app`
- Privacy Policy URL: `https://beatably.app/privacy.html`

## Age rating
Suggested: **4+** (no objectionable content).
Answer the App Store Connect questionnaire with "None" across the board — no violence,
profanity, mature themes, gambling, or user-generated content. (Player display names are
transient and not broadcast publicly, so this is not "user-generated content" in Apple's sense.)

## Copyright
`© 2026 Timothy Bjelkstam`

## Version info (first release)
- Version: `1.0`
- Build: `1`
- "What's New": `Initial release.`

---

## Screenshots
Preferred: upload the **6.9" set** (`ios/screenshots/appstore/6.9/`, 1320×2868) into the
**6.9" iPhone** slot. In ASC that slot may be under **"View All Sizes in Media Manager"** if
the version page defaults to showing the 6.5" box. The 6.9" set is the only required iPhone
size — ASC auto-scales it down for all smaller devices.

Fallback: if you'd rather use the 6.5" box shown by default, a resized set is at
`ios/screenshots/appstore/6.5/` (1284×2778) — fits that box exactly.

Order (same for both sets):
1. `1-landing.png` — brand / hero
2. `2-place-card.png` — placing a song on the timeline
3. `3-challenge.png` — the challenge window
4. `4-won-challenge.png` — winning a challenge
5. `5-correct.png` — correct-placement reveal

(iPad / Apple Watch screenshots only needed if you enable those platforms — iPhone-only is fine.)

## App Review notes (internal, for the reviewer)
```
Beatably is a multiplayer music timeline game. To test:
- Tap "Your name", enter any name, tap "Create Game" to host a room.
- Share the room code (or open a second device) to join and start a match.
- No login or account is required. Audio playback is host-only.
```
```
NOTE: If review requires a second player to see gameplay, mention that the game is
multiplayer and provide a second TestFlight/simulator instance, or point them to the
web version at https://beatably.app for reference.
```
