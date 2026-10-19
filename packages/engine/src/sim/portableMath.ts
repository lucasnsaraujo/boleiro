/**
 * Math functions that give the same bits on every JavaScript engine. The language leaves Math.exp,
 * Math.log, Math.pow (and `**`), Math.sin and the rest to each engine, and V8's versions,
 * JavaScriptCore and arm64 builds of Node (which fuse multiply-adds) disagree in the last bit, so a
 * seed played on WebKit or Chromium drifted from the same seed in Node. These are fdlibm's
 * algorithms as V8 12.4 runs them, ported line for line: they use only arithmetic, Math.sqrt and
 * operations that are exact (abs, floor, trunc, max, bit operations), which IEEE 754 and the
 * language fix to the bit, so they return what x86-64 Node 22 returns, on every engine and CPU.
 *
 * Ported from V8's src/base/ieee754.cc and src/builtins/math.tq (hypot):
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this software is freely granted, provided that
 * this notice is preserved.
 */

const float = new Float64Array(1);
const words = new Int32Array(float.buffer);
// Which of the double's two 32-bit words holds its sign and exponent: the second on little-endian CPUs.
const HIGH = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
const LOW = 1 - HIGH;

function highWord(x: number): number {
  float[0] = x;
  return words[HIGH] ?? 0;
}

function lowWord(x: number): number {
  float[0] = x;
  return (words[LOW] ?? 0) >>> 0;
}

function fromWords(high: number, low: number): number {
  words[HIGH] = high;
  words[LOW] = low;
  return float[0] ?? 0;
}

function withHighWord(x: number, high: number): number {
  float[0] = x;
  words[HIGH] = high;
  return float[0] ?? 0;
}

function withLowWord(x: number, low: number): number {
  float[0] = x;
  words[LOW] = low;
  return float[0] ?? 0;
}

/** 2^n for -1022 <= n <= 1023, built from its bits. */
function powerOfTwo(n: number): number {
  return fromWords((0x3ff + n) << 20, 0);
}

/** x * 2^n rounded once, as C's scalbn (musl's algorithm). */
function scalbn(x: number, n: number): number {
  let y = x;
  let e = n;
  if (e > 1023) {
    y *= powerOfTwo(1023);
    e -= 1023;
    if (e > 1023) {
      y *= powerOfTwo(1023);
      e -= 1023;
      if (e > 1023) e = 1023;
    }
  } else if (e < -1022) {
    // The last step must land below 2^-53 of the subnormal range so the result rounds only once.
    y *= powerOfTwo(-1022) * powerOfTwo(53);
    e += 1022 - 53;
    if (e < -1022) {
      y *= powerOfTwo(-1022) * powerOfTwo(53);
      e += 1022 - 53;
      if (e < -1022) e = -1022;
    }
  }
  return y * powerOfTwo(e);
}

const HUGE = 1.0e300;
const TINY = 1.0e-300;
const TWO54 = 1.8014398509481984e16;
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INVLN2 = 1.442695040888963387;
const EXP_P1 = 1.66666666666666019037e-1;
const EXP_P2 = -2.77777777770155933842e-3;
const EXP_P3 = 6.61375632143793436117e-5;
const EXP_P4 = -1.6533902205465251539e-6;
const EXP_P5 = 4.13813679705723846039e-8;
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;
const TWOM1000 = 9.3326361850321887899e-302;
const TWO1023 = 8.988465674311579539e307;

export function exp(value: number): number {
  let x = value;
  let hx = highWord(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lowWord(x)) !== 0) return x + x;
      return xsb === 0 ? x : 0;
    }
    if (x > O_THRESHOLD) return Infinity;
    if (x < U_THRESHOLD) return 0;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      // fdlibm gets the last bit of e wrong; V8 answers it exactly.
      if (x === 1) return Math.E;
      hi = xsb === 0 ? x - LN2_HI : x + LN2_HI;
      lo = xsb === 0 ? LN2_LO : -LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = (INVLN2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }
  const t = x * x;
  const twopk = k >= -1021 ? fromWords(0x3ff00000 + (k << 20), 0) : fromWords(0x3ff00000 + ((k + 1000) << 20), 0);
  const c = x - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2.0) - x);
  const y = 1 - (lo - (x * c) / (2.0 - c) - hi);
  if (k >= -1021) return k === 1024 ? y * 2.0 * TWO1023 : y * twopk;
  return y * twopk * TWOM1000;
}

