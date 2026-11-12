# BiteLog (formerly Jarvi) food logger — handoff

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
| 1 | Photo logging, daily log, dashboard | Rebuilt in the Nov redesign |
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

## Redesign: built and installed on his iPhone (2026-11-11)

Pranav approved a ten-screen design ("build it") after asking for an Oura-style app with
Snaptly's glass look. It is built (commit `8be59f6`), checked screen by screen in the simulator,
and installed on his iPhone 16 Plus. The design it was built from:
https://claude.ai/artifact/6V3pne2vESiSGEyr4N9NNi (private to him).

| # | He asked for | Where it lives |
|---|---|---|
| 1 | Burn pulled in automatically from Watch | Today, Burned |
| 2 | Food by photo, from phone or glasses | The round + button |
| 3 | Food page with the time eaten | Food tab, One meal |
| 4 | Everything tappable for detail | Every row and number |
| 5 | Glassy look like Snaptly | `app/src/ui/kit.tsx`, `theme.ts` |
| 6 | History for years | History tab (week to all-time) |
| 7 | Profile questions up front | About you (first launch) |
| 8 | Goals and tracking against them | Your goal, ring on Today |
| 9 | Daily weight with a graph | Weight |
| 10 | Choice of chart style | Bars / Line / Pie / Flow per card |

**Added the same evening (commit `37be323`), installed on his phone as BiteLog:**

| # | He asked | What was built |
|---|---|---|
| 11 | Edit when the AI gets it wrong | Edit on every food: name and all ten numbers; add a missed food; type a meal in with no photo |
| 12 | Break sugar into added sugar | New `addedSugarG` field end to end; existing phones get the column added in place |
| 13 | Weight by photo | Photo of the scale fills the box for him to confirm; new `/api/read-scale` on the server |
| 14 | Rename to BiteLog | Visible name only. Internal ID is still `com.pranavshanghvi.jarvi` on purpose, so data carries over. The iPhone project is now `app/ios/BiteLog.xcworkspace`, scheme `BiteLog` |

The repository, folder, Vercel projects and storage keys still say "jarvi". That is deliberate:
nothing a person sees uses them, and renaming them would orphan his data or break links. Whether
"BiteLog" is free as an App Store name or trademark has NOT been checked.

**Sharing with other people (decided 2026-11-11): free web link plus an Apple Shortcut.**
He chose the web route over paying Apple $99 a year for TestFlight. The address to give people
is **https://mybitelog.vercel.app** (free; the same site also answers at jarvi-web.vercel.app).
`bitelog.vercel.app`, `bitelog-app.vercel.app` and `getbitelog.vercel.app` were already taken,
and `bitelog.vercel.app` is someone else's live app also called BiteLog: the name is NOT unique. Everything works there except what needs Apple
Health: verified in a browser with a real food photo, a typed-in meal, weight, goal and the
"?" explanations. Each person's data stays in their own browser.

- Calories burned on the web: an Apple Shortcut on the person's iPhone reads today's Active
  Energy from Health and opens `https://mybitelog.vercel.app/#active=NUMBER`. One number only
  (simplified 2026-11-11 after he found the two-number version too fiddly): the resting part is
  estimated from the person's profile. The app saves the figure and strips it from the address,
  and also picks it up when the page is already open. The five steps are on the Burned tab of the
  web version, with the address and a **Copy the address** button inside step 4. The receiving
  side is tested; the Shortcut itself is NOT built or tested (it can only be made on an iPhone).
  When Pranav has built it and has an iCloud share link, put the link in `SHORTCUT_LINK` in
  `app/src/screens/WebBurnCard.tsx` and everyone else gets a one-tap install.
- There is also a type-it-in card for the burn on the Burned tab.
- Web limits to be honest about: no workouts, no glasses import, burn only as fresh as the last
  time the Shortcut ran, and a browser stores only a few megabytes (photos are kept as tiny
  thumbnails; the oldest are dropped first if space runs out). Clearing browser data erases it.
