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
| Auto-rotate | resumes 4s after you let go; button to disable |

The crowd is simulated — there is no live feed from the real venue. Occupancy
follows an hourly curve times a day-of-week weight (`HOUR_CURVE` / `DAY_WEIGHT` in
`js/life.js`), so a Sunday afternoon is quiet and a Friday midnight is packed.
Nothing persists between visits.

```bash
node pocket-shot.mjs                 # headless, iPhone size, 2pm + 10pm
node pocket-shot.mjs --hour=3 --settle=40
```

The `fps` readout on the card is deliberate — draw calls are the open performance
question (see the merge pass in `CLAUDE.md`).

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
│   ├── street.js     # stub of 7th Ave + lane/sidewalk helpers
│   └── agents.js     # createCar / createPedestrian, from the game
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