const EXPM1_Q1 = -3.33333333333331316428e-2;
const EXPM1_Q2 = 1.58730158725481460165e-3;
const EXPM1_Q3 = -7.93650757867487942473e-5;
const EXPM1_Q4 = 4.00821782732936239552e-6;
const EXPM1_Q5 = -2.01099218183624371326e-7;

function expm1(value: number): number {
  let x = value;
  let hx = highWord(x);
  const isNegative = hx < 0;
  hx &= 0x7fffffff;
  if (hx >= 0x4043687a) {
    if (hx >= 0x40862e42) {
      if (hx >= 0x7ff00000) {
        if (((hx & 0xfffff) | lowWord(x)) !== 0) return x + x;
        return isNegative ? -1.0 : x;
      }
      if (x > O_THRESHOLD) return Infinity;
    }
    if (isNegative && x + TINY < 0.0) return TINY - 1;
  }
  let k = 0;
  let c = 0;
  if (hx > 0x3fd62e42) {
    let hi: number;
    let lo: number;
    if (hx < 0x3ff0a2b2) {
      hi = isNegative ? x + LN2_HI : x - LN2_HI;
      lo = isNegative ? -LN2_LO : LN2_LO;
      k = isNegative ? -1 : 1;
    } else {
      k = (INVLN2 * x + (isNegative ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
    c = hi - x - lo;
  } else if (hx < 0x3c900000) {
    const t = HUGE + x;
    return x - (t - (HUGE + x));
  }
  const hfx = 0.5 * x;
  const hxs = x * hfx;
  const r1 = 1 + hxs * (EXPM1_Q1 + hxs * (EXPM1_Q2 + hxs * (EXPM1_Q3 + hxs * (EXPM1_Q4 + hxs * EXPM1_Q5))));
  const t = 3.0 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs);
  const twopk = fromWords(0x3ff00000 + (k << 20), 0);
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) return x < -0.25 ? -2.0 * (e - (x + 0.5)) : 1 + 2.0 * (x - e);
  if (k <= -2 || k > 56) {
    const y = 1 - (e - x);
    return (k === 1024 ? y * 2.0 * 8.98846567431158e307 : y * twopk) - 1;
  }
  if (k < 20) return (fromWords(0x3ff00000 - (0x200000 >> k), 0) - (e - x)) * twopk;
  return (x - (e + fromWords((0x3ff - k) << 20, 0)) + 1) * twopk;
}

export function tanh(x: number): number {
  const jx = highWord(x);
  const ix = jx & 0x7fffffff;
  if (ix >= 0x7ff00000) return jx >= 0 ? 1 / x + 1 : 1 / x - 1;
  let z: number;
  if (ix < 0x40360000) {
    if (ix < 0x3e300000) return x;
    if (ix >= 0x3ff00000) {
      const t = expm1(2 * Math.abs(x));
      z = 1 - 2 / (t + 2);
    } else {
      const t = expm1(-2 * Math.abs(x));
      z = -t / (t + 2);
    }
  } else {
    z = 1 - TINY;
  }
  return jx >= 0 ? z : -z;
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

export function log(value: number): number {
  let x = value;
  let hx = highWord(x);
  const lx = lowWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;
    const r = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - r : k * LN2_HI - (r - k * LN2_LO - f);
  }
  const s = f / (2.0 + f);
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i |= j;
  const r = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + r)) : k * LN2_HI - (hfsq - (s * (hfsq + r) + k * LN2_LO) - f);
  }
  return k === 0 ? f - s * (f - r) : k * LN2_HI - (s * (f - r) - k * LN2_LO - f);
}

/** log(1 + f) - f + f*f/2 for 1 + f in [sqrt(2)/2, sqrt(2)], the core log2 builds on. */
function kernelLog1p(f: number): number {
  const s = f / (2.0 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const hfsq = 0.5 * f * f;
  return s * (hfsq + (t2 + t1));
}

const IVLN2HI = 1.44269504072144627571;
const IVLN2LO = 1.67517131648865118353e-10;

export function log2(value: number): number {
  let x = value;
  let hx = highWord(x);
  const lx = lowWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx === 0x3ff00000 && lx === 0) return 0;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1.0;
  const hfsq = 0.5 * f * f;
  const r = kernelLog1p(f);
  const hi = withLowWord(f - hfsq, 0);
  const lo = f - hi - hfsq + r;
  const valHi = hi * IVLN2HI;
  let valLo = (lo + hi) * IVLN2LO + lo * IVLN2HI;
  const w = k + valHi;
  valLo += k - w + valHi;
  return valLo + w;
}