- A person's web data is tied to the site's address. Settle the final address BEFORE sharing.
- To republish the web version: from `app/`, `npx expo export -p web --output-dir <new folder>`,
  then `python3 scripts/prepare-web.py <that folder> <another new folder>` (makes a clean copy
  and adds the share picture, icons and page description), then `vercel deploy --prod --yes` in
  the second folder with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` set for the `jarvi-web` project.
  Do not `vercel link` inside the build folder: it downloads a settings file.
- The server only accepts browser calls from that address (`server/lib/cors.ts`). A new address
  must be added there or in the `ALLOWED_ORIGINS` setting.
- Everyone shares one free AI allowance (roughly 200 photos a day in total).
- TestFlight remains the route if automatic Watch data for other people ever matters.

**Landing page and tour (2026-11-11).** A first-time visitor (web or phone) lands on
`WelcomeScreen` (what BiteLog is, three points, "See how it works", "Start using BiteLog"), which
opens `TutorialScreen`: eight slides following the day Pranav described, in the same pattern as
Snaptly's tutorial (skippable, swipeable). Then the profile questions. Both are reachable later
from "About BiteLog and the tour" at the bottom of Today. Shown once, gated on the stored flag
`jarvi.welcomeSeen`. The wording differs on purpose between iPhone (burn arrives by itself) and
web (Shortcut or typed in), so people sent the link are not promised something the web cannot do.

**Logo and thumbnail (2026-11-11).** Three concepts are in `app/assets/brand/` (`concepts.png`
shows them side by side). Concept A, "Bitten Rings" (the app's teal and orange rings with a bite
taken out), is installed everywhere: iPhone app icon (`app/assets/icon.png`), browser tab icon,
Home Screen icon for the web version, the top of the landing page, and the picture that appears
when the link is shared in Messages or WhatsApp (`og-image.png`, 1200x630). To switch to B or C:
copy `brand/icon-b.png` over `assets/icon.png`, remake the small sizes from it, run
`npx expo prebuild --platform ios`, rebuild the phone and republish the web. He has not yet said
which he prefers. Messaging apps remember a link's picture for a while, so an old preview can linger.

How the code is laid out, for whoever picks this up:
- `app/src/ui/`: the look (colours, glass card, buttons, tab bar) and all charts.
- `app/src/screens/`: one file per screen. `AddMealSheet` is the + sheet.
- `app/src/navigation/RootNavigator.tsx`: the four tabs live in one screen; meal, goal, weight
  and profile are pushed on top.
- `app/src/goals`, `weight`, `profile`, `settings`: small stores kept on the phone, with tests.
- `app/src/health/healthKit.ts`: everything read from Apple Health (never written).

Not yet confirmed on his real phone, so ask him or look before assuming:
- The About-you screen appearing on first launch (the simulator run skipped it).
- A real food photo going from the + button to the meal screen. Only a built-in sample meal
  was used in the simulator, which has no food photos. In a development build, pressing and
  holding the "Log a meal" title opens that sample; it is not in the real app.
- Workouts and resting energy from his actual Watch.
- The glasses album being found by name.

Known rough edges, deliberately left:
- Food history lives only on the phone and in its iPhone backup. A cloud copy needs a sign-in;
  that is his decision.
- The "eat about" figure stays blank until there is a full day of Watch data or a profile.
- To put a new build on his phone: the Release build command and `xcrun devicectl device install
  app` (see git history of this file's session, or rebuild as below with `-configuration Release`).
  The free Apple account means the app stops opening after 7 days until reinstalled.

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
cd "$HOME/Claude Projects/Project-Jarvi/app" && npx expo prebuild --platform ios --clean && npx expo run:ios --device "iPhone 17 Pro" --no-bundler   # simulator, development build
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

Tests: `cd app && npx jest` (127 pass) and `cd server && npx jest` (37 pass).

## Git state

- Branch `main`, up to date with GitHub apart from this file.
- `tutor/.gitignore` has an uncommitted change that is not ours. Leave it.
- `stash@{0}` holds a half-finished coloured-ring dashboard change from July. The ring drawing
  file itself was never saved, so the rings need rebuilding rather than restoring.
