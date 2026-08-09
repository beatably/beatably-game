# Beatably — 30-day organic growth campaign

Campaign window: 9 August–7 September 2026  
Budget: SEK 0 unless explicitly approved  
Primary markets: Sweden and English-speaking markets  
Primary conversion: a game session starts  
Secondary conversions: a completed game, a returning player, and an App Store visit/install where measurable

## Execution log

### 2026-08-09 — measurement deployed and Product Hunt activated

- Commit `b8b9d9b` was pushed to `main`; Netlify and Render deployed the campaign-attribution update.
- Production verification passed:
  - `https://beatably-backend.onrender.com/healthz` returned `{"ok":true}` after the Render process restarted.
  - The published landing-page CTA preserved `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` when moving from `beatably.app` to `play.beatably.app`.
  - A labeled solo QA session was started with player name `Campaign QA` and source `codex_verification`.
  - Usage Analytics displayed the session in room `5196` with client `web`, campaign `codex_verification`, and start time 2026-08-09 17:34:49 local time.
- Product Hunt's launch URL was changed and saved as:
  - `https://beatably.app/?utm_source=producthunt&utm_medium=launch&utm_campaign=organic_launch_2026&utm_content=product_page`
- A maker reply was published to Zvonimir Sabljic. A second reply was briefly placed in the wrong thread, detected immediately, and deleted.
- After the discussion reloaded, Product Hunt reported three comments and no longer exposed the earlier Camille Gordon or Nathan Bryant comments. Their prepared replies were not posted as standalone comments because that would misrepresent the conversation.

The `codex_verification` pageviews and incomplete QA session must be excluded when evaluating real campaign performance.

### 2026-08-09 — batch 2 activated

- Commit `7e4ff23` was pushed to `main`; Netlify and Render deployed explicit CTA conversion measurement.
- Production verification passed: a labeled `codex_verification` click on the hero's browser-play CTA appeared in Usage Analytics as `codex_verification → play_browser_hero`, while pageviews remained separate. This QA click and its two pageviews must be excluded from campaign results.
- Four personalized creator-outreach emails were sent individually to MusikQuizStockholm, Debaser/Stockholms Musikquiz, Uncas Quiz, and Moumo. Gmail accepted all four sends at 2026-08-09 17:49 CEST. Replies and attributed sessions will be checked after 48 hours; no follow-up before 14 August.
- Reddit publication is ready but could not be submitted because the browser has no signed-in Reddit session and Reddit presented a human verification/login step.
- The Vinyl Music Quiz Instagram DM is ready but could not be sent because the browser has no signed-in Instagram session.

## Positioning

**English:** Beatably is a free multiplayer music timeline party game. Hear a song, guess when it was released, and place it in chronological order. First to fill their timeline wins. Play in the browser or on iPhone; no account is required.

**Swedish:** Beatably är ett gratis musikspel för vänner. Lyssna på en låt, gissa när den släpptes och placera den rätt på tidslinjen. Först att fylla sin tidslinje vinner. Spela direkt i webbläsaren eller på iPhone, utan konto.

Core promise: **Turn music history into a multiplayer party game.**

## Baseline — captured 9 August 2026

Source: Beatably Admin → Usage Analytics. The 30-day range is the primary baseline.

| Metric | Last 24 hours | Last 7 days | Last 30 days | All time |
|---|---:|---:|---:|---:|
| Website views | 5 | 41 | 179 | 179 |
| Unique website visitors | 5 | 19 | 94 | 94 |
| Landing-page visitors (unique) | 4 | 13 | 75 | 75 |
| Game-page visitors (unique) | 1 | 6 | 19 | 19 |
| Game sessions started | 11 | 35 | 225 | 322 |
| Unique players | 6 | 17 | 92 | 208 |
| Games completed | 5 | 22 | 165 | 181 |
| Completion rate | 45% | 63% | 73% | 56% |
| Average duration | 0:24 | 3:09 | 2:42 | 4:48 |
| Average rounds | 1 | 4 | 5 | 6 |
| Total errors | 0 | 0 | 0 | 0 |

### 30-day session composition

- 225 sessions total.
- Client data: 143 iOS, 6 web, 1 mixed, and 75 unknown. Among the 150 sessions with a known client, 95.3% were iOS, 4.0% web, and 0.7% mixed.
- 25 sessions (11.1%) had more than one player.
- 92 distinct displayed player names appeared. 41 (44.6%) appeared in more than one session. This is an approximate returning-player signal, not an account-based retention metric.
- Website referrers: direct 154, beatably.app 16, Facebook 3, Product Hunt 2, Google 2, Lemmy 1, and Google app search 1.
- No UTM sources were recorded. Every new campaign link must therefore use UTM parameters.

### Measurement caveats