const IVLN10 = 4.34294481903251816668e-1;
const LOG10_2HI = 3.01029995663611771306e-1;
const LOG10_2LO = 3.69423907715893078616e-13;

export function log10(value: number): number {
  let x = value;
  let hx = highWord(x);
  let lx = lowWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
    lx = lowWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx === 0x3ff00000 && lx === 0) return 0;
  k += (hx >> 20) - 1023;
  const i = k < 0 ? 1 : 0;
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  const y = k + i;
  x = fromWords(hx, lx);
  const z = y * LOG10_2LO + IVLN10 * log(x);
  return z + y * LOG10_2HI;
}

const BP1 = 1.5;
const DP_H1 = 5.84962487220764160156e-1;
const DP_L1 = 1.35003920212974897128e-8;
const TWO53 = 9007199254740992.0;
const POW_L1 = 5.99999999999994648725e-1;
const POW_L2 = 4.28571428578550184252e-1;
const POW_L3 = 3.33333329818377432918e-1;
const POW_L4 = 2.72728123808534006489e-1;
const POW_L5 = 2.30660745775561754067e-1;
const POW_L6 = 2.06975017800338417784e-1;
const LG2_FULL = 6.93147180559945286227e-1;
const LG2_H = 6.93147182464599609375e-1;
const LG2_L = -1.90465429995776804525e-9;
const OVT = 8.008566259537294e-17;
const CP = 9.61796693925975554329e-1;
const CP_H = 9.61796700954437255859e-1;
const CP_L = -7.02846165095275826516e-9;
const IVLN2 = 1.442695040888963387;
const IVLN2_H = 1.44269502162933349609;
const IVLN2_L = 1.92596299112661746887e-8;

/** x to the power y: the portable `**`. */
export function pow(x: number, y: number): number {
  const hx = highWord(x);
  const lx = lowWord(x);
  const hy = highWord(y);
  const ly = lowWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return 1;
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return x + y;

  // When x < 0: 0 when y is not an integer, 1 when it is an odd one, 2 when an even one.
  let yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) {
      yisint = 2;
    } else if (iy >= 0x3ff00000) {
      const e = (iy >> 20) - 0x3ff;
      if (e > 20) {
        const j = ly >>> (52 - e);
        if (j << (52 - e) === (ly | 0)) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        const j = iy >> (20 - e);
        if (j << (20 - e) === iy) yisint = 2 - (j & 1);
      }
    }
  }

  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if (((ix - 0x3ff00000) | lx) === 0) return y - y;
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy < 0 ? -y : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x;
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x);
  }

  let ax = Math.abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    let z = hy < 0 ? 1 / ax : ax;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN;
      else if (yisint === 1) z = -z;
    }
    return z;
  }

  let n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN;
  const s = (n | (yisint - 1)) === 0 ? -1 : 1;

  let t1: number;
  let t2: number;
  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? HUGE * HUGE : TINY * TINY;
      if (ix >= 0x3ff00000) return hy > 0 ? HUGE * HUGE : TINY * TINY;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * HUGE * HUGE : s * TINY * TINY;
    if (ix > 0x3ff00000) return hy > 0 ? s * HUGE * HUGE : s * TINY * TINY;
    const t = ax - 1;
    const w = t * t * (0.5 - t * (0.3333333333333333 - t * 0.25));
    const u = IVLN2_H * t;
    const v = t * IVLN2_L - w * IVLN2;
    t1 = withLowWord(u + v, 0);
    t2 = v - (t1 - u);
  } else {
    n = 0;
    if (ix < 0x00100000) {
      ax *= TWO53;
      n -= 53;
      ix = highWord(ax);
    }
    n += (ix >> 20) - 0x3ff;
    const j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    let k = 0;
    if (j <= 0x3988e) {
      k = 0;
    } else if (j < 0xbb67a) {
      k = 1;
    } else {
      n += 1;
      ix -= 0x00100000;
    }
    ax = withHighWord(ax, ix);
    const bp = k === 0 ? 1.0 : BP1;
    const dpH = k === 0 ? 0 : DP_H1;
    const dpL = k === 0 ? 0 : DP_L1;

    let u = ax - bp;
    let v = 1 / (ax + bp);
    const ss = u * v;
    const sH = withLowWord(ss, 0);
    let tH = fromWords(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    let tL = ax - (tH - bp);
    const sL = v * (u - sH * tH - sH * tL);
    let s2 = ss * ss;
    let r = s2 * s2 * (POW_L1 + s2 * (POW_L2 + s2 * (POW_L3 + s2 * (POW_L4 + s2 * (POW_L5 + s2 * POW_L6)))));
    r += sL * (sH + ss);
    s2 = sH * sH;
    tH = withLowWord(3.0 + s2 + r, 0);
    tL = r - (tH - 3.0 - s2);
    u = sH * tH;
    v = sL * tH + tL * ss;
    const pH = withLowWord(u + v, 0);
    const pL = v - (pH - u);
    const zH = CP_H * pH;
    const zL = CP_L * pH + pL * CP + dpL;
    t1 = withLowWord(zH + zL + dpH + n, 0);
    t2 = zL - (t1 - n - dpH - zH);
  }

  const y1 = withLowWord(y, 0);
  const pL = (y - y1) * t1 + y * t2;
  let pH = y1 * t1;
  let z = pL + pH;
  let j = highWord(z);
  const i = lowWord(z);
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * HUGE * HUGE;
    if (pL + OVT > z - pH) return s * HUGE * HUGE;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if (((j - 0xc090cc00) | i) !== 0) return s * TINY * TINY;
    if (pL <= z - pH) return s * TINY * TINY;
  }

  const absHigh = j & 0x7fffffff;
  let k = (absHigh >> 20) - 0x3ff;
  n = 0;
  if (absHigh > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    pH -= t;
  }
  let t = withLowWord(pL + pH, 0);
  const u = t * LG2_H;
  const v = (pL - (t - pH)) * LG2_FULL + t * LG2_L;
  z = u + v;
  const w = v - (z - u);
  t = z * z;
  t1 = z - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
  const r = (z * t1) / (t1 - 2 - (w + z * w));
  z = 1 - (r - z);
  j = highWord(z) + (n << 20);
  z = j >> 20 <= 0 ? scalbn(z, n) : withHighWord(z, j);
  return s * z;
}

