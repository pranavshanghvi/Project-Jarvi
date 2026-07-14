# Jarvi Phase 1: food logging MVP — design

## Goal

Let the user snap a photo of food and get a full nutrient profile (not just calories) logged automatically, with a daily view and basic trend analytics. No health/activity tracking yet — that's Phase 2 (HealthKit) and Phase 3 (combined balance dashboard).

## Platform

React Native + Expo, TypeScript. Chosen over iOS-native/SwiftUI because it overlaps with the user's existing JS/TS stack (TaxWise on Node/Vercel), and HealthKit access — the reason iOS-native would otherwise be required — isn't needed until Phase 2, where it can be added via a native bridge module.

## Architecture

- **App**: React Native/Expo, all food-log data on-device.
- **Storage**: `expo-sqlite` for structured data (entries, items, nutrients, timestamps, meal tags). `expo-file-system` for photo files, referenced by path from SQLite. No server database, no user accounts/auth — single local user per device.
  - Rationale: avoids standing up a second external-service dependency to maintain (on top of existing Plaid friction on TaxWise) before the core photo → AI → confirm flow is proven out. HealthKit itself is on-device, so Phase 2/3 don't require a backend database either.
- **Backend**: one stateless serverless function on Vercel (matches TaxWise's existing frontend hosting). Holds `ANTHROPIC_API_KEY` as a server-side env var, receives a photo, calls Claude's vision API, returns structured JSON. Stores nothing.
- **Camera/library access**: `expo-image-picker`, supporting both camera capture and photo library selection.

## Nutrient fields

Full label-style profile per food item: calories, protein, carbs, fat, saturated fat, fiber, sugar, sodium, cholesterol.

## Data flow

1. **Capture photo** — camera or photo library.
2. **Claude vision analysis** — photo sent to the Vercel proxy, which calls Claude.
3. **Itemized nutrients** — Claude returns a list of distinct food items detected in the photo (not one combined estimate), each with a name, portion estimate, confidence flag, and full nutrient profile.
4. **Confirm & adjust** — user-facing screen, see below.
5. **Save entry** — photo + timestamp + items + nutrients written to local SQLite. Meal type (breakfast/lunch/dinner/snack) is auto-inferred from time of day, editable if wrong.
6. **Daily view** — today's entries grouped under meal headers, each showing a thumbnail + item names + nutrient badges, with a running daily total per nutrient at the top.
7. **Dashboard & analytics** — charts of nutrient intake (calories, protein, carbs, fat, sugar, sodium, etc.) over the past week/month. Trend-only in Phase 1 since calories-burned data isn't available until HealthKit lands in Phase 2 — this is not a calorie-balance dashboard yet.

## Confirm & adjust screen

Each detected item is a card with:
- Editable name (text).
- A **portion slider** (e.g. 50%–200%) that scales all of that item's nutrients proportionally — this is the primary, fast adjustment.
- Small **per-nutrient fine-tune sliders** underneath, for cases where the AI's ratios (e.g. protein vs. carbs) look off even at the right portion size.
- A visual flag (e.g. amber border) on low-confidence items, so they draw extra scrutiny.
- Delete (for misidentified items) and add-manual-item (name + nutrient fields) controls.

## Error handling

- **Offline**: photo is captured and queued locally; analysis is retried automatically once back online.
- **Claude call fails**: confirm screen shows a retry button; the photo is kept, nothing is lost.
- **Low confidence / unclear food**: Claude still returns its best-effort guess (never a dead end), flagged for scrutiny rather than blocking the flow.
- **Misidentified or missing items**: handled directly on the confirm screen via delete / manual-add, not a separate error path.

## Data model (SQLite, sketch)

```
entries
  id            integer primary key
  timestamp     datetime
  meal_type     text        -- breakfast | lunch | dinner | snack, editable
  photo_path    text

items
  id                integer primary key
  entry_id          integer  -- FK -> entries.id
  name              text
  confidence        text     -- normal | low
  portion_multiplier real    -- from the portion slider, default 1.0
  calories          real
  protein_g         real
  carbs_g           real
  fat_g             real
  saturated_fat_g   real
  fiber_g           real
  sugar_g           real
  sodium_mg         real
  cholesterol_mg    real
```

Daily totals and dashboard trends are computed by aggregating `items` joined to `entries` by date — no separate totals table needed at this scale.

## Testing approach

- **Manual QA** (Expo Go, on-device): camera capture & photo library, portion + fine-tune sliders, confirm/edit/save flow, daily view & dashboard.
- **Automated tests** (Vercel proxy only): calls Claude correctly, parses the response into the expected itemized JSON shape, handles error responses.

No broader automated UI test suite yet — not worth the investment until the app has real usage patterns to protect against regressions.

## Out of scope for this spec

Deferred to later phases, not part of this design:
- HealthKit integration, activity/calories-burned data (Phase 2)
- Combined calorie-balance dashboard, goals (cut/maintain/bulk) (Phase 3)
- Notifications, weekly summaries, macro targets (Phase 4)
- Multi-device sync, backend database, user accounts/auth