- App sessions are included in game-session counts, so `games started ÷ game-page visitors` is not a web conversion rate. The apparently high funnel percentage is a cross-client instrumentation artifact.
- “Unique players” and the returning-player estimate rely on displayed names and may merge different people or split the same person using different names.
- Website analytics appear to have begun within the last 30 days because the 30-day and all-time website totals are identical.
- Unknown client values should be reduced in future instrumentation; campaign decisions should use known-client proportions only.

## Tracking convention

Campaign name: `organic_launch_2026`

| Channel | Primary tracked URL |
|---|---|
| Product Hunt | `https://beatably.app/?utm_source=producthunt&utm_medium=launch&utm_campaign=organic_launch_2026` |
| TikTok | `https://beatably.app/?utm_source=tiktok&utm_medium=social_video&utm_campaign=organic_launch_2026` |
| Instagram Reels | `https://beatably.app/?utm_source=instagram&utm_medium=social_video&utm_campaign=organic_launch_2026` |
| YouTube Shorts/profile | `https://beatably.app/?utm_source=youtube&utm_medium=social_video&utm_campaign=organic_launch_2026` |
| Reddit | `https://beatably.app/?utm_source=reddit&utm_medium=community&utm_campaign=organic_launch_2026` |
| Creator outreach | `https://beatably.app/?utm_source=creator_outreach&utm_medium=referral&utm_campaign=organic_launch_2026&utm_content=CREATOR_NAME` |
| AlternativeTo | `https://beatably.app/?utm_source=alternativeto&utm_medium=directory&utm_campaign=organic_launch_2026` |

For individual posts, add a short `utm_content` value such as `guess_the_year_v1`, `party_game_v1`, or a creator handle. Never reuse one `utm_content` value for two different creatives.

### Attribution implementation status

A measurement improvement is live in production. It preserves UTM parameters when a visitor moves from `beatably.app` to `play.beatably.app`, sends the campaign with the web socket connection, stores the host's campaign on the resulting game session, and shows game-session source in Admin and CSV exports. Existing untagged sessions remain `unattributed`.

Production verification completed on 9 August 2026: a labeled `codex_verification` visit preserved all four UTM fields across both domains and appeared on the resulting game-session row in Usage Analytics. That QA traffic must be excluded from campaign results.

The second measurement improvement is also live: explicit App Store and browser-play CTA clicks are recorded by campaign source and page placement without inflating pageview totals. The frontend build passes, all 37 backend tests pass, and a production browser-play click was attributed to both source and placement in Usage Analytics.

## Channel tests

### 1. Directory discovery — AlternativeTo

Status checked on 9 August 2026: submitted and still awaiting editorial review. AlternativeTo says only the submitter can see the page until approval and warns that review can take a few months. Beatably is linked to HITSTER, WhatTheHit, and SongPop as alternatives. No queue-priority action has been purchased or requested.

Hypothesis: people already searching for music-trivia and music-party products will have higher intent than general social traffic.

Success gate for the first seven days after approval: at least 10 referred visitors, at least 3 game starts, and at least 1 completed game. If the listing URL can be edited after approval, replace the destination with the tracked AlternativeTo URL.

### 2. Product Hunt launch

Status: already launched on 28 July 2026. This is Beatably's first Product Hunt launch. The 9 August baseline was 3 counted launch points, 4 comments, position #560, 9 followers, and 2 Product Hunt referrals in Beatably Admin. Product Hunt later displayed 4 upvotes. After the maker reply was published and the discussion reloaded, the page exposed only 3 comments; the missing comments were not answered out of context.

The launch did not meet the original success gate and should be treated as a completed low-volume channel test, not as an upcoming launch. Product Hunt asks makers to wait at least six months before relaunching the same product, with a significant update required, so no relaunch should be attempted before 28 January 2027.

Result: low acquisition volume but useful qualitative feedback. Commenters specifically praised the instant browser experience, absence of a signup wall, and the challenge-and-steal mechanic. One commenter requested themed genre/decade packs. These signals strengthen `instant/no account` and `challenge and steal` as future copy angles.

Measurement limitation for the historical launch traffic: the original Product Hunt destination used `?ref=producthunt`, so the first 2 referrals cannot be tied to game starts.

The launch destination is now saved as `https://beatably.app/?utm_source=producthunt&utm_medium=launch&utm_campaign=organic_launch_2026&utm_content=product_page`. Future Product Hunt visits and resulting web game starts can therefore be evaluated separately.

Current public fields:

- Name: `Beatably`
- Tagline: `Hear it. Place it. Steal it.`
- Description: `Beatably is the free multiplayer music timeline party game. Hear a song, guess when it dropped, and build your timeline. Challenge your friends' picks and steal their cards. First to fill their timeline wins. Free on iOS and in your browser — no account needed.`
- Current primary URL: `https://beatably.app/?ref=producthunt`
- Proposed measured URL: tracked Product Hunt URL above
- App Store URL: `https://apps.apple.com/app/beatably/id6788660791`
- Current gallery: one image; future significant update should use `frontend/public/img/landing/og-image.png`, the five images in `ios/screenshots/appstore/6.9/`, and the finished gameplay video