const TWO_OVER_PI = [
  0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62, 0x95993c, 0x439041, 0xfe5163, 0xabdebb, 0xc561b7, 0x246e3a, 0x424dd2,
  0xe00649, 0x2eea09, 0xd1921c, 0xfe1deb, 0x1cb129, 0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c, 0x7026b4, 0x5f7e41, 0x3991d6, 0x398353,
  0x39f49c, 0x845f8b, 0xbdf928, 0x3b1ff8, 0x97ffde, 0x05980f, 0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf, 0x27cb09, 0xb74f46, 0x3f669e,
  0x5fea2d, 0x7527ba, 0xc7ebe5, 0xf17b3d, 0x0739f7, 0x8a5292, 0xea6bfb, 0x5fb11f, 0x8d5d08, 0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20,
  0x9af436, 0x1da9e3, 0x91615e, 0xe61b08, 0x659985, 0x5f14a0, 0x68408d, 0xffd880, 0x4d7327, 0x310606, 0x1556ca, 0x73a8c9, 0x60e27b,
  0xc08c6b,
];
const NPIO2_HW = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c,
  0x4032d97c, 0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a, 0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c,
  0x4042106c, 0x4042d97c, 0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb,
];
const PIO2_PARTS = [
  1.57079625129699707031, 7.54978941586159635335e-8, 5.39030252995776476554e-15, 3.28200341580791294123e-22, 1.27065575308067607349e-29,
  1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51,
];
const TWO24 = 1.6777216e7;
const TWON24 = 5.9604644775390625e-8;
const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;

/** The remainder of the last reduction by pi/2, as head and tail. */
let reducedHead = 0;
let reducedTail = 0;

const at = (values: readonly number[], index: number): number => values[index] ?? 0;

/**
 * Reduces |x| >= 2^19 * pi/2 by pi/2 with 2/pi's digits as 24-bit chunks (fdlibm's
 * __kernel_rem_pio2 at double precision). `tx` is x/2^e0 cut into 24-bit integers.
 */
