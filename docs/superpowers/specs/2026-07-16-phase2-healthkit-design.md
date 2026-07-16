# Jarvi Phase 2: HealthKit integration — design

## Goal

Pull calories-burned data from Apple Health into the existing Jarvi app so Today's log shows a real intake-vs-burned balance, not just intake. Apple Health already aggregates Apple Watch and Oura Ring (free tier) activity, so this is the single integration point needed — no separate Oura API.

## Platform impact

HealthKit requires a native module with special entitlements that Expo Go cannot provide. This is the first Jarvi feature that requires moving off Expo Go to a custom development build:

1. Install `@kingstinct/react-native-healthkit` and its Expo config plugin (added to `app.json`).
2. Run `npx expo prebuild` to generate a native `ios/` project (previously absent — Expo Go handled everything generically).
3. Open `ios/app.xcworkspace` in Xcode, sign with a free Apple ID (personal team), and build directly to a physical device over USB/Wi-Fi instead of scanning a QR code with Expo Go.
4. Day-to-day iteration stays fast afterward (`npx expo start --dev-client` gives live reload); a rebuild in Xcode is only needed when a native dependency changes, and the free-tier signing certificate requires reinstalling roughly every 7 days.

Decision: proceed with the free Xcode/personal-team route rather than a paid Apple Developer account, since this is for personal testing, not distribution.

## Architecture

- **iOS only.** HealthKit is Apple-only; Android's equivalent (Health Connect) is a different API and out of scope. On Android, the burned/balance line simply doesn't appear.
- New module `app/src/health/healthKit.ts`, following the same thin-wrapper pattern as `db/client.ts`:
  - `requestHealthPermissions(): Promise<boolean>` — triggers iOS's native Health permission sheet (only shown once; iOS remembers the choice after that).
  - `getCaloriesBurned(date: Date): Promise<number>` — sums active energy + resting/basal energy for the given calendar day via `@kingstinct/react-native-healthkit`'s query APIs.
- Active + resting energy together, not active-only — resting energy is the majority of daily burn, so an active-only number would understate total burn and make the "balance" figure misleading.

## Data flow

1. `DailyViewScreen` mounts → the existing SQLite fetch for today's food entries runs unchanged, alongside a new call to `getCaloriesBurned(today)`, where `today` uses the same local-calendar-day definition as `todayKey()` (Phase 1 fixed a UTC-vs-local mismatch between meal-tagging and date-bucketing — `getCaloriesBurned` must query the local calendar day, not a UTC-boundary day, to stay consistent with that fix).
2. Today's totals header gains a second line: burned calories and net balance (intake − burned), e.g. "1,850 cal in · 2,100 cal out · -250 net".
3. No new screen, no new navigation entry — purely additive to the existing header in `DailyViewScreen.tsx`.
4. The food-logging flow (capture → confirm → save) is completely unchanged; this is a read-and-display addition only.

## Permission handling & error states

- First mount of `DailyViewScreen` calls `requestHealthPermissions()`.
- **Granted:** fetch and show burned/balance normally.
- **Denied:** don't block or nag. Intake line still shows as usual; where burned/balance would go, show a small tappable "Connect Health" label that re-triggers the permission request (in case of an accidental denial).
- **Not on iOS, or no Health data reported yet for today:** treat burned as 0 — no error, no crash. Balance just equals intake minus zero.
- This mirrors the existing camera/library permission pattern in `CaptureScreen`: permission problems degrade gracefully rather than blocking a feature that already works.

## Testing approach

- `getCaloriesBurned`'s date-range/calendar-day-boundary logic is pure and gets TDD coverage with a mocked HealthKit response, matching the `mealTagging`/`aggregation` test pattern from Phase 1.
- The actual native HealthKit read, the iOS permission sheet, and the merged Today's log UI all require a real physical device to verify — no simulator/device access in the development environment, so these get a manual on-device verification step (same pattern as Phase 1's native-module tasks: capture screen, SQLite repository).

## Out of scope for this spec

- Android / Health Connect support.
- Historical backfill UI (Today's log only ever shows today; HealthKit itself already retains historical data independent of when this feature shipped, so no backfill logic is needed for the burned-calories number itself).
- Combined balance trend charts on the Dashboard, and cut/maintain/bulk goal setting — deferred to Phase 3 per the original roadmap.
- Workout-level detail (individual workout list/type) — only the aggregate active+resting energy total is used.
