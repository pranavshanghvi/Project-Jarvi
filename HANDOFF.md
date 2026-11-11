# Jarvi food logger — handoff

Last updated 2026-11-11. Read this with `CLAUDE.md` (the "never reach a paid AI" rule) and
Pranav's global preferences before doing anything.

## What this is

A food and calorie tracker: photograph a meal, get the full nutrient profile, and compare
calories eaten against calories burned (from Apple Watch, via Apple Health).

Lives in `app/` (the iPhone app) and `server/` (the photo-reading service). The `tutor/` folder
is an unrelated project in the same repository.

## What is done

| # | Piece | State |
|---|---|---|
| 1 | Photo logging, daily log, dashboard | Built in July, live on the web |
| 2 | Calories burned from Apple Health | Verified with sample data |
| 3 | Net calories, day / week / month | Built; screen verified |
| 4 | Photos from Ray-Ban Meta glasses | Built; picker verified |
| 5 | Photo reading on free AI only | Live; tested with a real photo |
| 6 | App runs in iPhone simulator | Verified (iPhone 17 Pro) |

Commits: `4015d36` (server moved off paid Anthropic), `f3e600b` (health, net calories, glasses).
Both pushed to `main`.

## What is in progress

Nothing half-finished. The photo reader went live on 2026-11-11:

- Keys come from a **Cloudflare Workers AI** account under a separate Gmail Pranav already owns,
  not the one Snaptly uses. (The address is deliberately not written in this file.) Both values
  (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) are stored on the `jarvi-server` Vercel
  project. Free daily allowance; it errors rather than charges when the allowance runs out.
- Mistral was tried first and is a dead end: a new Mistral account is offered no free API plan
  (only a chat-only Free plan, paid plans, and pay-as-you-go). Do not send him back there.
- Tested live with a real pizza photo: four items identified, 15 to 23 seconds per photo.
  The first time limit (25s) was too tight and caused a one-minute outage after a slow answer;
  it is now 50s, with the server ceiling at 60s.