Current maker comment:

> Hi Product Hunt! I built Beatably because music games are best when everyone can jump in instantly. No account or shared song sheets: each player joins from their own phone, hears a 30-second preview, and places it on a growing timeline. The twist is coins—you earn them by naming the song, then spend them to skip or challenge and steal a misplaced card. I’d love feedback on the challenge-and-steal mechanic and which decades you want more of. It’s free on iOS and the web.

Prepared engagement actions, requiring approval before posting:

- Reply to the three external commenters rather than leaving them unread.
- Ask the themed-pack commenter which first pack they would choose: 80s, 90s, Swedish hits, or movie soundtracks.
- Publish one Product Hunt forum update only if it provides new value, for example a short post asking followers to choose the first themed pack. Do not frame this as a relaunch.

Prepared replies:

> Thanks, Zvonimir — I appreciate the kind words. The challenge-and-steal part is the piece I’m most excited to keep refining because it turns a simple timeline guess into a real multiplayer moment.

> Thanks, Camille — instant play and no signup wall were two non-negotiables, so it’s great to hear that came through. I’m especially glad the challenge-and-steal mechanic added tension rather than friction.

> Thanks, Nathan — themed packs are a strong next step. If you could choose the first one, which would you actually play with friends: 80s, 90s, Swedish hits, or movie soundtracks?

Prepared Product Hunt forum post:

> **Which themed music pack should Beatably add first?**
>
> The most useful feedback from Beatably’s first launch was a request for packs that make it easier to match a group’s taste. Beatably currently mixes decades and genres, but I’m considering a more focused first pack: **80s**, **90s**, **Swedish hits**, or **movie soundtracks**.
>
> Which one would make you start a game with friends—and is there a better theme I’m missing?

### 3. Short-form gameplay video

Status: a 27.7-second, 1080×1920 H.264 master already exists at `e2e/promo/out/beatably-promo-9x16.mp4`, with a matching poster. It is suitable as the master for TikTok, Instagram Reels, and YouTube Shorts.

The complete first-publication packet, including platform-specific captions, campaign links, metrics, and pre-publication checks, is in `docs/marketing-first-video-distribution.md`. No confirmed Beatably-owned Instagram, TikTok, or YouTube account was discoverable from the website, repository, or targeted public search as of 2026-08-09, so account ownership must be confirmed before publishing.

Hypothesis: the “guess the year” interaction is understandable without explanation and creates comments before clicks.

Test three hooks using the same gameplay body:

1. `When did this song come out?`
2. `Think you know music better than your friends?`
3. `The party game that turns every song into an argument.`

English caption:

> Hear the song. Guess the year. Place it on the timeline. Then defend your answer from your friends. 🎵 Beatably is free in your browser and on iPhone. Link in bio. #MusicQuiz #PartyGame #MusicTrivia #IndieGame

Swedish caption:

> När släpptes låten egentligen? Lyssna, gissa året och placera den på tidslinjen innan kompisarna utmanar dig. 🎵 Beatably är gratis i webbläsaren och på iPhone. Länk i bio. #Musikquiz #Sällskapsspel #Musikspel #SvenskApp

Success gate per platform after seven days: 1,000 views or 5% engagement, plus at least 10 profile visits and 3 tracked game starts. YouTube Shorts descriptions do not provide clickable external URLs, so the tracked link must be placed in the channel profile and the caption should say “link in profile.”

### 4. Community post — Reddit (controlled test)

Status: `r/WebGames` is selected for the first controlled test and the complete rule-aware publication packet is prepared in `docs/marketing-reddit-webgames.md`. A live rule and account-standing check is still required immediately before posting.

Reddit permits relevant promotional content in some communities, but repeated unsolicited promotion and mass-posting are prohibited. Only one tailored community post will be tested initially, with transparent maker disclosure and no cross-post blast.

Do not use `r/iOSGaming` for the initial test: its moderators paused all developer self-promotion on 11 July 2026 while they reevaluate the policy. Do not use `r/playmygame` for the first test either: its active Rule 2 enforcement expects substantive feedback on at least three other community games before a developer posts their own. `r/IndieGames` remains a possible later test, but promotion and feedback must be kept clearly separate there.

Title draft for `r/WebGames`:

> [HTML5/Music] Beatably — a free multiplayer game about placing songs on a timeline

Body draft:

