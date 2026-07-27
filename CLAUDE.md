# Stacy's Model — project reference

Isolation workbench for the **Stacy's @ Melrose** low-poly model, carved out of
`C:/Users/brand/melrose-rising`. Read `README.md` for how to run it.

## What this project is for

**Changed 2026-07-26 — read this before planning anything.** The original goal
was to detail the building and paste it back into
`melrose-rising/js/builders.js`. Brandon has decided he does **not** want it to
go back into Melrose Rising. None of the six detail passes were ever ported, and
they should not be.

The target is now `pocket.html` — a standalone ambient view of the venue you pull
up on a phone: the model rotating slowly, cars parking, people walking in, and a
stats card reading how busy it is. Improving the model still matters, but it
serves the pocket view now, not the game.

`js/stacys.js` is still *nearly* paste-compatible with the game if that ever
changes: the nine original declarations map 1:1, but there are now eight
additional ones (`CMU_COURSE_H`, `CMU_BLOCK_W`, `makeCmuBlockTexture`,
`addCarvedDoubleDoor`, `makeGraniteTexture`, `addDesertScrub`, `createGumTree`,
`r0`) plus the `g.userData` visit-metadata block, and they would need collision
checks against the game's 49 builders.

## Hard rules

- **Edit `js/stacys.js` only.** `js/kit.js` is the verbatim dependency closure
  from the game (20 helpers); changing it desyncs every other venue.
  `js/colors.js` is the game's `COLORS` palette verbatim. Now that port-back is
  off the table this is a convention rather than a contract, but there is no
  reason to churn it — new shared code goes in a new module instead, which is why
  `createCar` / `createPedestrian` live in `js/agents.js`.
- **Keep the style low-poly.** Flat shading, chunky forms, no smooth normals, no
  PBR texture maps. Detail comes from *more, better-placed boxes and cylinders*,
  plus canvas textures for things geometry genuinely cannot do (the mural's
  airbrushed feather gradients, sign wordmarks).
- **Preserve the three game contracts:** `addPick` (click selection),
  `installVenueNight` (`userData.setNight` / `tickNight`), and the two
  `userData.previewIgnore` meshes. See README.
- **No auto-commits.** No emojis in code.

## Dev loop

```bash
python serve.py            # :8090
# edit js/stacys.js, press R in the browser
node shot.mjs --view=game  # headless check
```

Verify changes at the **Game** preset (az 137 / el 42) — that is the only angle
players actually see. A detail that does not read at that angle and
`viewSize 28` is not worth its draw call.

## Baseline (unmodified copy from the game)

1,461 meshes · 31,537 triangles · 1,436 materials.
Current: **1,395 meshes · 32,975 triangles · 1,371 materials.**

Triangles are free; **draw calls are the whole cost.** Merging static opaque
geometry by color is the unlock that makes heavy detailing affordable.

## Done — authenticity pass (2026-07-25)

Cost went 1,461 -> 1,271 meshes and 1,436 -> 1,246 materials, so this was net
cheaper than the baseline.

- **Wall color** `0xc4b090` pinkish tan -> `brick 0xa89a5c` / `brickDark 0x8e8148`
  / `brickLite 0xb8a860`. The south gable's duplicated literals now route
  through the consts.
- **CMU coursing** — `makeCmuBlockTexture()` draws a running-bond tile (4 blocks
  x 4 courses, deterministic per-block value jitter) applied to the street,
  south, and rear faces via `addBlockFace()`. One draw call per wall instead of
  ~240 blocks of geometry. Module is `CMU_BLOCK_W 0.38` x `CMU_COURSE_H 0.19`.
  Plus two proud courses (base + bond beam) for genuine relief.
- **Front slat screen** — dense vertical slats at 0.12 pitch over a dark recess,
  top and bottom rails, and a block planter with a two-step cap. Replaced seven
  boxes at 0.45 spacing.
- **Sign** — `signW` 4.2 -> 2.2, `signH` 1.25 -> 0.66, mounted flush
  (`signZ +0.045`), moved to `signX = w * 0.26`. The four pink neon edge tubes
  are gone, replaced by two gooseneck can lights as in IMG_0628. Night read
  still comes from the `emissiveMap` and is if anything stronger.
- **Eucalyptus** — new local `createGumTree()` replaces `createShadeTree`. Three
  trunks with *explicit tops* (a per-segment lean put all three tips within
  ~0.3 units, so the canopies merged into one lollipop), single orientation
  quaternion per trunk, shed-bark patches, and canopy blobs anchored on the
  trunk tips. This also kills the ~40 detached floating leaf quads.

