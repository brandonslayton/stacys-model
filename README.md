# Stacy's Model

**Stacy's @ Melrose** (4343 N 7th Ave), the centerpiece venue of
[Melrose Rising](../melrose-rising), as a standalone low-poly model.

Two front ends over the same model:

- **`pocket.html`** — the product. An ambient view for your phone: the venue
  rotating slowly, cars pulling into the lot, people walking in, and a card
  reading how busy it is. Real local time drives day/night.
- **`index.html`** — the workbench. A measuring instrument for improving the
  model: reference-photo overlay, wireframe, view presets, live mesh/triangle/
  material counts.

Three.js + vanilla ES modules. No build step.

> The model started life as an extraction from the game so it could be detailed in
> isolation and pasted back. That is **no longer the plan** — it isn't going back
> into Melrose Rising. See `CLAUDE.md`.

## Run

```bash
cd stacys-model
python serve.py          # http://localhost:8090
```

- `http://localhost:8090/pocket.html` — the ambient view
- `http://localhost:8090/index.html` — the workbench

In the workbench, edit `js/stacys.js` and press **R** to rebuild — no page reload,
no lost camera position.

## The pocket view

| | |
|---|---|
| Orbit | one-finger drag |
| Zoom | pinch (or wheel) |
| Auto-rotate | resumes 4s after you let go; icon button, bottom left |
| Take out the trash | trash-can button, bottom left |
| Patio misters | mist button, bottom left — on/off |
| Sick patron | queasy-face button, bottom left |
| Waymo rideshare | car+dome button — tap to pick up, hold or double-tap to drop off |

Tapping the trash can sends a worker out of the porch with a bag, up the parking
aisle, and into the dumpster — which reacts with a heart. The camera eases round to
the dumpster for it and back afterwards, because at the default angle that corner is
behind the building; any drag cancels the swing. `js/chores.js`, built to take more
interactions later.

The queasy-face button plays a scripted scene: the north side door swings open, a
patron staggers out into the lot, is sick (bright green), then walks off up the
sidewalk. A barback follows with a mop and bucket, cleans it up, and the spot sparkles
while anyone nearby throws hearts and rainbows. `js/incident.js`.

The mist button runs the patio misting system — nozzles along the fence rails throwing
a fog that sinks and pools on the deck, very Phoenix. Switching it on also swings the
camera to the patio (the rear face, likewise hidden by default); switching it off
leaves the camera where it is. `js/mist.js` renders the whole thing as a single
`THREE.Points` with a custom shader, so it costs **one draw call**.

The rideshare button calls a **Waymo**. Tap: one or two guests walk out of the porch,
wait on the curb, a white robotaxi (spinning lidar dome, blue status LEDs, empty cabin)
pulls up in the near lane, they board, and it drives north. Hold or double-tap: the
same car drops someone off and they walk in. `js/rideshare.js`.

Layout: venue name top-left with tonight's event directly under it, and top-right
an `Open` / `Opens 4:00 PM` pill over a big weekday and date, the venue clock,
temperature with a weather icon, and the day's moon phase.

### Day/night follows the real sun

The night mix is driven by the venue's **actual sunrise and sunset** from
Open-Meteo, not a fixed clock ramp — neon starts 20 minutes before sunset and
reaches full night 80 minutes after. The old ramp was inherited from the game and
was roughly right in July but about 90 minutes early in December. If the sun times
fail to load it falls back to that ramp (`nightFromHour`).

Moon phase is computed locally in `js/icons.js` from the mean synodic month — no
extra API. Verified against a published ephemeris: it puts the July 2026 full moon
within ~1.4 hours of the real 29 Jul 14:36 UTC. The icon draws the true phase
shape, but a gibbous moon is nearly a full disc at 17px, so the phase **name**
carries the information.

### No FPS readout on screen

It's real, but it's developer instrumentation, not something to put on an ambient
view. It still exists on `window.__pocket.perf` (`{fps, meshes}`) and
`pocket-shot.mjs` prints it.

### What's real and what isn't

**Real:** the date, the venue's clock, the weather, the open/closed state, and
tonight's event. **Invented:** the people and cars. The sim's crowd size follows
an hourly curve times a day-of-week weight (`HOUR_CURVE` / `DAY_WEIGHT` in
`js/life.js`) so evenings look busier, but no count is ever shown on screen —
agents walking in convey it without asserting a figure. Nothing persists between
visits.

Everything time-based runs on **America/Phoenix**, not the phone's timezone, so
the neon lights at the venue's dusk even if you check in from another state.
Arizona has no DST, which makes this a fixed -7 offset.

### Data sources

