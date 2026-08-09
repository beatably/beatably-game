# Beatably — weekly organic growth scorecard

Campaign: `organic_launch_2026`  
Window: 2026-08-09 through 2026-09-07  
Budget ceiling: SEK 0 unless explicitly approved

## Measurement calendar

| Checkpoint | Snapshot date | Comparison window | Purpose |
|---|---|---|---|
| Day 0 | 2026-08-09 | Baseline captured before tracked distribution | Establish starting state |
| Day 7 | 2026-08-16 | 2026-08-09 through 2026-08-15 | First channel signal and obvious funnel faults |
| Day 14 | 2026-08-23 | 2026-08-16 through 2026-08-22 plus cumulative | Select messages and channels to continue |
| Day 21 | 2026-08-30 | 2026-08-23 through 2026-08-29 plus cumulative | Concentrate effort on demonstrated winners |
| Day 30 | 2026-09-07 | Full campaign window | Final learning report and next 30-day plan |

Use Europe/Stockholm dates consistently. For each weekly window, use an inclusive start at 00:00 and an exclusive end at 00:00 the following day when the admin filter supports timestamps.

## Mandatory exclusions and caveats

- Exclude all records whose source is `codex_verification`.
- Exclude the incomplete QA session named `Campaign QA`, room `5196`, started 2026-08-09 17:34:49 local time.
- Do not compare total game starts directly with unique web visitors as if they formed one web-only funnel; iOS sessions are included in game totals.
- Treat displayed-name recurrence as an approximate retention indicator, not account-level retention.
- Legacy traffic without UTM data remains `unattributed`; do not retroactively assign it to Product Hunt or another source.
- App Store clicks are a measurable handoff, not verified installs. Installs require App Store Connect campaign or product-page data when available.

## Global product health

Copy the same fields from Beatably Admin → Usage Analytics at every checkpoint.

| Metric | Baseline: 30 days to Aug 9 | Day 7 | Day 14 | Day 21 | Day 30 |
|---|---:|---:|---:|---:|---:|
| Website views | 179 | — | — | — | — |
| Unique website visitors | 94 | — | — | — | — |
| Unique landing visitors | 75 | — | — | — | — |
| Unique game-page visitors | 19 | — | — | — | — |
| Game sessions started | 225 | — | — | — | — |
| Unique players | 92 | — | — | — | — |
| Games completed | 165 | — | — | — | — |
| Completion rate | 73% | — | — | — | — |
| Average duration | 2:42 | — | — | — | — |
| Average rounds | 5 | — | — | — | — |
| Multiplayer sessions | 25 | — | — | — | — |
| Approximate repeat-name rate | 44.6% | — | — | — | — |
| App Store CTA clicks | Not instrumented | — | — | — | — |
| Browser-play CTA clicks | Not instrumented | — | — | — | — |

For weekly values, record both the isolated seven-day window and the cumulative campaign total in the checkpoint notes. The baseline column is context, not a denominator for every weekly percentage.

## Channel scorecard

Record source-attributed outcomes only. A dash means not launched; zero means launched and measured with no result.

| Channel / source | Status | Public action date | Views or impressions | Engagement | Attributed visitors | CTA clicks | Game starts | Unique players | Completed games | Replies / qualitative signal | Decision |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Product Hunt / `producthunt` | Active historical launch; tracked link saved | 2026-08-09 tracking update | — | 4 upvotes at latest verified public state | Baseline 2 historical referrals, untagged | — | — | — | — | Challenge/steal and instant play praised | Measure new tracked traffic |
| AlternativeTo / `alternativeto` | Awaiting editorial review; page owner-only until approval | — | — | — | — | — | — | — | — | 3 alternatives attached | Recheck status weekly; do not count as a live channel yet |
| Reddit / `reddit` | Prepared, not posted | — | — | — | — | — | — | — | — | — | Await approval and login |
| Creator outreach / `creator_outreach` | Five messages prepared, not sent | — | n/a | n/a | — | — | — | — | — | — | Await approval |
| Instagram / `instagram` | Material prepared; account unverified | — | — | — | — | — | — | — | — | — | Confirm owned account |
| TikTok / `tiktok` | Material prepared; account unverified | — | — | — | — | — | — | — | — | — | Confirm owned account |
| YouTube / `youtube` | Material prepared; account unverified | — | — | — | — | — | — | — | — | — | Confirm owned account |

## Per-creative and per-recipient ledger