## Done — porch pass (2026-07-25)

1,271 -> 1,455 meshes / 31,203 tris / 1,430 materials. Still under the original
baseline's 1,461 meshes.

- **Facade is two materials.** IMG_0628 shows the north half — porch bay plus the
  sacred-heart wall — is dark stained vertical wood planking, with olive block
  only resuming south of the porch. The CMU panel had been covering the whole
  street face. Now split at `woodWallXMax = -0.2`, with individual plank boards
  at 0.16 pitch and a burgundy trim band on top.
- **Heavy timber frame.** Posts 0.14 -> 0.22 square in burgundy (`0x5a2c22`, the
  actual stained color), on base blocks, with **corbel brackets** — a diagonal
  knee plus a horizontal shoulder each side. Deep 0.26 header beam plus a second
  beam back at the wall.
- **`addCarvedDoubleDoor()`** — the centerpiece. Each leaf gets a radiating X of
  carved arms with parallel relief ribs, cross members, a round center boss, an
  iron ring pull, and vertical slat bands top and bottom; between the leaves a
  **barley-twist mullion** built from 14 stacked rotated blocks. Was one flat box.
- **Railing** — burgundy top/bottom rails and apron with dense dark iron pickets
  at 0.105 pitch, each with a mid-height knuckle, plus capped newels with
  finials. Was five fat boxes at 0.35.
- **Deck** — 9 plank boards on a skirt, two worn timber steps.
- **Sacred-heart panel** — framed teal field with 8 radiating rays, a rotated-box
  heart with two cylinder lobes, and a flame. Was a flat blue box. Sits *north*
  of the doors, per the photo.
- **Wall lantern** (night-tracked, glimmering), speaker box, and the weathered
  **stone pedestal bench** from IMG_0628 / IMG_0634.
- Removed now-dead `wood` / `woodRail` consts and the `addDoor` import.

## Done — massing pass (2026-07-25)

1,455 -> **1,527 meshes / 32,983 tris / 1,502 materials**. This pass is the first
that pushed *above* the original baseline (1,461 / 31,537 / 1,436) — the
trapezoidal slopes need per-row deck slabs (18 instead of 2) and the hip adds
tile rows. Worth it for the silhouette, and it strengthens the case for the merge
pass being next.

- **The south end is a HIP, not a gable.** IMG_0628 and the roof screenshot both
  show a clear diagonal hip rake over the southern third; the model had
  `addClosedGable` squaring that end off. This was the single biggest massing
  error. Now: `southEaveX` / `hipRun 1.5` / `southRoofX = southEaveX - hipRun`,
  with the hip built in a local frame (local +Z downslope) and oriented into
  place, apex at the ridge end and base at full depth along the south eave. Hip
  rakes are oriented by direction vector via `setFromUnitVectors`.
- **`addBarrelTileSlope` now takes `hipExtend`,** making the main slopes
  TRAPEZOIDS: rows grow toward +X as they descend, so the eave still reaches the
  south end while the ridge stops at the hip apex. Pass 0 for the old rectangle.
- **NW parapet block** straddling the ridge, stated as "cap sits `parRise` above
  the ridge".
- South soffit strip closes the wall head under the eave.

### Two dead ends worth not repeating

- **Placing hip tiles directly in world space.** The barrels kept their default Y
  axis so they stood upright instead of lying along the slope, and the taper ran
  the wrong way. Build in a local frame and orient the group, exactly as
  `addBarrelTileSlope` does.
- **Rectangular main slopes ending at the ridge line.** Geometrically wrong
  against a hip — it leaves two triangular holes either side of the hip with the
  wall showing through. A hip roof's slopes are trapezoidal.
- **A parapet forward of the ridge**, with a coursing texture plane, punched
  through the tiles. Straddle the ridge and use coursing *lines* instead.

## Done — mural pass (2026-07-26)

`makeStacysWingsMuralTexture` rewritten. Canvas 1400x1100 -> 1520x1256, matching
the gable's `baseW / peakY` aspect. Mesh cost unchanged (it is one texture).

**New tool:** `node tex.mjs mural` dumps any canvas texture flat to PNG. Judging
a texture wrapped on a gable at an angle is guesswork; flat next to the photo the
errors are obvious. Use this first for any texture work.

What was wrong and what changed:

- **Muddy purple** — the purple mesas were drawn so large and low that they
  merged into a floor across the entire lower half. Now they are small
  silhouettes in a band on the left and right only, with the tan desert floor
  confined to the bottom ~22%.
