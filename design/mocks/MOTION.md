# Career moments: motion

Each `moment-*.html` plays its own animation when opened. The keyframe stills in `shots/` are frames of that same animation, rendered with `?t=<ms>` (`?t=end` is the last frame).

## How the clock works

- `moments.js` starts every CSS animation at once when fonts and images are in, and runs the canvas parts (mosaics, crowds, confetti, counters) as functions of the elapsed milliseconds. Any frame can be computed directly, so a render at `?t=4600` is the frame a player sees at 4.6 s.
- Skip: the "Pular" button or Esc jumps to the last frame. "Ver de novo" replays.
- `prefers-reduced-motion`: no playback, the last frame shows at once. In the game the scene's sounds still play, each on its beat (`MomentStage`).
- Easing tokens from `tokens/album.css`: `out` = `cubic-bezier(.16, 1, .3, 1)` for arrivals, `in-out` = `cubic-bezier(.65, 0, .35, 1)` for walks, flips and page turns, `slap` = `cubic-bezier(.34, 1.56, .64, 1)` for stickers landing with a small overshoot, `peel` = `cubic-bezier(.5, 0, .75, 0)` for things falling away.
- Confetti is paper, not sparkle: each strip leaves its origin with its own speed, falls under gravity with air drag, sways once it reaches terminal speed and flips in 3D (its back side prints darker). Colours are always the clubs'.
- Mosaics are cards: each cell flips (scale on X through zero) from the stand's dark back to its face when a diagonal wave reaches it. The face comes from text and stripes drawn off-screen at one pixel per card.

## Send-off · `moment-sendoff` · 7.8 s

| ms | What moves | Easing |
|---|---|---|
| 0–900 | Floodlights in the roof flicker on one by one (160 ms each, stepped), the whole scene lifts from 72% dark | stepped, `out` |
| 500–2700 | Upper ring mosaic "OBRIGADO, LUCAS" flips card by card, left to right, 320 ms per card | `in-out` per card |
| 1400–2100 | Title card slides up | `out` 700 |
| 2300–3200 | The banner unrolls along the barrier | `out` 900 |
| 2900–3900 | Squad corridor: 12 stickers rise in pairs, far pair last, scaled by distance | `slap` 520 |
| 3500–5600 | Your sticker walks the path to the centre circle; the yellow trail draws behind | `in-out` 2100 |
| 4900–6700 | Lower ring stands up from the centre outwards | `out` 1800 |
| 4900–6400 | The album page swings in; the six number stickers slap in 180 ms apart | `out` 760, `slap` 460 |
| 6800–7600 | The send-off sticker drops into its slot from above, foil sheen at 7.3 s | `slap` 620 |

Keyframes: `k1` 1.2 s mosaic wave, `k2` 3.0 s banner and corridor, `k3` 4.6 s the walk, `k4` 6.2 s numbers.

## Night sacking · `moment-sacked-night` · 7.4 s

| ms | What moves | Easing |
|---|---|---|
| 200–2100 | Nine results flip down one by one (210 ms apart); after each, board confidence drops (71 → 12) and the fans' bar a little less (88 → 61). The Gre-Nal loss drops the most | `out` 420 |
| 1700–2700 | Clippings pin on: ultimatum, protest, the last defeat | `slap` 520 |
| 2400–3600 | The phone wakes; the lock-screen clock runs 21:40 → 0:47 and slows into it. The board-room windows at the Beira-Rio light up and go dark; the night log writes itself | `out` 1100 |
| 3600 | The phone buzzes (360 ms shake) and the club's note drops | `slap` 520 |
| 4050, 4450 | The newspaper alert, then the assistant's message | `slap` 520 |
| 4800–5900 | Dawn: a wipe from the right turns the night into morning paper | `in-out` 1100 |
| 5300–6100 | The morning paper lands, tilted | `out` 760 |
| 6000–6600 | Fans react: colorados at the training ground, gremistas online | `slap` 460 |

Keyframes: `k1` 1.5 s pressure building, `k2` 3.2 s the clock running, `k3` 4.5 s the notifications, `k4` 6.0 s morning.

## Quiet exit · `moment-quiet-exit` · 5.2 s

Few elements and slow motion on purpose. No slaps, no confetti, no crowd.

| ms | What moves | Easing |
|---|---|---|
| 0–900 | The desk fades in | `in-out` |
| 200–1400 | The letter settles 12 px | `out` 1200 |
| 900, 1500, 2200 | Each paragraph inks in | `in-out` 900 |
| 2900–4200 | The signature draws | `in-out` 1300 |
| 3600–4500 | The spell's numbers, then the page-9 footnote | `in-out` 900 |

