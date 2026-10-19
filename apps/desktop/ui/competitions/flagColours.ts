import type { State } from "@boleiro/data/clubs";

/**
 * The colours of each Brazilian state's flag, the field's first, then the one its federation's marks lean on and an
 * accent: what a drawn state championship logo is coloured in.
 */
export const STATE_FLAG_COLOURS: Readonly<Record<State, readonly string[]>> = {
  AC: ["#00843D", "#F7D116", "#E2231A"],
  AL: ["#C8102E", "#FFFFFF", "#0033A0"],
  AP: ["#0033A0", "#00843D", "#F7D116"],
  AM: ["#0033A0", "#FFFFFF", "#C8102E"],
  BA: ["#C8102E", "#0033A0", "#FFFFFF"],
  CE: ["#00843D", "#F7D116", "#FFFFFF"],
  DF: ["#00843D", "#FFFFFF", "#F7D116"],
  ES: ["#3A6FB7", "#FFFFFF", "#E8A2B4"],
  GO: ["#00843D", "#F7D116", "#0033A0"],
  MA: ["#C8102E", "#0033A0", "#1A1A1A"],
  MT: ["#0033A0", "#FFFFFF", "#00843D"],
  MS: ["#00843D", "#FFFFFF", "#0033A0"],
  MG: ["#FFFFFF", "#C8102E", "#C8102E"],
  PA: ["#C8102E", "#FFFFFF", "#0033A0"],
  PB: ["#C8102E", "#1A1A1A", "#FFFFFF"],
  PR: ["#00843D", "#FFFFFF", "#0033A0"],
  PE: ["#0033A0", "#FFFFFF", "#C8102E"],
  PI: ["#00843D", "#F7D116", "#0033A0"],
  RJ: ["#0033A0", "#FFFFFF", "#0033A0"],
  RN: ["#00843D", "#FFFFFF", "#F7D116"],
  RS: ["#00843D", "#F7D116", "#C8102E"],
  RO: ["#0033A0", "#F7D116", "#00843D"],
  RR: ["#0033A0", "#FFFFFF", "#00843D"],
  SC: ["#C8102E", "#FFFFFF", "#00843D"],
  SP: ["#1A1A1A", "#FFFFFF", "#C8102E"],
  SE: ["#00843D", "#F7D116", "#0033A0"],
  TO: ["#0033A0", "#F7D116", "#FFFFFF"],
};

/** The flag colours of every country that can host a tournament or own a league in the game, by national-team id or world-pack country id. */
export const FLAG_COLOURS: Readonly<Record<string, readonly string[]>> = {
  "united-states": ["#B22234", "#FFFFFF", "#3C3B6E"], canada: ["#D80621", "#FFFFFF"], mexico: ["#006847", "#FFFFFF", "#CE1126"],
  brazil: ["#009C3B", "#FFDF00", "#002776"], argentina: ["#74ACDF", "#FFFFFF", "#F6B40E"], uruguay: ["#0038A8", "#FFFFFF", "#FCD116"],
  paraguay: ["#D52B1E", "#FFFFFF", "#0038A8"], chile: ["#D52B1E", "#FFFFFF", "#0039A6"], bolivia: ["#D52B1E", "#F9E300", "#007934"],
  colombia: ["#FCD116", "#003893", "#CE1126"], ecuador: ["#FFD100", "#034EA2", "#ED1C24"], peru: ["#D91023", "#FFFFFF"],
  venezuela: ["#FFCC00", "#00247D", "#CF142B"], england: ["#FFFFFF", "#CE1124"], scotland: ["#005EB8", "#FFFFFF"],
  wales: ["#00B140", "#FFFFFF", "#C8102E"], "republic-of-ireland": ["#169B62", "#FFFFFF", "#FF883E"], spain: ["#AA151B", "#F1BF00"],
  portugal: ["#006600", "#FF0000", "#FFCC00"], morocco: ["#C1272D", "#006233"], france: ["#0055A4", "#FFFFFF", "#EF4135"],
  germany: ["#000000", "#DD0000", "#FFCE00"], italy: ["#009246", "#FFFFFF", "#CE2B37"], turkiye: ["#E30A17", "#FFFFFF"],
  netherlands: ["#AE1C28", "#FFFFFF", "#21468B"], belgium: ["#000000", "#FAE042", "#ED2939"], poland: ["#FFFFFF", "#DC143C"],
  ukraine: ["#0057B7", "#FFD700"], austria: ["#ED2939", "#FFFFFF"], egypt: ["#CE1126", "#FFFFFF", "#000000"],
  "south-africa": ["#007749", "#FFB81C", "#DE3831", "#001489"], "saudi-arabia": ["#006C35", "#FFFFFF"], qatar: ["#8A1538", "#FFFFFF"],
  china: ["#DE2910", "#FFDE00"], japan: ["#FFFFFF", "#BC002D"], "south-korea": ["#FFFFFF", "#CD2E3A", "#0047A0"],
  australia: ["#012169", "#FFFFFF", "#E4002B"], "new-zealand": ["#012169", "#FFFFFF", "#C8102E"], kazakhstan: ["#00AFCA", "#FEC50C"],
  hungary: ["#CE2939", "#FFFFFF", "#477050"], romania: ["#002B7F", "#FCD116", "#CE1126"], azerbaijan: ["#00B5E2", "#EF3340", "#509E2F"],
  greece: ["#0D5EAF", "#FFFFFF"], bulgaria: ["#FFFFFF", "#00966E", "#D62612"], serbia: ["#C6363C", "#0C4076", "#FFFFFF"],
  georgia: ["#FFFFFF", "#FF0000"], armenia: ["#D90012", "#0033A0", "#F2A800"], finland: ["#FFFFFF", "#002F6C"], sweden: ["#006AA7", "#FECC00"],
  croatia: ["#FF0000", "#FFFFFF", "#171796"], czechia: ["#FFFFFF", "#D7141A", "#11457E"], slovakia: ["#FFFFFF", "#0B4EA2", "#EE1C25"],
  slovenia: ["#FFFFFF", "#005DA4", "#ED1C24"], cyprus: ["#FFFFFF", "#D57800"], israel: ["#FFFFFF", "#0038B8"], norway: ["#BA0C2F", "#FFFFFF", "#00205B"],
  india: ["#FF9933", "#FFFFFF", "#138808"], indonesia: ["#CE1126", "#FFFFFF"], nigeria: ["#008751", "#FFFFFF"], algeria: ["#006233", "#FFFFFF", "#D21034"],
};