- **Invented sun** — there was a cartoon sun disc with spokes on the left. The
  photo has no sun; it has broad pale rays fanning up and out from *behind the
  wing junction*, fading before the top of the wall.
- **Sky** now deep blue at the peak through periwinkle and pale blue into a gold
  band and coral. It used to turn orange by 40% up the wall.
- **Wings** rebuilt (see below).
- Added boulders, bigger saguaros standing on the ground line, rose spars moved
  outboard so they no longer cross the badge, a smaller/wider diamond badge, and
  the artist signature. Brick coursing now goes over the whole composition — the
  photo never hides the masonry.

### The wings took four attempts

Recording all four because the failure modes were instructive:

1. **Feathers hanging down off a leading edge** -> read as a moustache.
2. **Feathers spread wide off a horizontal leading edge** -> a spiky fan.
3. **One clipped silhouette with a smooth trailing edge** -> a rounded leaf.
4. **What works:** two parts. Long pointed PRIMARIES as discrete geometry
   fanning below, plus a COVERT mass clipped to a silhouette with a gradient
   running parallel to the leading edge (pale pink, rose, green, teal). The
   ragged layered bottom edge is what makes it read as a wing, so the primaries
   have to be real geometry, not texture.

Two measured details that mattered: the **longest primaries are the inner ones
near the centre**, shortening outward so the wing's lower edge rises toward the
tip (an earlier version grew them outward and splayed the fan flat across the
wall); and **colour runs along each feather** from mid blue at the root to deep
indigo at the tip, not flat per feather — flat-coloured feathers read as glass
shards.

### Mural, still imperfect

- Primaries are more sawtooth than softly overlapping at the bottom edge.
- Clouds still read as flat lozenges rather than painted cumulus.
- Mesas could be more present.

## Done — roof + ground pass (2026-07-26)

1,527 -> **1,473 meshes / 32,163 tris / 1,448 materials**. Net *cheaper* despite
adding curbs, bike hoops and tree detail, because ~99 pebble and patch meshes
went away.

- **Parapet removed.** I had misread IMG_0628: the tan shape above the tile is
  not a chimney or a freestanding block, it is the **top edge of the mural gable
  wall itself**, which stands slightly proud of the roof and is capped — so from
  the street you see a sloped brick coping running up the rake. Modelling it as a
  block on the ridge was wrong. Removed at Brandon's call; the roof is otherwise
  untouched. If it is ever wanted, the right form is a thin raked coping along the
  north gable, not a volume.
- **Ground rebuilt.** Was a 0.14 soil plinth + 0.06 gravel layer + 14 flat "dust
  patch" boxes + 85 pebble meshes. That read as a raised tray with rubble tossed
  on it (one patch looked like a dropped plank) and cost ~100 draw calls for a
  speckle. Now: `makeGraniteTexture()` on a single flush plate, plus a low
  concrete curb where the bed meets asphalt, and three rounded salmon boulders.
  IMG_0628 shows dense uniform reddish crushed rock level with the pavement.
- **The tree was standing on asphalt** — `treeX -2.7` sits north of the main
  bed's edge at `yardXMin -2.35`. Added a second granite plate covering it, kept
  west of the porch steps (`tbZMin = frontZ + 1.75`) so it never runs under the
  deck. Note `porchZ` / `porchD` are declared *later* in `createStacys`, so that
  edge has to be derived from `frontZ` — referencing them here throws on the TDZ.
- **Bike racks** are now four galvanized inverted-U hoops on a rail, stepping
  along X so they read as separate hoops from the street. Spacing them along Z
  stacked them behind one another and looked like a ladder.
- **Scrub** replaces `createDesertBush` / `createAgave` (both dropped from the
  kit imports): `addDesertScrub()` splays thin olive stems low and open, since the
  photo's bushes are wispy, not solid dark-green blobs.
- **Tree** improved: root swell cut right down (a wide cylinder read as a concrete
  lamp footing), a modest per-trunk flare, 6 segments instead of 4 for finer
  taper, six smaller varied canopy blobs instead of three big ones (the large
  icosahedra read as one faceted broccoli head), more and thinner twigs, and
  darker smaller shed-bark patches so they read as mottling rather than pale
  collars.

### Texture speckle gotcha

Scattering with a golden-ratio pair for both coordinates — `(i*0.618)%1` and
`(i*0.382)%1` — puts points on lattice lines, which showed up as faint vertical
striations across the whole bed. Use an LCG, or at least two unrelated
irrationals. The same pairing is still used for the mural's pebbles and the roof
tile jitter, where it has not caused visible trouble.

