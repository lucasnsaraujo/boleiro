# Sound credits

Every sound file in this folder, where it came from and its licence. The Opções screen shows this table, and `apps/desktop/ui/sound/credits.test.ts` fails if a file here has no row or its licence isn't CC0, the Pixabay licence or CC BY.

All files are the Freesound previews of the sounds below, cut and re-encoded as MP3. Each licence was checked on the sound's own page on 2026-10-10.

| File | Sound | Author | Licence | Source | Edit |
| --- | --- | --- | --- | --- | --- |
| crowd-bed.mp3 | Soccer game in Brazil, goals and crowd shouting | felix.blume | CC0 1.0 | https://freesound.org/people/felix.blume/sounds/611816/ | 120–160 s, looped with a 4 s cross-fade |
| goal-roar.mp3 | Crowd screaming GOAL during the soccer game Mexico-Holland (Fifa world cup 2014) | felix.blume | CC0 1.0 | https://freesound.org/people/felix.blume/sounds/241630/ | first 9 s, faded out |
| goal-distant.mp3 | Goal.wav | Sandermotions | CC0 1.0 | https://freesound.org/people/Sandermotions/sounds/494352/ | 4.6–8.6 s, faded out |
| boo.mp3 | crowd booing | HowardV | CC0 1.0 | https://freesound.org/people/HowardV/sounds/264378/ | first 5 s, faded out |
| oehh.mp3 | Soccer stadium Oehh.wav | Sandermotions | CC0 1.0 | https://freesound.org/people/Sandermotions/sounds/494362/ | 2.4–7.4 s, faded out |
| chant.mp3 | stadium crowd sing | AxelTheCocker02 | CC0 1.0 | https://freesound.org/people/AxelTheCocker02/sounds/733614/ | first 10 s, faded out |
| whistle-short.mp3 | Referee whistle sound.wav | Rosa-Orenes256 | CC0 1.0 | https://freesound.org/people/Rosa-Orenes256/sounds/538422/ | whole, mono |
| whistle-long.mp3 | Referee whistle blow, gymnasium.wav | SpliceSound | CC0 1.0 | https://freesound.org/people/SpliceSound/sounds/218318/ | first 2 s, mono |
| menu-theme.mp3 | Carnaval Loop 136BPM [DJ Zhegusov] | Zhegusov | CC0 1.0 | https://freesound.org/people/Zhegusov/sounds/824144/ | whole loop |
| hub-theme.mp3 | Short Elevator Music Loop | BlondPanda | CC0 1.0 | https://freesound.org/people/BlondPanda/sounds/659889/ | whole loop |

The clicks, the confirmation, the goal stinger, the VAR check and decision, and the title, promotion, relegation and sacking stingers are synthesised in the game with Web Audio (`apps/desktop/ui/sound/soundCatalog.ts`), so they have no file.

The sounds have a budget of 2 MB together, apart from the 17.33 MB of images: two music loops and a crowd bed of under 40 s each at about 96–128 kbps, and short effects. Anything new is cut to the seconds the game plays and encoded the same way.
