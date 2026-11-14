# Brainstorming ideas for nutrition accuracy

Written 2026-11-14, from a conversation between Pranav and Claude about BiteLog. Nothing in the
"Ideas not yet decided" half has been built. Come back to this when you want to pick it up.

## The problem in one line

When you photograph a meal, BiteLog's calories are often wrong and change from one try to the
next. The same donut photo came back as 350, 250 and 260 calories. The real number was 240.

## How far off are we? (measured, not guessed)

On 2026-11-14 BiteLog was scored against 15 photos of meals that researchers had weighed, so the
true calories are known. Each photo was read three times.

| Measure | Before | After |
|---|---|---|
| Typical miss per read | 38% | 41% |
| Direction of the miss | 29% low | 2% high |
| Swing, same photo | 25% | 9% |
| Reads within 20% | 20% | 23% |
| Reads that failed | 0 of 45 | 10 of 45 |

"Before" is BiteLog as it was that morning. "After" is with the steadier setting, the weight
estimate and the USDA food table switched on (see "What the better apps do" below).

**The honest reading: steadier and no longer running low, but not yet more accurate per meal.**

- The answers stopped wandering (swing down from 25% to 9%).
- The under-counting is gone. Before, almost every miss was on the low side, so a week of logging
  would add up to far too few calories. Now the misses fall on both sides and largely cancel out
  over days.
- A single read is still about 40% off. The table cannot rescue a food the AI names wrongly (it
  read a plate of egg whites as scrambled eggs) or a weight it guesses badly (80 grams for a
  136 gram waffle). That is what the portion check is for.
- The 10 failed reads were not the new logic. BiteLog's one free AI provider timed out once and
  then rested for a minute, and every read during that minute was refused. This is the case for
  adding more free providers (Idea 3).
- A caution on the test itself: the photos are small, low quality lab shots taken from directly
  above, and their "true" numbers assume vegetables cooked with no fat. Your own phone photos
  would be a fairer test.

The main cause of the original misses was visible in the reads: the AI assumed small "standard"
portions. It called a 297 gram portion of chicken "about 4 oz" (113 grams).

## Is this just us? No.

| # | Who | Typical miss |
|---|---|---|
| 1 | MyFitnessPal, Lose It, Cal AI | About 33% low |
| 2 | SnapCalorie (its own claim) | 15 to 25% |
| 3 | The best AI models, mixed meals | 30 to 50% |

A 2026 US government (NIH) study weighed 102 meals and found four big apps all came in 250 to 345
calories too low per meal, mostly from fat a camera cannot see (oil, butter, dressing). Another
test sent one photo to AI models 500 times and got a different answer every time.

Nobody has solved this. The realistic target is "steady, and within about 20% after one tap from
you", not lab precision.

## Why a photo read goes wrong

The AI has to guess two things at once:

| # | Guess | How wrong it usually is |
|---|---|---|
| 1 | How much food is there | Very. The biggest source of error |
| 2 | Calories for that kind of food | Somewhat, and it drifts |
| 3 | Fat you cannot see | Always missed |

## What the better apps do

| # | Technique | Status in BiteLog |
|---|---|---|
| 1 | Turn the AI's randomness down | Live on the server |
| 2 | AI gives the weight, a table gives the calories | Live on the server |
| 3 | Ask you to confirm the portion | Designed, waiting on you |
| 4 | Ask about cooking oil or butter | Designed, waiting on you |
| 5 | Depth sensor on the camera | Not possible (needs an iPhone Pro) |
| 6 | Remember your corrections | Already built (Nov 12) |
| 7 | Published numbers for branded food | Partly built (Nov 12) |

Notes on each:

1. One setting. Reduces the swings, does not fix wrong numbers.
2. The AI now says only "grilled chicken breast, about 200 grams". The calories per gram come
   from the US Department of Agriculture's table of about 5,300 everyday foods, and plain
   arithmetic does the rest. The same food and weight now always give the same calories.
3. In one study, telling the AI the real weight cut the error from about 51% to 29%. This is the
   single biggest lever, and it needs one tap from you.
4. One optional question that targets exactly where every app runs low.

## Decisions waiting on you

| # | Decision | Response |
|---|---|---|
| 1 | Portion control: A, B or C? | |
| 2 | Keep the cooking oil question? | |
| 3 | Who is BiteLog for? | |
| 4 | Create a free Tavily account? | |
| 5 | Create a free USDA key? | |

1. Three styles to try (chips, stepper, slider): https://claude.ai/artifact/BFs7KKqgwPd6n6qAbfaaS1
2. It is in the same design page, with an on/off switch.
3. You and people you know, a free public app, or something you may charge for. This decides
   how to fill the restaurant gap (Idea 1).
4. For the web search trial (Idea 2): app.tavily.com
5. So packaged groceries can be looked up in the USDA's table: fdc.nal.usda.gov/api-key-signup

## Ideas not yet decided

### Idea 1: one big database of everything

Your question: food companies all publish their nutrition facts, and the government publishes
numbers for plain foods. Has somebody compiled it all, or should we build it?