### Tree placement is a standing tension

At elevation 42 a ~5-unit tree standing against a 2.85-unit facade *always*
drapes its canopy over the wall — true in the photos too, but it buries whatever
detail is behind it. It went through three placements this session: in front of
the sign, then in front of the porch, and finally out in the front yard at
`treeX -2.7 / treeZ frontZ + 2.95 / scale 1.15`, where it frames the lot instead
of covering the building. Revisit if the massing changes.

### Open judgment call

At the game camera the wall sign reads now that the tree moved out into the yard,
but it still sits under a deep eave and only the lower two thirds are clear. The
pole sign is what actually identifies the venue at map zoom, and in the real
building the wall sign genuinely is tucked under that eave behind trees. `signW`,
`signX`, and the tree placement are the knobs if it needs more.

(The mural sky note that was here is resolved — see the mural pass above.)

## Done — shoe pass (2026-07-26)

1,473 -> **1,395 meshes / 32,975 tris / 1,371 materials**. Cheaper *and* far more
detailed, because the whole body collapsed to one mesh.

`createRainbowConverse` rewritten. **The bands were running the wrong way.** The
old version stacked six horizontal bands from sole to collar; the real sculpture
(IMG_0628) has bands running ACROSS the shoe — each one a rib sweeping up from
the foxing, over the top and down the far side — sequenced toe-to-heel. Two
consequences of getting that wrong: from the street it read as a staircase,
because each tapered band slab stepped down; and from the **game camera it read
as a solid purple slab**, because with horizontal bands an overhead view only
ever sees the topmost colour. Transverse bands show the whole rainbow from any
angle, which is the entire point of the landmark.

- **Body is one lofted mesh.** Cross-sections along the length, flat shaded,
  non-indexed, coloured **per face** via vertex colours. That single draw call
  carries the silhouette, the rainbow ribs, the white foxing, its black
  pinstripe and the toe cap. The old band-slab approach cost ~70 draw calls.
  Per-face rather than per-vertex because interpolating a band edge across a
  quad smears it into a gradient; stations are placed on the exact band
  boundaries so every rib edge lands on a quad edge.
- **Profile** from keyframe lists (`TOP_KEYS` / `HALF_W_KEYS`) with smoothstep
  between keys — linear interpolation leaves a visible kink at every key.
  Length:ankle-height is ~1.75, measured off the photo.
- **Chalky palette.** The saturated primaries (`0xe53935` etc.) read as plastic;
  the real thing is matte concrete in full sun. Also `roughness 0.92`, flat
  shading, and a coarse interpolated noise field giving a ~2% hand-troweled
  swell plus a subtle per-face value mottle.
- **It IS a planter.** The mouth is filled with dark mulch to just under a thin
  worn rim. The old version had an empty black box floating on the collar.
- Criss-crossed laces instead of parallel bars, dark eyelets read straight off
  the ring so they sit exactly on the surface, and a white roundel with a maroon
  star (was a black disc).
- New `shot.mjs` views: **`shoe`** (game angle, zoomed) and **`shoeface`** (low
  street angle). `VIEWS` entries now take an optional world-space `target`.

### Three dead ends worth not repeating

- **Deciding the foxing by a face-midpoint height test.** With uniform angular
  ring sampling, the lower half of a tall section is one enormous quad running
  from the widest point almost to the ground; its midpoint sits above the foxing
  line, so under the ankle the rainbow ran straight down to the gravel and the
  white rubber wrap disappeared. Fix: sample the ring as **two arcs meeting
  exactly on the foxing line** (`N_CANVAS` + `N_RUBBER`), making rubber an index
  range instead of a midpoint guess. Note the arcs must be inserted in a fixed
  order — sorting the boundary angles into a uniform list twists the loft,
  because near the toe the crossing is on the dome and at the ankle it is on the
  flat, so its sorted position moves.
- **Running full width and height straight to u = 0.** Leaves the heel a flat
  vertical wall, which is most of why it read as a paint can. Both ends have to
  round off over the first few stations.
- **Covering the planter mouth with a squashed icosahedron.** Its faces sit
  inside the circumsphere and the vertical squash pulls the silhouette in
  further, so the painted body showed through the rim as a pink crescent. Needs
  a flat fill disc overlapping the rim's inner radius, with the mound on top.

Trusting loft winding is also not worth it — every triangle is emitted through a
helper that forces its normal to face away from an interior reference point.

## Done — pocket view (2026-07-26)

The ambient phone view. New files, no change to the workbench (`viewer.js` stays
the measuring instrument — ref overlays, wireframe, cost panel, view presets):