Keyframes: `k1` 1.0 s, `k2` 2.4 s, `k3` 3.6 s.

## Testimonial match · `moment-testimonial` · 6.6 s

| ms | What moves | Easing |
|---|---|---|
| 100–800 | The ticket drops in | `slap` 700 |
| 1100–1700 | The stub tears along the perforation and swings off | `out` 620 |
| 1300–2100 | The two line-ups slap in: 2019 in faded print, 2029 in fresh colour | `slap` 380 |
| 2400–5200 | The match runs 0' → 90' (31 ms a minute); each event drops into the feed at its minute and the score updates | `out` 420 |
| 5200–5960 | Arrascaeta's sticker turns over and comes back foil, sheen at 5.8 s | `in-out` 760 |
| 5300 | Paper thrown from the stands, in Flamengo red, black and white | physics |

Keyframes: `k1` 0.9 s ticket, `k2` 2.0 s line-ups, `k3` 3.9 s second half, `k4` 5.9 s foil and paper.

## Tributes · `moment-tribute` · 6.4 s

| ms | What moves | Easing |
|---|---|---|
| 0–1000 | The spread opens: the right page turns over the spine | `out` 900 |
| 500–1400 | The framed shirt swings on its hook and settles | `slap` 900 |
| 900–2400 | The number on the shirt counts 1 → 500 | `out` 1500 |
| 1500–2600 | Win, draw, loss and title stickers slap in; the 500th match card rises | `slap` 460 |
| 1800–2900 | Right page: the "VALEU, LUCAS" mosaic flips right to left | `in-out` per card |
| 2600–3500 | The crowd stands up from the middle | `out` |
| 2700–4500 | The minute of applause: the ring fills and counts 0:00 → 1:00 | linear |
| 4400–6000 | The plaque rises, then its text engraves left to right | `out` 760, `in-out` 1100 |

Keyframes: `k1` 0.7 s opening, `k2` 1.6 s counting to 500, `k3` 3.4 s the applause, `k4` 5.1 s engraving.

## Come-back · `moment-come-back` · 5.6 s

| ms | What moves | Easing |
|---|---|---|
| 0–760 | The paper lands | `out` 760 |
| 450–970 | "VOLTA, LUCAS" stamps | `slap` 520 |
| 700–2300 | The photo develops as halftone, dots growing top to bottom | `out` 1100 |
| 1700–3500 | Campaign numbers slap in; the post count climbs to 318 mil | `slap`, `out` 1600 |
| 2900–3900 | Idol (100) and crisis (0 → 88) meters | `out` 900 |
| 3500–4220 | The written offer slides in from the right | `slap` 720 |
| 4300–4900 | The people you find there again | `slap` 460 |

Keyframes: `k1` 0.6 s, `k2` 1.5 s the photo developing, `k3` 3.0 s the campaign, `k4` 4.3 s the offer.

## Idol · `moment-idol` · 5.8 s

| ms | What moves | Easing |
|---|---|---|
| 500–2700 | Six ledger rows land 360 ms apart; each one fills the meter by its points | `out` 420 |
| ~2550 | The meter crosses 80 and turns green | |
| 2700–3460 | Your sticker turns over (rotate Y through 90°) and comes back foil; sheen at 3.4 s | `in-out` 760 |
| 2750–3560 | "A torcida está fazendo a conta" leaves; "Você virou ídolo do Flamengo" stamps | `in-out` 300, `slap` 560 |
| 3300 | The yellow "ÍDOLO" badge slaps on | `slap` 520 |
| 3600–4600 | What changes, four cards | `out` 420 |
| 4700–5460 | A copy of your sticker flies into the idols row next to Zico | `out` 760 |

Keyframes: `k1` 1.3 s ledger, `k2` 2.65 s crossing, `k3` 3.3 s foil and title, `k4` 4.9 s into the idols row.

## Player award · `moment-player-award` · 5.4 s

| ms | What moves | Easing |
|---|---|---|
| 0–620 | The yellow sticker pack drops in | `slap` 620 |
| 650–1350 | The strip at the top tears off | `out` 700 |
| 1150–1910 | The sticker rises out of the pack, back side up | `out` 760 |
| 1850–2450 | The pack falls away | `peel` 600 |
| 2150–2970 | The sticker turns face up and settles | `in-out` 820 |
| 2750 | Paper from below in Flamengo red and black, white and yellow | physics |
| 2950–3570 | The trophy plate; foil sheen | `out` 620 |
| 3150 | FIFA badge slaps on | `slap` 520 |
| 3300–4900 | The season page: the three awards in the order they were shown, numbers, where he came from | `out` |

