# Heaven Hospitality intro — Rive build spec

"Doorway to home": darkness → a seam of warm light → the door opens →
the viewer moves through the light → the doorway's own lines resolve into
the brand mark → the wordmark settles. One continuous take, ~2.5s, no cuts.

Deliverable: `heaven-intro.riv`, replacing the placeholder file next to this
spec. Match the names below exactly — `RiveIntroScene.tsx` references them
by string, and it will fall back to the plain reveal instead of erroring if
one is missing, but the intended animation won't play until it matches.

- **Artboard:** `HeavenIntro`, 800×1600 (portrait, 1:2), so it composes
  safely under both `Fit.Cover` (phone) and `Fit.Contain` (tablet/landscape
  edge case). Keep all essential geometry inside the centre 640×1400 (10%
  safety margin each side) so cover-cropping never clips the mark or type.
- **State machine:** `Intro`, entered via `autoPlay`, single default path
  (no user-input branches needed — reduced motion and skip are handled in
  React Native, outside this file, by not playing it at all).
- **Completion event:** a Rive Event (General type) named exactly
  `introComplete`, fired once, at the moment the composition comes to rest
  (see Scene 5). React Native listens for it to start its own ~400ms
  cross-fade into the app — don't build a fade-out inside the file, the
  state machine should simply hold its resting frame after the event fires.

## Palette

| Role | Hex | Notes |
|---|---|---|
| Background | `#14110E` | Warm near-black charcoal, not pure `#000`. |
| Light — hot core | `#F6ECDD` | Warm ivory; the line/threshold at its brightest. |
| Light — mid | `#E8C99B` | Champagne; bloom falloff, doorway fill. |
| Light — warm edge | `#D98F4E` | Restrained amber; outer bloom/glow only. |
| Wordmark | `#F1E9DD` | Soft ivory, never pure white. |
| Tagline | `#B9AA98` | Muted warm grey. |
| Accent (optional, sparing) | `#4BBDAF` | Existing brand teal. Use once: a hairline inner glint on the doorway threshold at the Scene 2→3 hand-off. Do not use it anywhere else in the file — this stays a warm-light piece, not a teal one. |

No other hues. No gradients that shade toward blue or purple.

## Scenes

**1 — Darkness (0–350ms).** Background fills `#14110E`. At centre, one
hairline vertical bar (2px at this artboard scale) fades in 0→full over
0–180ms (`ease-out`), then holds. A soft radial/linear bloom (`#E8C99B` at
low opacity, blurred, ~40px wide) breathes in behind it 120–350ms. Nothing
else exists yet. Stillness is deliberate — don't rush this.

**2 — The door opens (350–900ms).** The hairline becomes the meeting edge
of two door leaves. Animate two vertical planes (left/right) rotating
outward around their outer edges with a slight perspective skew (scale the
inner edge down ~6% relative to the outer edge as it opens, faking a hinge
in 3D rather than a flat horizontal scale) — start slow, ease into a
faster swing partway through (`ease-in` first third, `ease-out` remainder:
a natural door-push curve, not a symmetric ease-in-out). Warm light
(`#E8C99B` → `#F6ECDD` toward the centre) fills and widens the gap between
them. Behind the opening, place 1–2 extremely faint (≤12% opacity),
soft-edged abstract silhouettes — a vertical arch line and a diagonal plant
frond suggestion are enough — that only read as depth, never as furniture.
The teal glint (see palette) lives right at the leading edge of the light
here, thin and brief.

**3 — Through the light (900–1500ms).** Scale the whole opened-doorway
group up (camera-push feel) while the warm fill expands to dominate the
frame — brightest point is `#F6ECDD`, never pure white. Add subtle
parallax: the faint background silhouettes drift outward slightly faster
than the doorway planes, selling depth. No hard cut — this scene is a
continuation of Scene 2's geometry, same shapes, still growing.

**4 — Transformation (1450–1950ms, overlapping Scene 3's tail).** The two
door-plane edges and the horizontal light spill continuously reshape into
the mark (see "Brand mark" below) — same paths, re-interpolated, not a
cross-dissolve to a new object. By 1950ms the mark is fully formed and
static.

**5 — Brand reveal (1900–2500ms).** ~150ms of stillness on the formed
mark, then the wordmark and tagline animate in together as one unit:
opacity 0→1 and translateY +8px→0, `ease-out`, 250ms, tagline starting
~80ms after the wordmark (not simultaneous, not staggered per-letter). At
~2500ms everything is at rest — fire `introComplete` here.

Total active motion: ~2.5s. Nothing moves simultaneously with everything
else at any point — Scene 1 is one element, Scene 5 is two, that's the
ceiling.

## Brand mark

Not a house pictogram. Built from the same strokes as the doorway, reduced
to the minimum:

```
   ──────────────      ← lintel cap: thin bar, spans outer width,
   │            │         sits slightly above the two uprights (a
   │     ─      │         suggestion of roof/lintel, not a triangle)
   │            │
   └────────────┘
```

- Two vertical strokes (the door jambs from Scenes 2–4, now static) —
  these double as the strokes of an "H".
- One horizontal crossbar joining them at ~55% height (above centre) —
  this is both the H's crossbar and the doorway's threshold/light spill.
- One short horizontal cap, thinner, spanning the outer edges of the two
  verticals, floating just above their tops with a small gap — the roof/
  lintel suggestion. It must stay a flat bar — the instant it becomes a
  triangle or touches the verticals, it reads as a house icon, which is
  explicitly rejected.

Stroke weight: consistent, ~6% of the mark's width. Fill color: `#F6ECDD`
(same as the hot light core — the mark reads as solidified light). This
shape should work as a standalone app icon at 1:1 aspect if the strokes are
recomposed into a square bounding box later — keep it simple enough that
it survives that reduction.

## Typography

Embed both fonts directly in the .riv file (Google Fonts, OFL-licensed —
no runtime font loading needed on the app side):

- **Wordmark** — Outfit, Medium/SemiBold (500–600). Two centred lines:
  `HEAVEN` / `HOSPITALITY`, same size and weight for both — a wordmark,
  not a hierarchy. Letter-spacing: modest, +2–4 tracking units, nothing
  wider. Test the one-line `HEAVEN HOSPITALITY` arrangement too; keep
  whichever balances better inside the safe area at this artboard width —
  two lines is the expected answer at 800px width, but verify.
- **Tagline** — Inter, Regular. `Feel at home.` Small, ~30% the wordmark's
  size, `#B9AA98`, sentence case (not tracked/all-caps).

## Easing reference

- Door opening: `ease-in` (first third) → `ease-out` (remainder). Not
  linear, not a plain ease-in-out.
- Camera push (Scene 3): `ease-out`, continuous with Scene 2's curve.
- Mark settling (end of Scene 4): tiny overshoot then settle (~102% → 100%
  scale, `ease-out-back`, ~120ms) — the one deliberate overshoot in the
  piece.
- Text reveal: `ease-out`, no bounce, no per-character stagger.

## Reduced motion / fallback

Handled entirely outside this file, in React Native (`SimpleIntroReveal`) —
this artboard only needs to implement the one autoplay path described
above. Do not add a second "reduced" state machine path.
