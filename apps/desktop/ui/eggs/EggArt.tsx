import type { ReactNode } from "react";

type Motif = "ghost" | "goal" | "glove" | "card" | "spot" | "calendar" | "cake" | "sprout" | "trophy" | "ball" | "monitor" | "sevenOne";

// The drawing each egg's sticker carries; an egg left out gets the ball.
const MOTIFS: Readonly<Record<string, Motif>> = {
  sobrenatural: "ghost",
  "woodwork-hat-trick": "goal",
  "olympic-goal": "goal",
  blitz: "goal",
  "five-at-half-time": "goal",
  "double-digits": "goal",
  "eight-goal-draw": "goal",
  "seven-one": "sevenOne",
  "keeper-goal": "glove",
  "keeper-two-penalties": "glove",
  "keeper-own-goal": "glove",
  "keeper-decides-shootout": "glove",
  "keeper-sent-off": "card",
  aflitos: "card",
  "five-reds": "card",
  "early-red": "card",
  "president-penalty": "spot",
  "penalty-hat-trick": "spot",
  "endless-shootout": "spot",
  "thousandth-goal": "spot",
  maracanazo: "calendar",
  "friday-13": "calendar",
  "april-fools": "calendar",
  "football-day": "calendar",
  "secret-santa": "calendar",
  "board-cake": "cake",
  namesake: "sprout",
  cousins: "sprout",
  "namesake-scores": "sprout",
  "unbeaten-champion": "trophy",
  "final-stoppage-winner": "trophy",
  "relegated-cup-winner": "trophy",
  "windows-98": "monitor",
};

const DRAWINGS: Record<Exclude<Motif, "sevenOne">, ReactNode> = {
  ghost: (
    <>
      <path d="M12 40V22a12 12 0 0 1 24 0v18l-4-3-4 3-4-3-4 3-4-3z" />
      <circle cx="19.5" cy="22" r="2.2" className="fill" />
      <circle cx="28.5" cy="22" r="2.2" className="fill" />
      <ellipse cx="24" cy="30" rx="2" ry="2.6" />
    </>
  ),
  goal: (
    <>
      <path d="M6 36V13h36v23" />
      <path d="M6 13l5 6h26l5-6M11 19v17M37 19v17M11 25h26M11 31h26M17.5 19v17M24 19v17M30.5 19v17" className="thin" />
      <circle cx="29" cy="31" r="4.5" className="fill" />
    </>
  ),
  glove: (
    <>
      <path d="M15 33V17a3 3 0 0 1 6 0v9M21 25V12a3 3 0 0 1 6 0v13M27 25V13a3 3 0 0 1 6 0v13M33 27v-8a3 3 0 0 1 6 0v9c0 4-2 6-5 6H15" />
      <path d="M15 31l-4-5a3 3 0 0 1 4.5-4l3 3" />
      <rect x="13" y="34" width="22" height="7" rx="2" className="fill" />
    </>
  ),
  card: (
    <>
      <rect x="16" y="9" width="17" height="25" rx="2.5" transform="rotate(12 24 22)" className="fill red" />
      <path d="M10 13l-3-2M9 20H5M10 27l-3 2" />
      <path d="M14 41h20" className="thin" />
    </>
  ),
  spot: (
    <>
      <circle cx="24" cy="21" r="10" />
      <path d="M24 15.5l5 3.6-1.9 5.8h-6.2l-1.9-5.8z" className="fill" />
      <path d="M24 15.5V11M29 19.1l4.3-1.4M27.1 24.9l2.7 3.7M20.9 24.9l-2.7 3.7M19 19.1l-4.3-1.4" className="thin" />
      <path d="M11 39h26" />
      <circle cx="24" cy="39" r="2" className="fill" />
    </>
  ),
  calendar: (
    <>
      <rect x="9" y="11" width="30" height="28" rx="3" />
      <path d="M9 19h30M17 7v8M31 7v8" />
      <rect x="15" y="24" width="6" height="5" rx="1" className="fill" />
      <path d="M26 26h7M26 32h7M15 34h6" className="thin" />
    </>
  ),
  cake: (
    <>
      <path d="M9 40h30M12 40V30h24v10M15 30v-6h18v6" />
      <path d="M12 34c3 0 3 2 6 2s3-2 6-2 3 2 6 2 3-2 6-2" className="thin" />
      <path d="M24 24v-6" />
      <path d="M24 9c2.4 2.2 2.4 4.6 0 6-2.4-1.4-2.4-3.8 0-6z" className="fill gold" />
    </>
  ),
  sprout: (
    <>
      <path d="M24 40V24" />
      <path d="M24 27c-8 0-12-5-12-11 7 0 12 4 12 11zM24 23c0-7 5-11 12-11 0 6-4 11-12 11z" />
      <path d="M13 40h22" />
    </>
  ),
  trophy: (
    <>
      <path d="M16 8h16v10a8 8 0 0 1-16 0z" />
      <path d="M16 12h-6c0 6 3 8 6 8M32 12h6c0 6-3 8-6 8M24 26v6M18 41h12" />
      <rect x="19" y="32" width="10" height="9" rx="1" className="fill" />
    </>
  ),
  ball: (
    <>
      <circle cx="24" cy="24" r="15" />
      <path d="M24 18l5.7 4.1-2.2 6.7h-7l-2.2-6.7z" className="fill" />
      <path d="M24 18V9M29.7 22.1l8.6-2.8M27.5 28.8l5.3 7.3M20.5 28.8l-5.3 7.3M18.3 22.1l-8.6-2.8" className="thin" />
    </>
  ),
  monitor: (
    <>
      <rect x="7" y="8" width="34" height="25" rx="3" />
      <rect x="11.5" y="12.5" width="25" height="16" rx="1" className="fill" />
      <path d="M20 33v5h8v-5M14 41h20" />
    </>
  ),
};

/** The drawing on an egg's sticker, in the sticker's ink. */
export function EggArt({ eggId }: { eggId: string }) {
  const motif = MOTIFS[eggId] ?? "ball";
  if (motif === "sevenOne") {
    return (
      <span className="egg-art egg-art-score" aria-hidden="true">
        7<i>×</i>1
      </span>
    );
  }
  return (
    <svg className="egg-art" viewBox="0 0 48 48" aria-hidden="true">
      {DRAWINGS[motif]}
    </svg>
  );
}
