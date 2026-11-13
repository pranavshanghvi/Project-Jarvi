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

**WhatsApp preview showed a blank card (2026-11-11, resolved: he reported "it works now" the same evening; which change fixed it is unknown).** On his computer, WhatsApp showed
only the address for the BiteLog link. A control test settled it: `https://www.apple.com` also
came up blank in the same chat, so his WhatsApp is not making previews for ANY link; the site is
fine (it serves the picture and title to WhatsApp's reader, checked). Likely WhatsApp's own
"Disable link previews" privacy setting, or the computer version; not yet confirmed by him. Do not
change the site again for this. Next time a preview fails, run the known-good-link test first.
`/hello/` on the site was a one-off test page and disappears at the next publish.

**Meal helper: BUILT AND LIVE (2026-11-11).** He asked for more than one photo per meal (the food
plus the nutrition label) and voice to say how much he ate, picked the full chat style, then
asked that the extra layers be optional: "someone may just upload one photo and that may be
enough". So the + button now opens `MealChatScreen` (the old `AddMealSheet` is gone): one photo is
read at once and can be saved; optional extras are a label photo and a spoken or typed note. A
"Meal so far" card tags each line From label / Estimate / You said. Design: screen 11 on the
canvas (https://claude.ai/artifact/6V3pne2vESiSGEyr4N9NNi).

- Server: `POST /api/meal-chat` (`server/lib/mealChat.ts`). One turn = the meal so far plus what
  is new, back comes the updated list and a short reply. Nothing is remembered between turns.
- **The AI does not do arithmetic.** On the first live test it turned "a third of the bag" of an
  8-serving bag into a third of ONE serving (50 calories, not 400), and later counted "two eggs"
  twice. Now it returns per-serving numbers plus how much was eaten (servings, or a share of the
  container), and code multiplies. Do not move the multiplying back into the prompt.
- Voice is `expo-speech-recognition` 57.1.1 (`app/src/voice/useDictation.ts`): the phone's or
  browser's own speech-to-text, free, no AI allowance. It is a native add-on, so the iPhone app
  needs a rebuild whenever it changes, and it asks for microphone and speech permission.
- Limits per meal: 6 photos (raised from 3 on 2026-11-12 so a meal of several dishes fits in one go), 8 turns (`app/src/api/mealChat.ts`). Each turn is one read against
  the shared free allowance. A turn takes 10 to 30 seconds; a slow one over 50 seconds fails and
  the screen offers "Try again".
- Verified live: typed meal, label photo, "half the box" (320 calories), save to Today, on the
  web version; a four-step conversation against the server. NOT verified: voice on any real
  device (the test browser blocks microphones), a real food photo through the helper, the
  camera on a phone. Ask him how voice behaves on his iPhone and in Safari.
- Known rough edge: the free model sometimes adds a label as a second line instead of replacing
  the matching food. Each line has an x to remove it.

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

## 2026-11-12: food logging reworked, tour redesign in progress

**Live on the web (mybitelog.vercel.app); iPhone build waits for the cable.**

- **A photo waits for a note.** In "Log a meal" a chosen photo now sits above the message box
  ("Photo ready. Not read yet.") and nothing is sent until the person taps send. Photo and note go
  as ONE read. Server prompt has a rule for photo + words together and for kitchen measures
  (2 tbsp of a 1-cup serving = 0.125 servings). Tested: milk label + "the milk in my coffee, two
  tablespoons, plus a teaspoon of sugar" gives 32 calories, not a cup of milk.
- **Your usuals** (`app/src/usuals/usualsStore.ts`, AsyncStorage key `jarvi.usuals`). After saving
  a helper meal the app offers "Keep as a usual". Usuals show at the top of "Log a meal", best
  match for the time of day first; "Log it" saves with one tap (no photo, no AI read), "Change it"
  loads it into the meal so far. A meal logged on 2+ of the last 14 days is offered by itself.
- **Failures now say why.** `MealHelperError` reasons: photo / network / busy / slow / server, each
  with its own message; a dropped connection gets one silent retry. The server writes
  `[meal-chat] failed {...}` to its log (never the photo or words).
- **Open bug, not reproduced:** at about 1:17 PM two plate photos failed on Pranav's phone with
  the old vague message. The server log shows NO request from that time (only my tests), so it
  failed before reaching the server. Same plate reads fine from here in about 25 s. If it happens
  again the new message tells which stage failed.
- Known rough edges: a non-food picture can still be "read" as food (the model invented a chicken
  sandwich from a picture of text); replies take 6 to 35 s; `0.13 × 1 cup` reads awkwardly.
- "Eaten" is now "Consumed" everywhere it labels the calories-in figure. Photo limit is 6.

**Tour redesign (design only, app tour unchanged):** six animated scenes on the design canvas
(screen 12) and screen 13 for the logging flow. Generator scripts were in the session scratchpad
(`tour-build/gen.py`, `gen_note.py`). Pranav asked for REAL PHOTOS instead of drawings, wants the
logo wherever the name appears, no "20 seconds", and "Consumed". Candidate free photos were found
on Pexels/Unsplash (links only, nothing downloaded; he asked to see links first). Next: he picks
photos, then the tour is rebuilt in `app/src/screens/TutorialScreen.tsx`.

## 2026-11-12 evening: guesses are now labelled; published-number look-up is the open decision

**What happened.** Pranav logged a Dunkin' donut on the iPhone. The review screen showed
"Bavarian cream bagel, 350 calories" with nothing saying it was the AI's guess. He asked where the
numbers came from. Answer: the free AI model's memory. Nothing is looked up anywhere.

**Shipped (commit c267605, web publish 18, iPhone build 18).**
- Every food carries where its numbers came from (`ItemSource` in `app/src/types/nutrition.ts`):
  `label`, `estimate`, `said`, `typed`. `said` (the person named the food in words) is shown as an
  AI estimate too, because the numbers are still the AI's. Only a label photo or hand-typed numbers
  are shown as trustworthy.
- The review screen shows an amber "These numbers are an AI estimate" notice and a tag per food.
  Typing a number flips that food to "Your numbers".
- The source is saved with the meal (new `source` column in the phone database, added in place for
  existing installs; meals logged earlier have no tag because their source is unknown).

**Measured, same donut photo (cropped from his screenshot):**
| Input | AI answer |
|---|---|
| Photo only (his phone) | "Bavarian cream bagel", 350 |
| Photo only (rerun) | "powdered sugar donut", 250 |
| Photo + "Dunkin Bavarian Kreme donut" | 270 |
| Dunkin's published figure (search snippet, not checked against the PDF) | 240 |

So naming the shop helps but does not make the AI's number right. The logo in the photo was only a
fragment; a prompt change to "read the wrapper" would not have helped and was not made.

**Research on free published-number sources (2026-11-12).**
- USDA FoodData Central: free, public domain, needs a free key (Pranav would sign up at
  fdc.nal.usda.gov/api-key-signup; 1,000 calls/hour). Good for packaged groceries and generic foods.
  Did NOT have the Dunkin' donut. Loose matches and some bad rows, so only accept brand+name matches.
- Open Food Facts: free, no key, volunteer-entered. HAD the Dunkin' donut (267 kcal per 100 g, about
  240 for one donut) and a Starbucks latte. Was down (503) on first try; 10 searches/minute; needs a
  User-Agent naming the app (do NOT put Pranav's email in it without asking); licence ODbL, credit
  "Open Food Facts contributors". Its "serving" field is often just 100 g.
- No free source covers restaurant chains reliably. Others (FatSecret, Nutritionix, Edamam) unverified.

**Decision (2026-11-12 evening): "Both sources".** Built and deployed the same evening (commit 80bc00a,
web publish 19).

How it works (`server/lib/foodLookup.ts`, wired in at the end of `runMealChat`):
- The AI now returns a `brand` for each food, only when the person said it or it is printed in the photo.
- For a guessed food with a brand (at most 2 per turn), both databases are asked at once. A result is
  used only when brand AND product name match, the entry has a real serving size (a bare "100 g" is a
  placeholder and is refused), and calories agree with protein/carbs/fat. USDA wins when both have it.
- A match sets source `published` (tag "Published" in the app), swaps in the published numbers and
  serving, and adds a sentence to the reply naming the database. The AI cannot set or alter `published`.
- No match, a slow database, or no time left: nothing changes, the AI estimate stays, labelled.

State of each source:
- **Open Food Facts: live, but weak.** Search goes to search.openfoodfacts.org (fast, no serving sizes),
  then the top two matches are read from world.openfoodfacts.org/api/v2/product (has serving sizes, but
  ran 9-12 s or failed on the evening it was built; the old cgi search gave 503/504). Limits: 2 s search,
  3 s product, and a 10-minute rest after any failure. Verified live: "Chobani nonfat plain greek yogurt"
  came back published, 80 cal for 150 g. A Starbucks latte and the Dunkin' donut stayed estimates.
- **USDA: built, NOT live, NOT tested against the real service.** Needs `FDC_API_KEY` in the Vercel
  project `jarvi-server` (production). Pranav must sign up himself at fdc.nal.usda.gov/api-key-signup,
  then run `vercel env add FDC_API_KEY production` in `server/` and tell Claude, who redeploys and tests.
  The response parsing was written from documentation (DEMO_KEY was rate-limited all evening), so the
  first job after the key exists is a live test of a packaged grocery item.
- The Dunkin' donut that started this is NOT fixed by the look-up: USDA does not have it and the only
  Open Food Facts entry has no real serving size. It stays an AI estimate until he types the numbers.

His own nutrition-facts image for the donut never arrived (only the app screenshot came through).

## 2026-11-12 late evening: corrections are remembered; web search researched, not built

**His real numbers arrived** (a photo of a Gemini answer citing CalorieKing): Dunkin' Bavarian Kreme
Donut = 240 cal, 11 g fat, 4 g sat fat, 0 mg cholesterol, 310 mg sodium, 31 g carbs, 1 g fiber,
11 g sugar (all added), 4 g protein. The app had said 350. His own search called it a "bagel", which
is probably where the app's "Bavarian cream bagel" name came from (his note), not the photo.

**Shipped: "remember my corrections"** (commit 1ac56aa, web publish 20, iPhone build 20).
- `app/src/usuals/correctionsStore.ts`, storage key `jarvi.corrections`, on the device only.
- Saving a meal in the review screen keeps every food whose numbers he typed (source `typed`).
- In the meal helper, any AI guess whose name is the same food (same words after normalising
  spelling; or one name inside the other when the shorter has 3+ words) is replaced by his numbers,
  tagged "Your numbers", and the reply says so once. Label and database numbers are never replaced.
- Verified in the browser preview end to end. Not tested on the phone.
- Gaps: no screen to view or delete saved corrections (correcting again overwrites); typing one
  number marks the whole food "Your numbers" though the untouched numbers are still the AI's; a
  photo-only read that the AI names differently will not match (naming the food in the note fixes it).

**Researched, NOT built: a free web-search step** (so shop items can be looked up the way Gemini did).
- Tavily: free 1,000 searches/month, no card, sign-up at app.tavily.com. Best fit; needs caching per
  food to stay inside the allowance. Terms on storing/feeding results to an AI not yet read.
- Serper: 2,500 free searches, no card, but apparently one-time, so not free forever.
- Brave needs a card; Google's search API is closed to new users and shuts 2027-01-01; Bing is gone;
  DuckDuckGo and SearXNG block automated use. Gemini's free tier has search grounding (500/day) but
  trains on inputs, and Gemini answered 0% of probes in this project's provider report.
- No live search could be tested (every keyless endpoint was blocked), so how often a search result
  alone contains all the numbers is unknown. Sources disagree (240 vs 270 for the same donut).
- Waiting on Pranav: whether to go ahead (he would create the Tavily account himself).

**Still waiting on Pranav:** tour photo picks (links re-sent as full Pexels addresses), optional USDA
key, and the web-search decision above.

**Web-search decision (2026-11-12 late): "Trial it first".** Nothing is built into the app. Waiting on
Pranav to create a free Tavily account (app.tavily.com) and save the key with
`mkdir -p ~/.config/bitelog && pbpaste > ~/.config/bitelog/tavily-key`. Then run a 10-item accuracy
trial (Dunkin', Starbucks, McDonald's, etc.; 10 search credits) and show him results before building.
The trial script lived in the session scratchpad (`lookup/tavily_trial.py`) and may need rewriting:
POST https://api.tavily.com/search, bearer key, body {query, search_depth:"basic", include_answer:true,
max_results:5}. Never print the key. iPhone build 20 (corrections memory) is installed.

## 2026-11-13: tour rebuilt with real photos (committed, NOT yet published)

The first-run tour (`app/src/screens/TutorialScreen.tsx`) is now six picture-led scenes with very
few words, replacing the eight text-heavy slides. Design Pranav approved ("Yes, build it"):
https://claude.ai/artifact/9ofpA7FWfMauQwPi3pbx2n (private to him).

| # | Scene | Picture |
|---|---|---|
| 1 | Every move is counted | Runner photo; burn flows to "Smartphone", then into a small live copy of the Burned screen |
| 2 | Snap your plate | Food photo; AI band sweeps, three foods are named, the meal is logged |
| 3 | Consumed minus burned | The two photos as a sum, 1,520 − 2,140, and the Today ring showing −620 |
| 4 | The gap moves your weight | Scale photo; "Consumed < = > Burned" takes turns; 500 under a day ≈ 1 lb a week |
| 5 | Weeks add up | Week of bars with goal ticks, weight line falling toward the goal |
| 6 | Start with one photo | The + button, photo / label / voice, and the privacy and "not medical advice" small print |

Decisions he made while reviewing, all built in:
- **A runner, not a watch.** He first picked a watch photo, then said it made the app look as if it
  needed a smart watch. Scene 1 shows someone running; a small "Watch optional" tag remains.
- **"Smartphone", never "iPhone"** in the tour's wording.
- **The logo always appears with the word "BiteLog" beside it**, because a first-time visitor
  cannot know what the logo stands for. (This replaces the earlier "logo instead of the word".)
- **The Burned picture in scene 1 is the app's own Burned card**, built from the same parts as
  `BurnedScreen` with example numbers, not a made-up card. If the Burned screen's top card changes,
  update `BurnedPreview` in the tour to match.
- "Consumed", never "eaten"; no mention of how long a photo takes to read.
- **Scene 2 carries a small "Smart glasses work too" tag** (added after the first build, at his
  request). It shows in the iPhone app only: glasses photos come through the phone's photo library,
  which the web version cannot open. It was checked in the browser by switching it on temporarily.

How it is built: every scene is drawn on a fixed 362-point board and the whole board is scaled to
the screen (`ScaledBoard`), so labels stay put on the photos. One example day runs through all
scenes (1,520 consumed, 2,140 burned of which 412 active). Movement stops when the phone's
"Reduce Motion" setting is on. The web wording of scene 1 differs on purpose (the burn is sent with
one tap or typed in; a website cannot read it by itself).

Photos: `app/assets/tour/` (five files, 284 KB in total), free Pexels photos; source pages are in
`app/assets/tour/CREDITS.md`. No new packages were added.

Checked: `npx jest` in `app/` (156 pass); no type errors outside the test files (the test files
have long-standing "cannot find name 'describe'" type errors, unrelated); all six scenes walked
through in the local web preview with no console errors, and "Get started" goes on to the profile
questions for a new person.

**Checked on the iPhone simulator (iPhone 17 Pro), all six scenes, after rebuilding its copy of the
app** (`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --device "iPhone 17 Pro" --no-bundler`;
without the two language settings the build stops in `pod install` with a "Unicode Normalization"
error). Two things learned there:
- **That simulator has "Slow Animations" switched on** (Simulator menu, Debug). It makes anything
  run by the phone's animation engine, including ordinary screen slides, about ten times slower.
  The tour's movement is therefore timed by the app's own clock (`useNativeDriver: false`
  throughout), and scene 2 runs off a single clock so its steps cannot fall out of order.
- **A start-up error from another part of the app showed once, right after the fresh install:**
  "SQLiteErrorException: duplicate column name: source" (an unhandled error from the step that
  adds the `source` column to the phone database, in `app/src/db/`). It did not show on the next
  launch. Not a tour problem and not fixed here; the food-logging session should look at it,
  because it suggests the "add the column" step can run twice.


**Tour published (2026-11-13, about 12:20 PM), at Pranav's request ("publish it to the web and my iphone").**
- Web: mybitelog.vercel.app serves bundle `index-42390ae8…` (commit 1ab136c). All six scenes walked
  through on the live link with no errors. The "Smart glasses work too" tag is hidden on the web.
- iPhone 16 Plus: Release build of commit 1ab136c installed (it finished installing; only the
  automatic launch was refused because the phone was locked). He has not yet said how it looks.
- **Landing page wording brought in line with the tour** (commit b13e110, same day, after he
  approved the exact words): "Know what you consume against what you burn"; the intro no longer
  names the Apple Watch; "in about 20 seconds" is gone; the burn line says "smartphone". The
  description shown when the link is shared (`app/scripts/prepare-web.py`) got the same wording;
  messaging apps may show the old preview for a while.
- Published again with that wording at about 12:27 PM: web bundle `index-015b46ca…`, walked through
  on the live link (landing page, all six scenes, "Get started") with no errors; iPhone 16 Plus
  Release build installed. He has not yet said how it looks on the phone.
- After his laptop restart the local preview server on port 8081 is no longer running, and the
  session scratch folders under /private/tmp were emptied.
