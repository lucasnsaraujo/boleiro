import tokens from "@boleiro/design-tokens/tokens.json";

const bezier = ([x1, y1, x2, y2]: readonly number[]) => `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
const { easing, duration } = tokens.motion;

/** The Álbum's easings for scripted motion (WAAPI), the same curves as album.css's `--e-*`. */
export const EASE = { out: bezier(easing.out), inOut: bezier(easing.inOut), slap: bezier(easing.slap), peel: bezier(easing.peel) } as const;

/** The Álbum's durations in ms, the same as album.css's `--t-*`. */
export const DURATION = duration;
