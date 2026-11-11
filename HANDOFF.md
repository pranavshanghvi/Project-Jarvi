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
| 5 | Photo reading on free AI only | Built and deployed; no keys yet |
| 6 | App runs in iPhone simulator | Verified (iPhone 17 Pro) |

Commits: `4015d36` (server moved off paid Anthropic), `f3e600b` (health, net calories, glasses).
Both pushed to `main`.

## What is in progress

**Giving the photo reader a free AI key.** Pranav wants Jarvi completely separate from Snaptly,
so the keys come from new accounts under a separate Gmail he already owns, not the one Snaptly
uses. (The address is deliberately not written in this file.)

Mistral was tried first and is a dead end: on 2026-11-11 a new Mistral account was offered no
free API plan at all (only a chat-only Free plan, paid plans, and pay-as-you-go). Do not send
him back there. The service to use is **Cloudflare Workers AI**: free daily allowance, and it
returns an error rather than a charge when the allowance runs out. It needs two values, stored
one at a time:

```bash
cd "$HOME/Claude Projects/Project-Jarvi/server" && vercel env add CLOUDFLARE_ACCOUNT_ID production --sensitive --scope pranavshanghvi-1128s-projects
```

```bash
cd "$HOME/Claude Projects/Project-Jarvi/server" && vercel env add CLOUDFLARE_API_TOKEN production --sensitive --scope pranavshanghvi-1128s-projects
```

Never ask him to paste a key into chat. Once he says it is stored:

```bash
cd "$HOME/Claude Projects/Project-Jarvi/server" && vercel deploy --prod --yes --scope pranavshanghvi-1128s-projects
```

then send a real food photo to `https://jarvi-server.vercel.app/api/analyze` and confirm it comes
back with food items. Until a key exists that address answers "unavailable" (HTTP 503) on purpose.

Optional backup keys, same command with a different name: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`.

## What is next

| # | Task | Needs Pranav? |
|---|---|---|
| 1 | Test a real food photo end to end | Key stored first |
| 3 | Install on his actual iPhone | Yes, his Apple ID in Xcode |
| 4 | Republish the web version with new screens | No |
| 5 | Coloured rings on the dashboard | No (he asked for these in July) |
| 6 | General styling pass | His taste; offer a playground |
| 7 | Direct glasses capture (Meta developer kit) | Later, optional |

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