- **`pocket.html` / `css/pocket.css` / `js/pocket.js`** — full-screen canvas,
  slow auto-rotate that pauses 4s after a touch, one-finger orbit, pinch zoom,
  and a glass stats card. Real local time drives the same `nightFromHour` curve
  the game uses, so checking in at 11pm shows lit neon and a full room.
- **`js/street.js`** — a stub of 7th Ave for cars to arrive on. The game's road
  runs along world Z with parcels rotated into place; in workbench local space the
  street face is +Z and north is −X, so this road runs along **X** at fixed +Z and
  the helpers are straight-line (no curve sampling). Near lane runs −X so a car
  has the lot on its right and turns right into the driveway.
- **`js/agents.js`** — `createCar` / `createPedestrian` / colors, copied from the
  game. Separate module to leave `kit.js` alone.
- **`js/life.js`** — `LifeSystem`, adapted from the game's `visit.js`.
- **`createStacys` now publishes `g.userData.parkingSpots` / `venueAccess` /
  `driveway`.** `addParkingStalls` only paints stripes and wheel stops; the actual
  stall coordinates lived in the game's map data, so they are computed at the end
  of `createStacys` where the lot variables are still in scope. Stall centers
  mirror `addParkingStalls`' own `across` formula — if that changes, this drifts.
- **`pocket-shot.mjs`** — headless capture at iPhone 16 size, both day and night.

### Three things that were wrong and are worth not repeating

- **Occupancy climbed to the cap at every hour.** Driving the sim with a spawn
  *rate* doesn't work: arrivals outpace the 50–210s dwell by a wide margin, so the
  room saturates within minutes and 2pm Sunday looks identical to midnight Friday.
  `setCrowd()` sets a **target** occupancy instead and gates arrivals on it;
  turnover then falls out for free. Occupancy now tracks the hour (13 at 2pm
  Sunday, ~50 at 10pm).
- **The target overshot ~2x** until `wantsArrivals` counted *in-flight* arrivals.
  Cars pass the gate on spawn but don't deposit their party of 1–3 until they've
  driven in and walked to the door, so several carfuls all cleared a gate that had
  room for one.
- **Going inside must release the pedestrian mesh.** The game holds it for the
  whole trip, which caps occupancy at the 18-mesh pool. Here `inside` is just a
  list of timestamps, so it can read 50 with a handful of agents visible.

### Framing a wide flat subject on a portrait phone

A bounding *sphere* wildly overestimates a flat lot — most of it is air — so
`SUBJECT.radius` is tuned to the on-screen result, not computed. Distance is fit
against whichever of the vertical/horizontal half-angles is tighter, because a
portrait phone's horizontal FOV is far narrower and the building otherwise
overflows the sides. `SUBJECT.center` sits *below* grade to push the building into
the upper two thirds, clear of the stats card.

At el 42 the top of frame still points ~19° **down**, so the camera never sees
sky — the upper third is ground plane. `scene.fog` fading it toward the sky color
is what gives an implied horizon; a wide fog range was too weak to read, hence the
tight `58 → 115`.

### Still open on the pocket view

- **Draw calls are now the real bottleneck**, not a hypothetical. 1,395 meshes
  plus 6 cars and 18 pedestrians on a phone CPU is exactly what the merge pass
  fixes. Untested on a real device — the `fps` readout on the card is there to
  judge it. (The ~20fps in `pocket-shot.mjs` is swiftshader software rendering and
  means nothing about phone performance.)
- Shadow map is 1024 here vs the workbench's 2048; first thing to drop if slow.
- Nothing persists between visits, per Brandon's call — no history, no streak.
- Not hosted. Local `serve.py` only, so it is not actually reachable from a phone
  yet; that was a deliberate "decide later".

## Done — real data layer (2026-07-26)

The pocket card stopped reporting invented numbers and started showing real ones.
Brandon's call: "hide the stats, as they are fake, but I like seeing that it looks
like people are going to the bar." So the sim still runs and is still visible —
only the *reporting* of it went away.

Layout now: venue name top-left, and top-right an `Open` / `Opens 8:00 PM` /
`Closed` pill over a big bold weekday + date, with the venue clock and temperature
under it. The bottom card is tonight's event.

- **`js/venue.js`** — real data only. `venueNow()` returns the venue's wall-clock
  parts via `Intl` on **America/Phoenix**, not the phone's zone, so the neon lights
  at the venue's dusk wherever you are (AZ has no DST, so it's a fixed -7).
  `currentEvent()`, `venueState()`, `fetchWeather()`.