function reduceHugeByHalfPi(tx: readonly number[], e0: number): number {
  const jk = 4;
  const jx = tx.length - 1;
  const jv = Math.max(0, Math.trunc((e0 - 3) / 24));
  let q0 = e0 - 24 * (jv + 1);
  const f: number[] = [];
  const q: number[] = [];
  const fq: number[] = [];
  const iq: number[] = [];
  for (let i = 0, j = jv - jx; i <= jx + jk; i++, j++) f[i] = j < 0 ? 0 : at(TWO_OVER_PI, j);
  const termOf = (i: number) => {
    let fw = 0;
    for (let j = 0; j <= jx; j++) fw += at(tx, j) * at(f, jx + i - j);
    return fw;
  };
  for (let i = 0; i <= jk; i++) q[i] = termOf(i);

  let jz = jk;
  for (;;) {
    let z = at(q, jz);
    for (let i = 0, j = jz; j > 0; i++, j--) {
      const fw = (TWON24 * z) | 0;
      iq[i] = (z - TWO24 * fw) | 0;
      z = at(q, j - 1) + fw;
    }
    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    let n = z | 0;
    z -= n;
    let ih = 0;
    if (q0 > 0) {
      const top = at(iq, jz - 1) >> (24 - q0);
      n += top;
      iq[jz - 1] = at(iq, jz - 1) - (top << (24 - q0));
      ih = at(iq, jz - 1) >> (23 - q0);
    } else if (q0 === 0) {
      ih = at(iq, jz - 1) >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }
    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (let i = 0; i < jz; i++) {
        const j = at(iq, i);
        if (carry === 0) {
          if (j !== 0) {
            carry = 1;
            iq[i] = 0x1000000 - j;
          }
        } else {
          iq[i] = 0xffffff - j;
        }
      }
      if (q0 === 1) iq[jz - 1] = at(iq, jz - 1) & 0x7fffff;
      else if (q0 === 2) iq[jz - 1] = at(iq, jz - 1) & 0x3fffff;
      if (ih === 2) {
        z = 1 - z;
        if (carry !== 0) z -= scalbn(1, q0);
      }
    }
    if (z === 0) {
      let j = 0;
      for (let i = jz - 1; i >= jk; i--) j |= at(iq, i);
      if (j === 0) {
        let k = 1;
        while (jk >= k && at(iq, jk - k) === 0) k++;
        for (let i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = at(TWO_OVER_PI, jv + i);
          q[i] = termOf(i);
        }
        jz += k;
        continue;
      }
    }

    if (z === 0) {
      jz -= 1;
      q0 -= 24;
      while (at(iq, jz) === 0) {
        jz--;
        q0 -= 24;
      }
    } else {
      z = scalbn(z, -q0);
      if (z >= TWO24) {
        const fw = (TWON24 * z) | 0;
        iq[jz] = (z - TWO24 * fw) | 0;
        jz += 1;
        q0 += 24;
        iq[jz] = fw;
      } else {
        iq[jz] = z | 0;
      }
    }

    let fw = scalbn(1, q0);
    for (let i = jz; i >= 0; i--) {
      q[i] = fw * at(iq, i);
      fw *= TWON24;
    }
    for (let i = jz; i >= 0; i--) {
      fw = 0;
      for (let k = 0; k <= jk && k <= jz - i; k++) fw += at(PIO2_PARTS, k) * at(q, i + k);
      fq[jz - i] = fw;
    }
    fw = 0;
    for (let i = jz; i >= 0; i--) fw += at(fq, i);
    reducedHead = ih === 0 ? fw : -fw;
    fw = at(fq, 0) - fw;
    for (let i = 1; i <= jz; i++) fw += at(fq, i);
    reducedTail = ih === 0 ? fw : -fw;
    return n & 7;
  }
}

/** x less the nearest multiple n of pi/2, into reducedHead + reducedTail; answers n. */
function reduceByHalfPi(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    reducedHead = x;
    reducedTail = 0;
    return 0;
  }
  if (ix < 0x4002d97c) {
    const sign = hx > 0 ? 1 : -1;
    // Within 3pi/4: 33+53 bits of pi are enough, except near pi/2 itself.
    let z = x - sign * PIO2_1;
    if (ix !== 0x3ff921fb) {
      reducedHead = z - sign * PIO2_1T;
      reducedTail = z - reducedHead - sign * PIO2_1T;
    } else {
      z -= sign * PIO2_2;
      reducedHead = z - sign * PIO2_2T;
      reducedTail = z - reducedHead - sign * PIO2_2T;
    }
    return sign;
  }
  if (ix <= 0x413921fb) {
    let t = Math.abs(x);
    const n = (t * INVPIO2 + 0.5) | 0;
    let r = t - n * PIO2_1;
    let w = n * PIO2_1T;
    reducedHead = r - w;
    if (n >= 32 || ix === NPIO2_HW[n - 1]) {
      const j = ix >> 20;
      let i = j - ((highWord(reducedHead) >> 20) & 0x7ff);
      if (i > 16) {
        t = r;
        w = n * PIO2_2;
        r = t - w;
        w = n * PIO2_2T - (t - r - w);
        reducedHead = r - w;
        i = j - ((highWord(reducedHead) >> 20) & 0x7ff);
        if (i > 49) {
          t = r;
          w = n * PIO2_3;
          r = t - w;
          w = n * PIO2_3T - (t - r - w);
          reducedHead = r - w;
        }
      }
    }
    reducedTail = r - reducedHead - w;
    if (hx >= 0) return n;
    reducedHead = -reducedHead;
    reducedTail = -reducedTail;
    return -n;
  }
  const e0 = (ix >> 20) - 1046;
  let z = fromWords(ix - (e0 << 20), lowWord(x));
  const tx: number[] = [];
  for (let i = 0; i < 2; i++) {
    tx[i] = z | 0;
    z = (z - at(tx, i)) * TWO24;
  }
  tx[2] = z;
  while (tx.length > 1 && tx[tx.length - 1] === 0) tx.pop();
  const n = reduceHugeByHalfPi(tx, e0);
  if (hx >= 0) return n;
  reducedHead = -reducedHead;
  reducedTail = -reducedTail;
  return -n;
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

