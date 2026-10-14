/** BRL as millions with one decimal, e.g. 12.3M. */
export const millions = (brl: number) => `${(brl / 1e6).toFixed(1)}M`;