- **`crowdFactor(hourFloat, weekday)`** in life.js was refactored off `Date` for the
  same reason — it used to read the phone's `getHours()`/`getDay()`.
- **Weather** is Open-Meteo: no API key, and it *does* send `allow-origin: *`, so
  it's fetched live. `is_day` picks a moon glyph after dark — a sun next to
  "9:20 PM" reads as a bug.
- **Events** come from Stacy's own `/api/events`, which their site calls
  client-side. It sends **no CORS header**, so the page cannot call it; the
  `refresh-events` workflow mirrors it daily into `data/events.json` and the page
  reads that same-origin. The workflow validates the payload shape before
  overwriting, so an error page can't wipe a good schedule.
- **Open/closed comes from real posted hours** in `OPEN_HOUR` (js/venue.js):
  4pm Mon–Fri, noon Sat/Sun, given directly by Brandon. Their site publishes none
  and Yelp 403s, so this is the only source. `CLOSE_HOUR = 2` (Arizona last call)
  is an **assumption** — only opening times were given. Open carries past midnight,
  so 1am reads Open from the prior evening. **Never wire the sim's `crowdFactor`
  into anything presented as fact** — the sim is also zeroed while shut
  (`crowdFor()` in pocket.js) so the visuals agree with the pill.

### API gotchas that cost time

- **`upcoming_only=true` drops events that already started today.** That hid the
  noon Sunday drag brunch from any evening check-in. Use `days=30`.
- **Match on `instance_date`, not `recurrence_day`** — its casing is inconsistent
  (`"Friday"` vs `"sunday"`) and one-off events have none. Also, a day can hold
  more than one event (Sundays have brunch at noon *and* karaoke at 8pm), so
  "today's event" is a list plus a pick, not a lookup.
- **The site is a `created.app` embed, not the Divi WordPress shell.** The schedule
  is nowhere in the served HTML — the first scrape attempts found only tag
  definitions and nav labels. Rendering it in Playwright and watching the network
  tab is what surfaced the JSON endpoint.
- **`pocket-shot.mjs --hour=N` means Phoenix hour.** Building the frozen instant
  from `getUTCDate()` is wrong: after 5pm Phoenix, UTC has already rolled over, so
  shots landed on tomorrow's date and tomorrow's event. Shift back 7h first.

## Done — real sun, moon phase, icon pass (2026-07-26)

- **Night now follows the venue's REAL sunrise/sunset**, from the same Open-Meteo
  call (`daily=sunrise,sunset`). `nightFromSun()` ramps from 20 min before sunset
  to full night 80 min after. This answers a question Brandon asked directly — the
  old `nightFromHour` was a fixed ramp inherited from the game, ~right in July but
  about 90 minutes early in December. At 7:20pm on 26 Jul the real curve gives 0.08
  where the old one gave 0.43. Kept as the fallback when sun times fail.
- **The weather icon keys off our own `nightMix`, not the API's `is_day`.** Those
  can disagree, which would put a sun on screen while the neon is already lit. After
  dark, clear skies show no weather icon at all — the moon row carries it.
- **Moon phase is computed locally** (`js/icons.js`), mean synodic month from a
  known new moon. Checked against a published ephemeris: the Jul 2026 full moon
  lands within ~1.4h of the real 29 Jul 14:36 UTC. Deliberately no extra API for a
  decorative detail. The icon draws the true terminator (a half-ellipse with x
  semi-axis R·|cos 2πp|), but **a gibbous moon is nearly a full disc at 17px**, so
  the phase name is what actually informs — icon alone reads as a plain circle.
- **Icons are inline SVG** (`WX_ICONS`, `ROTATE_ICON`), inheriting `currentColor`.
  The previous text glyphs (☀/☾) were too faint against a bright sky, and emoji
  render differently per platform and can't take the UI color.
- **Layout:** event card moved into `.ident` under the venue name — since `#top` is
  a flex row, `.ident` takes whatever the date column leaves, so no manual
  max-width. Auto-rotate is a 44px round icon button, bottom-left, that spins while
  active. Clock and temperature went from 12.5px `--dim` to 16px/700 near-white.
- **FPS readout left the screen.** Still on `window.__pocket.perf`; pocket-shot
  prints it. Real, but developer instrumentation does not belong on an ambient view.

## Done — default angle + responsive pass (2026-07-26)

**Default camera is now az 58 / el 26**, matched to a screenshot Brandon picked. This
departs from the game's az 137 / el 42 that every detail pass was verified at. Worth
understanding why it is a good trade: 137/42 looks down on the roof and the mural
gable, while 58/26 looks along the street facade — the carved double doors, corbels,
iron railing, slat screen, wall sign and the Converse shoe are all in frame. The
mural gable is not visible from here at all.