Keyframes: `k1` 0.5 s pack, `k2` 1.5 s rising, `k3` 2.5 s turning, `k4` 3.3 s reveal.

## Same title, two stories · `moment-title` · A 2 s, B 9.8 s

A and B start together so the difference in weight is visible: A is finished before B has passed 1990.

A, first season: trophy slaps at 100 ms (`slap` 460), paper at 250 ms (90 pieces, 2.6 s life), XI slaps 40 ms apart from 350 ms, numbers at 900 ms, clipping at 1.2 s, done at 1.9 s.

B, sixth season:

| ms | What moves | Easing |
|---|---|---|
| 400–5200 | The drought counter runs 1979 → 2039: slow, fast through the middle, crawling through the last years (cubic in-out). Runner-up years flash red as they pass | cubic in-out |
| as passed | Old photos of the near misses pin on at the moment the counter passes their year: 2005, 2009, 2020, 2022 (real), 2036, 2037 (yours) | `slap` 460 |
| 5300–6200 | "60 anos de fila" tears in two and the halves fall | `peel` 900 |
| 5600–7200 | The night warms to Inter red | `out` 1600 |
| 5800–7100 | The crowd stands, from left to right | `out` |
| 5900–6600 | "Campeão brasileiro" with the same trophy as A | `slap` 700 |
| 6000 | 200 pieces of red and white paper | physics |
| 6700–7700 | The veterans who stayed | `slap` 460 |
| 8100–8860 | "Finalmente" lands | `out` 760 |

Keyframes: `k1` 1.2 s A done, B starting, `k2` 3.6 s near misses, `k3` 5.5 s the tear, `k4` 6.6 s champion, `k5` 8.4 s the paper.

## Trajectory · `moment-trajectory` · 4.6 s

A regular screen under Histórico, so the motion is short: a playhead sweeps 2026 → 2045 in 2.7 s (linear); club bands grow behind it, markers pop as it passes (`slap` 380) and the idol lines draw. At 3.4 s the selected marker opens its card (`out` 560), records at 3.6 s.

Keyframes: `k1` 1.2 s, `k2` 2.4 s, `k3` 3.6 s.

## Retirement · `moment-retirement` · 12.4 s

| ms | What moves | Easing |
|---|---|---|
| 400–1160 | The album cover opens over the spine | `in-out` 760 |
| 1350, 2000, 2600, 3150, 3650 | One page per club turns: Flamengo, Seleção, Internacional, Benfica, Flamengo again. Each turns in 760 ms with a shadow crossing it; the gaps shrink from 950 to 500 ms so the career speeds up. The caption names each era | `in-out` 760 |
| 4300–4720 | The turned pages fade; the last spread is underneath | `out` 420 |
| 4500–7000 | Left page: name, five club stickers (idols foil with a star), six numbers counting up, the titles line, the whole career as one strip | `out`, `slap` |
| 4700–6800 | Right page: the four tributes drop in 400 ms apart | `slap` 560 |
| 7100–8600 | The Maracanã mosaic flips one last time | `in-out` per card |
| 7600–9900 | Farewell match: the line-up of his players from every club, the score running to 5 × 5 | `slap` 460 |
| 10200–11020 | The last sticker flies from off the page into the last empty slot, overshoots and settles; a ring prints around the slot at landing | `slap` 820, `out` 640 |
| 10750–10850 | Two bursts of paper in the colours of every club | physics |

Keyframes: `k1` 0.8 s cover, `k2` 2.3 s Seleção page turning, `k3` 5.3 s the spread filling, `k4` 8.6 s farewell match, `k5` 10.95 s the last sticker lands.

## Entropy sheet · `moment-entropy` · loops

Cards arrive 80 ms apart (`out` 460). Each card then loops a 4 s animation: build in the first 40%, hold to 95%, reset. Long spell: season bars grow. Losing run: results flip and the clock hand reaches 0h47. Drought: years roll to 2039 and "Finalmente" stamps. Derby streak: five wins slap in, the idol bar jumps 62 → 80. Crisis: the bar climbs and the phone rings. Short spell: the note fades in, "despedida" and "homenagem" get struck out. Academy kid: the last sticker turns foil. Return as visitor: one stand rises to applaud, the other boos.

Keyframes: `k1` 0.3 s, `k2` 1.2 s, `k3` 2.0 s.