- Only one free service is configured. If Cloudflare has a bad day, photos queue for later.
  Optional backups, stored the same way: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`.

To store a value (he pastes it at the prompt, never in chat) and republish:

```bash
cd "$HOME/Claude Projects/Project-Jarvi/server" && vercel env add OPENROUTER_API_KEY production --sensitive --scope pranavshanghvi-1128s-projects
```

```bash
cd "$HOME/Claude Projects/Project-Jarvi/server" && vercel deploy --prod --yes --scope pranavshanghvi-1128s-projects
```

## Redesign: design shown, waiting for Pranav's go-ahead (2026-11-11)

Pranav said the app looks too basic and asked for an Oura-style redesign, then said
"show me the design first before you build anything". **No redesign code has been written.**
The clickable design (10 phone screens, sample data) is here:
https://claude.ai/artifact/6V3pne2vESiSGEyr4N9NNi (private to him). Source files for it are in
the session scratchpad, not in this repository; read the artifact to get them back.

**Look and feel, decided by him:** "use a glassy look like we did for snaptly". The design now
uses Snaptly's glass recipe (see `.glass`, `.glass-panel`, `.money-glass` in the Snaptly
project's `src/index.css`): see-through frosted cards with a bright top edge, soft teal and orange
colour washes behind the page, a floating glass tab bar, and teal glass for the main buttons.
In the real app this needs a blur component (`expo-blur`), which is not installed yet.

What he asked for, in his words, condensed:

| # | Ask | Screen in the design |
|---|---|---|
| 1 | Burn pulled in automatically from Watch/phone | Today, Calories burned |
| 2 | Food by photo from phone or glasses | Log a meal |
| 3 | Separate food page with the time eaten | Food log, One meal |
| 4 | Everything tappable to see detail | Every row and number |
| 5 | Cool, modern, like Oura; glassy like Snaptly | Dark glass, rings, two colours |
| 6 | History kept for years | History (week to all-time) |
| 7 | Profile questions up front (height, weight, DOB) | About you |
| 8 | Goals, and tracking against them | Your goal, ring on Today |
| 9 | Daily weight with a graph | Weight |
| 10 | Choice of chart style: line, bar, pie, Sankey | Chart style |

Things the build will need that the app does not have yet: bottom tab navigation, a meal detail
and edit screen (edit time, delete), Apple Health permission for workouts and body weight, a
profile and goals store, a weight log, long-range history queries, a look-and-feel file so
colours and type live in one place, and a chart-style switcher per tracking card (remembered per
card; only the styles that suit that card's data: see the Chart style screen). Food history lives only on the phone (and in its iPhone
backup); a cloud copy would need a sign-in and is his decision to make.

Also still unverified on his real phone: the fix that shrinks and converts iPhone photos before
sending (commit `9ee4d9c`). It is installed; he has not yet confirmed a photo was read.

## What is next

| # | Task | Needs Pranav? |
|---|---|---|
| 1 | Steadier calorie estimates (see below) | No |
| 3 | Install on his actual iPhone | Yes, his Apple ID in Xcode |
| 4 | Republish the web version with new screens | No |
| 7 | Direct glasses capture (Meta developer kit) | Later, optional |

**Estimates swing between runs.** The same pizza photo came back as 1,780 calories once and 581
another time: the items were identified the same, the portion sizes were guessed differently.
The usual cure (asking the AI for its most likely answer every time, the "temperature" setting)
is not available because the copied router does not pass that setting through and must not be
edited here. Fixing it means changing the router in the Snaptly repository and re-copying it,
or tightening the instructions with portion reference points. Until then the sliders on the
confirm screen are how a wrong portion gets corrected.

## Decisions made

- **Free AI only, forever.** Photo reading goes through a copy of the Snaptly model router with
  the paid route switched off. If every free service is out, the photo is saved and retried later.
- **Separate from Snaptly.** Own Vercel projects (`jarvi-server`, `jarvi-web`) inside the same
  Vercel login, own AI accounts under a separate Gmail. The only shared thing is one copied
  code file (`server/lib/modelRouter.js`), which has no live link back. Never edit that file;
  re-copy it and update `server/lib/PROVENANCE.md`.
- **Glasses photos come through the phone's photo library**, where the Meta AI app already puts
  them. No Meta developer account needed.
- **Net calories count only days with food logged**, so an unlogged day does not look like a
  huge deficit.
- **The name "Jarvi" is provisional.** Pranav said on 2026-11-11 he will probably change it.
  Renaming is cheap now. It gets costlier once the app is on his real phone, because the app's
  internal ID (`com.pranavshanghvi.jarvi`) cannot change without iOS treating it as a brand-new
  app and leaving the logged food behind. Raise this before the first real-phone install.
- **Design choices default to the recommended option** and get flagged afterwards, rather than
  stopping to ask.

## How to run it

The iPhone folder (`app/ios`) is generated, not saved in git. To rebuild from scratch:

```bash
cd "$HOME/Claude Projects/Project-Jarvi/app" && npx expo prebuild --platform ios --clean && npx expo run:ios --device "iPhone 17 Pro" --no-bundler
```

Then start the code server (keep it running):

```bash
cd "$HOME/Claude Projects/Project-Jarvi/app" && EXPO_PUBLIC_API_BASE_URL=https://jarvi-server.vercel.app npx expo start --dev-client --port 8081
```

Known traps, already handled:
- The space in "Claude Projects" breaks two build steps. `app/plugins/withSpaceSafeBuild.js`
  fixes it automatically on every rebuild.
- Package installs need `--legacy-peer-deps`.
- Expo packages must all be on matching versions (`npx expo install --fix`), or the app crashes
  at launch.

Tests: `cd app && npx jest` (38 pass) and `cd server && npx jest` (19 pass).

## Git state

- Branch `main`, up to date with GitHub apart from this file.
- `tutor/.gitignore` has an uncommitted change that is not ours. Leave it.
- `stash@{0}` holds a half-finished coloured-ring dashboard change from July. The ring drawing
  file itself was never saved, so the rings need rebuilding rather than restoring.