To match an angle from a screenshot, render candidates and compare rather than
reasoning about it — `/tmp` throwaway scripts driving `window.__pocket.view` +
`applyCamera()` converge in two rounds. Reading azimuth off a screenshot by tracing
which faces are visible is unreliable, especially since the workbench is
orthographic and the pocket view is perspective.

### Desktop was three separate bugs, not one

Brandon reported the event tile "stretches the full width on desktop". Capturing at
1512x860 showed three:

- **The card stretched to ~1360px.** `#card` sits in `.ident`, which is `flex: 1`, so
  with no cap it fills a desktop window and reads as a letterbox banner with the text
  crammed left. Now `max-width: 330px`, 380px on desktop.
- **All type was sized for a 402px phone at DPR 2**, so the whole HUD read as
  miniature on a 1500px window. Added a `min-width: 700px` block scaling the name,
  day/date, clock, temperature, pill, card and rotate button. The SVG icons carry
  hardcoded width/height, so they need explicit scaling too or they sit undersized
  next to the larger text.
- **The model was cropped off the bottom.** In landscape the *vertical* half-angle
  becomes the tighter constraint, pulling the camera close enough that the lot and the
  far side of 7th Ave fall outside the fit radius. Hence `SUBJECT_LANDSCAPE`
  (radius 8.5) picked by `camera.aspect >= 1` in `computeFit()`.

**`pocket-shot.mjs` takes `--w` / `--h`** now — desktop and landscape layouts are not
checkable at the default phone viewport, and all three needed separate verification.

### The portrait framing bias had been left pointing the wrong way

`SUBJECT_PORTRAIT.center.y` was *below* grade to lift the building over a stats card
pinned to the bottom of the screen. When that card moved up under the venue name, the
bias should have flipped — it was still pushing content up into the header instead of
down into the free space. Now `+1.6`.

## Done — chores: take out the trash (2026-07-26)

First tap-to-trigger interaction, and the seed for more. Trash-can button, bottom
left next to auto-rotate: a worker leaves the porch with a bag, walks up the parking
aisle, tosses it in the dumpster, the dumpster does a happy squash-and-hop, a heart
sprite floats up and fades, and the worker walks home.

- **`js/chores.js`** — `ChoreSystem`, deliberately separate from `life.js`. That
  system is ambient and autonomous with anonymous patrons; these are *requested*
  one-shot performances with a named actor and a scripted beat, so they get their own
  mesh and state. To add a chore, add a method and a state branch.
- **`createStacys` publishes `userData.dumpster`** (position, approach point, lid
  height) and names the dumpster group `"dumpster"` so chores.js can animate it —
  same pattern as the parking/door metadata.
- **The route goes out the FRONT and up the aisle**, not out the rear patio door,
  which would be the obvious short path. The patio is enclosed by purple CMU on three
  sides, so a worker leaving that way would walk through a wall. The aisle at
  x ≈ -4.16 threads between the stalls (which end at z ≈ -2.5) and the patio (which
  starts at x ≈ -3.2), and clears the parked cars (x -7.4..-5.4).
- **Worker walks at 2.9**, well above a patron's 1.85–2.4. The route is ~14 units each
  way and at patron pace the round trip ran 13s, too long to watch.

### The payoff was invisible without a camera move

The dumpster is at the NE property corner — north end, rear side — which the default
az 58 puts squarely behind the building. First working version showed only the heart
popping above the roofline; the entire toss happened out of sight. `CHORE_VIEW`
(az 228 / el 26 / zoom 0.85) is where the dumpster, the worker and the mural gable are
all in frame, and `stepFocus()` eases there and back with exponential smoothing.
Auto-rotate is held off during the swing or it fights for the azimuth, and any
`pointerdown` calls `cancelFocus()` so manual input always wins.

Alternative if this ever feels intrusive: move the dumpster somewhere visible from the
front. It is at the NE corner for authenticity, not necessity.

## Improvement backlog

Ordered by visible-pixels-per-unit-of-work at the game camera. **Done:** items 2,
3, 4, 5, 6, 9, the leaf cut, and part of 8 (pedestal bench, NW parapet).