| | |
|---|---|
| Events | Stacy's own `/api/events`, mirrored to `data/events.json` |
| Weather | [Open-Meteo](https://open-meteo.com) — no API key, fetched live |

The events endpoint sends **no `Access-Control-Allow-Origin` header**, so the page
cannot call it from a browser. `.github/workflows/refresh-events.yml` fetches it
server-side once a day and commits the result, which the page then reads
same-origin. You can also trigger it by hand from the Actions tab.

Two query details worth keeping: `days=30` rather than `upcoming_only=true`,
because `upcoming_only` drops events that already started today and so hid the
noon Sunday drag brunch from an evening check-in; and matching on `instance_date`
rather than `recurrence_day`, whose casing is inconsistent (`"Friday"` vs
`"sunday"`) and which one-off events lack entirely. Days can hold more than one
event.

### Street geometry

7th Ave runs along **X**: north (the parking-lot side) is −X, south is +X. The lot is
seated flush against the sidewalk's inner edge by `pocket.js`, computed from
`userData.pad.zMax` rather than hardcoded.

The road is dead straight along the property frontage and **bends south of it**
(`bendZ` in `js/street.js`, easing in quadratically from `BEND_START` so there is no
kink). Every path helper applies the bend, so cars and pedestrians follow the curve.
Only the curved section is built from segments; the straight run is single long boxes,
because segmenting the whole length would cost ~100 draw calls for backdrop.

### Opening hours

Real, from Brandon: **4pm Monday–Friday, noon Saturday and Sunday.** They live in
`OPEN_HOUR` in `js/venue.js`. Closing is `CLOSE_HOUR = 2` (2am, Arizona's last
call) — that one is an **assumption**, since only opening times were given.

The pill reads `Open` or `Opens 4:00 PM`, and being open carries over past
midnight, so 1am still reads `Open` from the previous evening's session. The
crowd sim is zeroed while the doors are shut, so nobody strolls in at noon on a
Monday under an `Opens 4:00 PM` badge.

The default camera is **az 58 / el 26**, looking along the street facade — the porch,
carved doors, wall sign and Converse shoe. (The game's own map angle, az 137 / el 42,
looks down on the roof and the mural gable instead.) Framing is fitted per
orientation: `SUBJECT_PORTRAIT` and `SUBJECT_LANDSCAPE` in `js/pocket.js`, chosen on
`camera.aspect`, because in landscape the vertical half-angle becomes the tighter
constraint and a portrait fit crops the lot off the bottom.

```bash
node pocket-shot.mjs                       # headless, iPhone size, 2pm + 10pm
node pocket-shot.mjs --hour=3 --settle=40
node pocket-shot.mjs --w=1512 --h=860      # desktop layout
node pocket-shot.mjs --w=874 --h=402       # landscape phone
```

`pocket-shot.mjs` prints the frame rate it measured — draw calls are the open
performance question (see the merge pass in `CLAUDE.md`).

## Workbench controls

| | |
|---|---|
| Orbit | drag |
| Zoom | mouse wheel |
| Pan | shift-drag |
| Rebuild model | **R** or the button |
| Save PNG | **S** |

- **View presets** — *Game* is the real map angle (azimuth 137° / elevation 42°,
  matching `camOffset (-26, 32, 24)` in the game's `scene.js`). The others line
  up with the reference photos.
- **Time of day** — the hour slider drives the same `nightFactorFromHour` curve
  the game uses; the night slider drives `userData.setNight(t)` directly.
  "Animate neon glimmer" runs `userData.tickNight(now)` per frame.
- **Reference** — overlays a photo from `refs/` at adjustable opacity, in front
  of or behind the model. This is the fastest way to check proportions.
- **Cost** — live mesh / triangle / material / draw-call counts.
- **Game scale** — the parent game multiplies Stacy's by `1.22` for map
  legibility. Off by default so you author at true scale.

## Headless screenshots

```bash
python serve.py &
node shot.mjs                       # every preset, daytime
node shot.mjs --night               # every preset at full night
node shot.mjs --view=game --view=mural
```

Writes to `shots/`. Uses the Playwright install at `~/node_modules`.

Preset azimuths matter: the azimuth says which side the camera sits on, so which
face you see. `90` = the +Z street face, `180` = the -X mural gable, `270` = the
rear patio, `0` = the south flank. `game` is az 137 / el 42.

## Texture dumps

Canvas textures are far easier to judge flat than wrapped on geometry — this
dumps them straight to PNG for side-by-side comparison with a reference photo:

```bash
node tex.mjs mural                  # -> shots/tex-mural.png
node tex.mjs sign diamond cmu
```

## Layout

```
stacys-model/
├── pocket.html       # ambient phone view
├── index.html        # workbench shell
├── css/
│   ├── pocket.css
│   └── viewer.css
├── js/
│   ├── colors.js     # COLORS palette, verbatim from the game's config.js
│   ├── kit.js        # 20 shared helpers — leave alone; see below
│   ├── stacys.js     # THE MODEL — this is what you edit
│   ├── viewer.js     # workbench: camera, HUD, ref overlay, stats
│   ├── pocket.js     # phone view: touch, auto-rotate, clock, stats card
│   ├── life.js       # crowd sim — cars park, people go in, patio fills
│   ├── chores.js     # tap-to-trigger interactions (take out the trash)
│   ├── mist.js       # patio misting system (single-draw-call particles)
│   ├── incident.js   # the sick-patron scene (two actors, door, puddle)
│   ├── rideshare.js  # Waymo pickup / drop-off at the curb
│   ├── sprites.js    # heart / star / rainbow textures + one-shot sprite pool
│   ├── flicker.js    # natural flicker on signs, patio and porch light
│   ├── venue.js      # REAL data: Phoenix clock, tonight's event, weather
│   ├── street.js     # stub of 7th Ave + lane/sidewalk helpers
│   └── agents.js     # createCar / createPedestrian, from the game
├── data/events.json  # mirrored schedule, refreshed daily by CI
├── .github/workflows/refresh-events.yml
├── refs/             # reference photos
├── shots/            # headless screenshot output
├── shot.mjs          # workbench screenshots
├── pocket-shot.mjs   # phone-view screenshots
├── tex.mjs           # dump a canvas texture flat to PNG
└── serve.py
```

### Why kit.js is read-only

`kit.js` is the exact transitive dependency closure of `createStacys` — 20
helpers, nothing more, lifted verbatim from the game's `js/builders.js`:

`mat` `box` `cyl` `neonBox` `trackNightMat` `trackNightMesh` `installVenueNight`
`addPatioStringLights` `createAgave` `createDesertBush` `createShadeTree`
`addPick` `addParkingStalls` `addDoor` `canvasTexture` `ensureSignFonts`
`roundRect` `shadeHex` `addHangingPrideFlag` `createDumpster`

These were kept verbatim so the model could be pasted back into the game. That is
no longer the plan, so this is now a convention rather than a contract — but there
is nothing to gain by churning it. New shared code goes in a **new module**, which
is why `createCar` / `createPedestrian` live in `js/agents.js` rather than here.

## If it ever does go back to the game

`js/stacys.js` began as nine declarations copied verbatim from
`melrose-rising/js/builders.js`:

`STACYS_DISPLAY` `STACYS_UI` `makeStacysDiamondLogoTexture`
`createStacysDiamondPoleSign` `makeStacysSignTexture`
`makeStacysWingsMuralTexture` `addStacysGableMural` `createRainbowConverse`
`createStacys`

Those still map 1:1. But it is **no longer a nine-for-nine swap** — there are now
eight more top-level declarations (`CMU_COURSE_H`, `CMU_BLOCK_W`,
`makeCmuBlockTexture`, `addCarvedDoubleDoor`, `makeGraniteTexture`,
`addDesertScrub`, `createGumTree`, `r0`) that would have to be inserted and
collision-checked against the game's 49 existing builders, plus the
`g.userData` visit-metadata block at the end of `createStacys`. Drop the `export`
keywords (added here so `stacys.js` could be its own module).

Contracts the game relies on, still honored:

- `createStacys(parcel)` returns a `THREE.Group`. (`parcel` is accepted but
  unused; all dimensions are hardcoded.)
- `addPick(...)` must stay — it adds the invisible `name: "pick"` box the game
  raycasts for click selection.
- `installVenueNight(...)` must stay — it installs `userData.setNight` and
  `userData.tickNight`, which the game's clock drives every frame.
- Two meshes carry `userData.previewIgnore` (the property pad and its rim); the
  game's build-preview skips them.

## Orientation

Local space, matching the game's east-side parcels:

```
        -X  north  (parking lot, mural gable, pole sign)
         |
+Z west ─┼─ -Z east      +Z = 7th Avenue, the street face
(street) |                -Z = rear patio
        +X  south
```

## Baseline

The starting point, measured in the workbench:

| | |
|---|---|
| Meshes | 1,461 |
| Triangles | 31,537 |
| Materials | 1,436 |

Triangles are a non-issue. **Draw calls are the entire cost** — which means
merging static opaque geometry by color is the unlock for adding a lot more
detail without paying for it.

## Reference photos

| File | What it shows |
|---|---|
| `IMG_0628` | street face from 7th — best porch reference: carved doors, corbels, iron railing, sacred-heart panel, slat screen, pedestal bench |
| `IMG_0632` | mural gable + parking, from the northwest |
| `IMG_0633` | mural gable head-on, north entry bay at right |
| `IMG_0634` | **rear patio** from the northwest — purple CMU, black mesh fence, shade sails, roof AC |
| `Screenshot-2026-07-25-roof` | near-elevation: roof step-down, porch from the north, scooter row |

The facade is two materials, not one: the north half (porch bay and the wall
carrying the sacred-heart panel) is dark stained **vertical wood planking**, and
olive **block** only resumes south of the porch under the sign.

---

Not affiliated with the real venue — an homage.