Use `utm_content` as the row key. Never combine different creative variants in one row.

| Source | `utm_content` | Asset / recipient | First live or sent | Visitors | App Store clicks | Browser-play clicks | Game starts | Completions | Replies / comments | Cost | Notes |
|---|---|---|---|---:|---:|---:|---:|---:|---|---:|---|
| producthunt | `product_page` | Product Hunt launch link | 2026-08-09 | — | — | — | — | — | One maker reply published | SEK 0 | Historical referrals are not included |
| reddit | `webgames_intro` | r/WebGames introduction | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| instagram | `guess_the_year_v1` | First Reel | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| tiktok | `guess_the_year_v1` | First TikTok | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| youtube | `guess_the_year_v1` | First Short | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| creator_outreach | `musikquizstockholm` | MusikQuizStockholm | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| creator_outreach | `vinylmusicquiz` | Vinyl Music Quiz | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| creator_outreach | `stockholmsmusikquiz` | Debaser / Stockholms Musikquiz | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| creator_outreach | `uncasquiz` | Uncas Quiz | — | — | — | — | — | — | — | SEK 0 | Prepared only |
| creator_outreach | `moumo` | Moumo | — | — | — | — | — | — | — | SEK 0 | Prepared only |

## Derived metrics

Calculate only when the denominator is known and non-zero.

- Landing-to-browser-click rate = browser-play CTA clicks ÷ unique landing visitors.
- Landing-to-App-Store-click rate = App Store CTA clicks ÷ unique landing visitors.
- Browser-click-to-start rate = attributed web game starts ÷ browser-play CTA clicks.
- Start-to-completion rate = completed attributed games ÷ attributed game starts.
- Outreach reply rate = human replies ÷ delivered messages.
- Outreach playtest rate = recipients with an attributed game start or confirmed playtest ÷ delivered messages.
- Social engagement rate = platform-defined engagements ÷ views or reach; record the platform definition in notes.
- Cost per start remains SEK 0 for organic work; track time qualitatively rather than inventing a monetary cost.

Do not calculate a rate by mixing platform-reported impressions with Beatably visitors unless the numerator and denominator refer to the same source and date window.

## Decision rules

### Continue and expand

A channel qualifies for more effort when, within its first seven measured days, it achieves at least one of:

- 5 or more attributed game starts with at least 40% completion;
- 3 or more attributed game starts plus strong intent, such as a venue agreeing to a playtest;
- 1,000 short-video views or 5% engagement plus at least 3 attributed starts;
- 20 attributed visitors and at least 10% progressing to a browser-play or App Store click.

### Iterate the message or CTA

- Good reach but few profile/website visits: change the hook or audience targeting.
- Good visitor volume but weak CTA clicks: change landing-page promise or button context.
- Good browser clicks but few starts: inspect first-game loading, room creation, and name-entry friction.
- Starts but weak completion: inspect song availability, rules clarity, session length, and client-specific problems.
- Outreach replies but no playtests: reduce the requested commitment or provide a clearer 60-second demonstration.

### Pause

Pause a channel when two materially different tests both fail to produce meaningful engagement or attributed starts, or when the community rejects the promotional format. Do not respond to weak results by increasing unsolicited volume.

## Weekly checkpoint procedure

1. Open Beatably Admin → Usage Analytics and set the exact weekly date window.
2. Export or transcribe website, CTA, source, client, session, and completion figures.
3. Exclude QA records and note unattributed traffic separately.
4. Open each live platform and record its native reach and engagement metrics.
5. Check AlternativeTo review status and every outreach reply thread.
6. Populate the channel and creative ledgers above.
7. Write three short conclusions: best acquisition source, best message signal, and largest funnel loss.
8. Choose no more than two changes for the next week so results remain interpretable.
9. Obtain approval immediately before the next public post or external message batch.

## Checkpoint notes

### Day 7 — 2026-08-16

- Best acquisition source: —
- Best message or qualitative signal: —
- Largest funnel loss: —
- Changes approved for week 2: —

### Day 14 — 2026-08-23

- Best acquisition source: —
- Best message or qualitative signal: —
- Largest funnel loss: —
- Changes approved for week 3: —

### Day 21 — 2026-08-30

- Best acquisition source: —
- Best message or qualitative signal: —
- Largest funnel loss: —
- Changes approved for week 4: —

### Day 30 — 2026-09-07

- Winning channel: —
- Winning message: —
- Main product/funnel learning: —
- Next 30-day focus: —