**Remaining, best first:**
- **(1) Merge pass** — the next move, and now justified rather than speculative:
  the pocket view runs on a phone. See "Still open on the pocket view" above. Measured: 1,395 of the meshes are mergeable
  and bucket into **207** groups, so draw calls go ~1,473 -> ~330, about 4.5x.
  (Earlier notes guessed "~20"; that was wrong. Getting below ~200 needs a
  separate palette-consolidation step — there are 116 distinct colours in the
  mergeable set alone.) Excluded: the `pick` box, 2 `previewIgnore`, 7 textured,
  3 transparent, and 119 night-tracked meshes. **Also exclude the shoe body** —
  it is vertex-coloured, so it has no single material colour to bucket by, and
  it is already one draw call. Counts above predate the shoe pass; re-measure.
- **Fix the workbench Cost panel** — it prints a hardcoded fabricated estimate
  ("roughly 25"). It should compute the real bucket count.
- **(7) Patio life** — a bar, DJ booth, umbrellas; sagging shade sails. IMG_0634
  is the reference and shows the purple CMU is brighter/more violet than modelled.
- **Rest of (8)** — scooter row, five inverted-U bike hoops, downspout plus two
  gooseneck floodlights on the mural gable, a real swamp cooler with grille and
  legs.
- **Mural refinement** — the base composition is now right; what remains is
  softening the primary edge, better cumulus, and more present mesas.
- **Stepped eave** — the photos hint the north/porch-bay eave sits lower than the
  main hall. Lower confidence than the hip was; needs a careful read before
  restructuring the slope spans again.

1. **Merge pass** — group static opaque meshes by material into single
   geometries as a final step in `createStacys`. Must skip: night-tracked and
   flash materials, transparent meshes, textured meshes, the `pick` box, and the
   two `previewIgnore` meshes. Best done as an opt-in final pass so individual
   meshes stay tweakable while iterating.
2. **Split the massing.** Currently one `6.4 x 4.6 x 2.85` box with a single
   continuous ridge. Photos show the roof stepping down at the south end, a
   raised section behind the porch, and a small parapet block at the NW. Varied
   eave heights cost almost no triangles and low-poly lives on silhouette.
3. **Rebuild the porch** — highest return anywhere; it is dead center in the
   game camera. Today: two plain `0.14` posts, a flat beam, five box balusters,
   a flat door. Photos: heavy dark timber with corbel brackets, a carved
   Mexican-style double door with diamond lattice, turned spindles, a lantern.
4. **Wall color + coursing.** `0xc4b090` is a pinkish tan; photos read
   olive/khaki-gold (~`0xa89a5c`–`0xb8a860` in sun). The building is painted CMU
   with loud mortar coursing — four thin bands read as generic stripes at game
   zoom. Give the two camera-facing walls real staggered blocks (~0.18 high).
5. **Front screen wall.** Photos: dense vertical wood-slat screen under the sign
   plus a stepped block planter cap across the full frontage. Today: seven dark
   boxes at 0.45 spacing.
6. **Sign proportion.** `signW = 4.2` on a 6.4 building is 66% of the frontage;
   real is ~25%, flat to the block, below the eave, sitting on the slat screen.
   The four pink neon edge tubes are not on the real sign. *Judgment call:* it
   may need to stay oversized to read at `viewSize 28` — but mount it flush and
   drop the tube frame either way.
7. **Patio life.** It drives Vibe in-game but is the emptiest part of the model:
   a purple box with four identical tables. Needs a bar, DJ booth, umbrellas.
   Shade sails are flat boxes at `opacity 0.72` — they want a dipped center
   vertex so they sag.
8. **Missing signature props**, all cheap: the stone pedestal urn in front of
   the porch, the scooter row, five inverted-U bike hoops (today: two flat
   boxes), the NW parapet block, the downspout and two gooseneck floodlights on
   the mural gable, a real swamp cooler with grille and legs.
9. **Tree species.** Photos show pale multi-trunk eucalyptus/gum — a very
   Phoenix silhouette. Currently a dark-brown-trunk shade tree.

### Cut these

- **Detached canopy leaves.** ~40 leaf quads float visibly separated from the
  hull at every angle; reads as debris. Tuck them tight or drop them.
- ~~85 pebbles + 14 dust patches~~ — done in the roof + ground pass.

## Notes

- `addRainbowWings` exists in the game's `builders.js` but is never called — dead
  code. The mural uses `makeStacysWingsMuralTexture` (canvas) instead, which is
  the right call; polygons cannot do airbrushed feather gradients.
- `createStacys(parcel)` ignores `parcel` entirely — all dimensions hardcoded.
- Fonts: `ensureSignFonts()` must be awaited before building, or canvas sign and
  mural text falls back to a system font. The game calls it from `main.js`; the
  workbench calls it in `build()`.