/** cos(x + y) for |x| <= pi/4, y the tail of x. */
function kernelCos(x: number, y: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  return 1 - qx - (0.5 * z - qx - (z * r - x * y));
}

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** sin(x + y) for |x| <= pi/4, y the tail of x; `hasTail` false when y is 0. */
function kernelSin(x: number, y: number, hasTail: boolean): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return x;
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (!hasTail) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

export function sin(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, false);
  if (ix >= 0x7ff00000) return x - x;
  switch (reduceByHalfPi(x) & 3) {
    case 0:
      return kernelSin(reducedHead, reducedTail, true);
    case 1:
      return kernelCos(reducedHead, reducedTail);
    case 2:
      return -kernelSin(reducedHead, reducedTail, true);
    default:
      return -kernelCos(reducedHead, reducedTail);
  }
}

export function cos(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  switch (reduceByHalfPi(x) & 3) {
    case 0:
      return kernelCos(reducedHead, reducedTail);
    case 1:
      return -kernelSin(reducedHead, reducedTail, true);
    case 2:
      return -kernelCos(reducedHead, reducedTail);
    default:
      return kernelSin(reducedHead, reducedTail, true);
  }
}

const PIO2_HI = 1.570796326794896558;
const PIO2_LO = 6.12323399573676603587e-17;
const PIO4_HI = 7.85398163397448278999e-1;
const PS0 = 1.66666666666666657415e-1;
const PS1 = -3.25565818622400915405e-1;
const PS2 = 2.01212532134862925881e-1;
const PS3 = -4.00555345006794114027e-2;
const PS4 = 7.91534994289814532176e-4;
const PS5 = 3.4793310759602116757e-5;
const QS1 = -2.40339491173441421878;
const QS2 = 2.02094576023350569471;
const QS3 = -6.8828397160545329303e-1;
const QS4 = 7.70381505559019352791e-2;

export function asin(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | lowWord(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
    return NaN;
  }
  if (ix < 0x3fe00000) {
    if (ix < 0x3e400000) return x;
    const t = x * x;
    const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    return x + x * (p / q);
  }
  const w = 1 - Math.abs(x);
  const t = w * 0.5;
  const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
  const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
  const s = Math.sqrt(t);
  let result: number;
  if (ix >= 0x3fef3333) {
    result = PIO2_HI - (2.0 * (s + s * (p / q)) - PIO2_LO);
  } else {
    const head = withLowWord(s, 0);
    const c = (t - head * head) / (s + head);
    const r = p / q;
    result = PIO4_HI - (2.0 * s * r - (PIO2_LO - 2.0 * c) - (PIO4_HI - 2.0 * head));
  }
  return hx > 0 ? result : -result;
}

/** The length of the vector of `values`, as V8's Math.hypot sums it: scaled by the largest, with Kahan's compensation. */
export function hypot(...values: number[]): number {
  let max = 0;
  let hasNaN = false;
  for (const value of values) {
    if (Number.isNaN(value)) hasNaN = true;
    else max = Math.max(max, Math.abs(value));
  }
  if (max === Infinity) return Infinity;
  if (hasNaN) return NaN;
  if (max === 0) return 0;
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const n = Math.abs(value) / max;
    const summand = n * n - compensation;
    const preliminary = sum + summand;
    compensation = preliminary - sum - summand;
    sum = preliminary;
  }
  return Math.sqrt(sum) * max;
}