| # | Kind of food | Free database? |
|---|---|---|
| 1 | Plain foods (apple, rice, chicken) | Yes. In BiteLog now |
| 2 | Packaged groceries (barcodes) | Yes. Partly in BiteLog |
| 3 | Restaurant chains (Dunkin', Subway) | No complete free one |

Plain foods come from the US Department of Agriculture. Packaged groceries come from the USDA's
branded-products table and from Open Food Facts, a volunteer-built one.

Restaurants are the gap. Chains with 20 or more locations must provide nutrition information by
federal law, but each publishes on its own site in its own format and nobody official collects it.

What exists for restaurants:

| # | Source | Catch |
|---|---|---|
| 1 | Nutritionix | Paid, price unconfirmed |
| 2 | FatSecret | Free levels, with conditions |
| 3 | MenuStat (NYC Health Dept) | Free, but stops at 2018 |
| 4 | Our own collection | Free, but needs upkeep |

- Nutritionix is the closest to "everything in one place": its owner claims 192,000 restaurant
  items across 800+ chains, plus groceries and plain foods. It is a commercial product.
- FatSecret has a basic free level (5,000 look-ups a day) and one for start-ups with the full US
  data, with a credit line required. Whether we may keep copies of what we look up is unconfirmed.
- MenuStat covers the top 100 US chains.

Three ways to fill the gap:

| # | Approach | Trade-off |
|---|---|---|
| A | Rent it (FatSecret free level) | Fastest, their rules |
| B | Collect the top chains ourselves | Ours, needs upkeep |
| C | Look up on demand, then remember | Grows by itself |

- A is quickest to working, but BiteLog then depends on another company's terms.
- B is fully ours and free to run. Menus change, so it needs a refresh a few times a year.
- C fills itself with what people actually eat, including small local chains. It depends on a web
  search service (see Idea 2).

Claude's leaning: B for the 20 to 30 biggest chains, C for everything else, with the USDA tables
underneath. The right mix depends on decision 3 above (who BiteLog is for), because licence terms
and coverage needs change a lot between a personal tool and a product you charge for.

Things to check before building B: each chain's website terms on automated copying (nutrition
facts themselves are facts, which US copyright does not protect, but site terms can still forbid
copying), and that any AI used to read the chains' documents is a free one, per this project's
no-paid-AI rule.

### Idea 2: web search for shop items

When a brand is named and no database has it, search the web for the published numbers. Researched
on Nov 12: Tavily is the best free fit (1,000 searches a month, no card). Agreed plan was a trial
on about 10 real shop items before building anything. Waiting on the Tavily account.

### Idea 3: more free AI providers

BiteLog uses one free AI provider (Cloudflare). Adding others with BiteLog's own free keys would
help speed and reliability and might read photos better, but would not fix shop-item accuracy.
Each needs a free account you create. Not decided.

### Idea 4: smaller ideas, parked

| # | Idea | Why parked |
|---|---|---|
| 1 | Read each photo three times, use the middle | Triples the wait |
| 2 | A fork or card in the photo for scale | Studies disagree |
| 3 | Barcode scanning for packaged food | Not yet discussed |
| 4 | A screen to manage saved corrections | Not requested |
| 5 | Score BiteLog on your own phone photos | Needs your photos |

## What was built on 2026-11-14 (for the record)

- A scoring kit: 15 weighed test meals and a script that reads each photo through the live server
  and reports the four measures above. The photos are from Google Research's Nutrition5k set
  (free to use with credit) and live in a temporary folder, not in the app.
- Server: steadier AI setting; the AI now reports a weight for each food and is told to judge it
  from the photo rather than assume a standard serving; the USDA food table supplies calories per
  gram when it has the food, and the AI's own numbers are kept when it does not.
- App (not yet on your phone): carries the weight through so the review screen can show it, and a
  fix for a start-up error seen on a fresh install.
- A design for the portion check and the cooking oil question, as a page you can try.

## Sources

- NIH study of four apps: https://www.healthday.com/health-news/nutrition/how-accurate-are-photo-based-calorie-apps-4-are-put-to-the-test
- Same study, Healio: https://www.healio.com/news/primary-care/20260804/ai-photobased-calorietracking-tools-underestimate-them-by-33
- SnapCalorie's method and claims: https://apps.apple.com/us/app/-/id1574239307
- AI gives ingredients and weight, a database gives the nutrition (CaLoRAify): https://arxiv.org/abs/2412.09936v1
- AI portion estimates against dietitians: https://arxiv.org/pdf/2312.08592
- Three AI models compared on food photos: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12513282/
- One photo, 27,000 reads, different answers: https://www.diabettech.com/i-asked-ai-to-count-my-carbs-27000-times
- Giving the AI the weight cuts the error: https://vtechworks.lib.vt.edu/items/b67c2a61-f283-41ba-9602-9798306b9529
- MenuStat: https://tools.nccor.org/css/system/105/
- Nutritionix (owner's figures): https://syndigo.com/wellness/
- FatSecret free levels: https://platform.fatsecret.com/api-editions
- USDA branded foods fact sheet: https://fdc.Nal.Usda.Gov/docs/USDA%20Global%20BFPD%201-Pager%202024.pdf