> Hi r/WebGames — I’m the maker of Beatably, a free browser game built for the moment when everyone is certain they know when a song came out.
>
> One player starts a room and shares the code. Everyone hears the same song, then places it where they think it belongs on their timeline. Other players can challenge the placement, so a confident wrong answer can become the best part of the round.
>
> It works on mobile and desktop, needs no download or account, and is free to play:
>
> **https://beatably.app/?utm_source=reddit&utm_medium=community&utm_campaign=organic_launch_2026&utm_content=webgames_intro**
>
> I’m the developer, and I’ll be here to answer questions. If you try it, the one thing I’m most curious about is whether starting and joining the first multiplayer room feels clear without someone explaining it beside you.

Success gate after 72 hours: the post remains live, receives at least 10 meaningful comments or votes, drives 20 visitors, and produces 5 game starts.

### 5. Personal creator outreach

Status: a 16-target researched shortlist, personalized opening angles, tracked IDs, and two message templates are prepared in `docs/marketing-outreach-prospects.md`. The first batch prioritizes Swedish music-quiz hosts because each trial can expose several real groups to the game.

Message draft:

> Hi [Name] — I made Beatably, a free multiplayer game where friends hear a song, guess its release year, and place it on a shared timeline. Your [specific video/post] made me think it could fit your audience. Would you be open to trying one round? No paid brief and no obligation to post—I’d mainly value your honest reaction. Here is a private tracked link: [LINK].

Success gate after the first 15 personal messages: 5 replies, 3 playtests, and 1 organic mention. Each message must contain a real reference to the creator's work; no bulk automation.

## 30-day execution schedule

The authoritative weekly measurement template is `docs/marketing-weekly-scorecard.md`. It fixes checkpoint dates, QA exclusions, channel and creative ledgers, derived metrics, and continuation/pause rules before results are known.

### Week 1 — baseline and first distribution

- Preserve the baseline above and take the same admin snapshot every Sunday.
- Confirm AlternativeTo review status and add a tracked destination if editing is allowed.
- Record Product Hunt as a completed low-volume test; prepare comment replies and one useful forum update for approval.
- Publish the first short-form video on one owned account after approval; wait 48 hours before adapting the hook.
- Select one relevant subreddit, read its current rules, and prepare a final community-specific version.

### Week 2 — launch and outreach

- If approved, update the existing Product Hunt destination with a tracked URL and answer the three existing comments.
- Publish hook variant 2 on the best available short-video platform.
- Research 15 micro-creators and prepare individualized outreach for approval.
- Compare sessions and completions by UTM source and content.

### Week 3 — double down on evidence

- Keep only channels that meet at least one success gate or show improving conversion.
- Produce hook variant 3 using the strongest opening frame and caption language.
- Send the approved creator messages in two batches and follow up once after five days only if relevant.
- Improve the landing CTA or first-game explanation if traffic arrives but game starts do not.

### Week 4 — retention and next cycle

- Repost only a materially new creative, never the same promotional text.
- Ask active players for one specific piece of feedback and one App Store review at a natural post-game moment.
- Compare the full 30-day cohort with this baseline.
- Document winning channel, winning hook, cost (still SEK 0 unless approved), conversion, completion, and returning-player signal.
- Produce the next 30-day plan using observed results.

## Weekly scorecard

| Week ending | Channel / creative | Views or impressions | Tracked visitors | Game starts | Completed games | Completion | Returning-player signal | Notes / decision |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Baseline 9 Aug | No tagged campaigns | — | 0 tagged | 225 total / 30d | 165 total / 30d | 73% | 41 of 92 names repeated | Start UTM discipline |
| Product Hunt 28 Jul | Existing launch | 3 counted points; position #560; 4 comments | 2 referrals | Not attributable | Not attributable | — | — | Low volume; instant/no-account and challenge/steal copy validated qualitatively |
| 16 Aug |  |  |  |  |  |  |  |  |
| 23 Aug |  |  |  |  |  |  |  |  |
| 30 Aug |  |  |  |  |  |  |  |  |
| 7 Sep |  |  |  |  |  |  |  |  |

## Approval queue

The campaign can be prepared autonomously, but approval is required immediately before each public post, external message batch, new account creation, or any spend.

1. Product Hunt: approve the tracked destination edit and three comment replies; do not create a new launch.
2. Short-form video: approve platform/account and first caption before upload.
3. Reddit: approve the final subreddit-specific post after its rules are checked.
4. Creator outreach: approve the first personalized batch before messages are sent.

## Current authoritative references

- Product Hunt posting guide: https://help.producthunt.com/en/articles/479557-how-to-post-a-product
- Product Hunt featuring guidance: https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines
- Reddit spam policy: https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam
- r/iOSGaming self-promotion pause: https://www.reddit.com/r/iosgaming/comments/1ut9kgf/attention_saturday_selfpromotion_is_paused_for_now/
- YouTube link behavior: https://support.google.com/youtube/answer/13748639?hl=en
