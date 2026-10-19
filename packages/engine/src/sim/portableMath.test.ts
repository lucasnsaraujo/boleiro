import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { asin, cos, exp, hypot, log, log10, log2, pow, sin, tanh } from "./portableMath.js";

const functions = { exp, log, log2, log10, pow, sin, cos, tanh, asin, hypot };

// x86-64 Node 22's own Math answers (V8 12.4's fdlibm with no fused multiply-adds): the bits these
// functions must give on any engine. Each list starts with an input that arm64 Node answers one bit off.
const EXPECTED: Record<keyof typeof functions, [number[], number][]> = {
  exp: [
    [[1.72767147524193], 5.627534786179009],
    [[-1000], 0],
    [[-745.1], 5e-324],
    [[-700.5], 5.980196118639791e-305],
    [[-20.5], 1.2501528663867426e-9],
    [[-1], 0.36787944117144233],
    [[-0.3], 0.7408182206817179],
    [[1e-10], 1.0000000001],
    [[0.2], 1.2214027581601699],
    [[0.5], 1.6487212707001282],
    [[1], 2.718281828459045],
    [[1.5], 4.4816890703380645],
    [[3.7], 40.4473043600674],
    [[50], 5.184705528587072e+21],
    [[709.7], 1.6549840276802644e+308],
    [[710], Infinity],
  ],
  log: [
    [[1.7469290136068467e-168], -386.2764362259836],
    [[5e-324], -744.4400719213812],
    [[1e-310], -713.8013788281542],
    [[0.00001], -11.512925464970229],
    [[0.5], -0.6931471805599453],
    [[0.999999], -0.000001000000500029089],
    [[1], 0],
    [[1.0000001], 9.999999505838704e-8],
    [[1.4], 0.33647223662121284],
    [[2], 0.6931471805599453],
    [[10], 2.302585092994046],
    [[123456.789], 11.723646487185881],
    [[1e+300], 690.7755278982137],
    [[0], -Infinity],
    [[-1], NaN],
  ],
  log2: [
    [[2.8064153854383445e-28], -91.52525809473094],
    [[1e-310], -1029.7977094150824],
    [[0.1], -3.321928094887362],
    [[1], 0],
    [[3], 1.584962500721156],
    [[8], 3],
    [[1000], 9.965784284662087],
    [[1.5e+200], 664.9705814781936],
  ],
  log10: [
    [[1.4248535842370162], 0.1537702392042515],
    [[1e-310], -310],
    [[0.003], -2.5228787452803374],
    [[1], 0],
    [[7], 0.8450980400142568],
    [[1000], 3],
    [[2.5e+100], 100.39794000867204],
  ],
  pow: [
    [[-1.0215572820695167e-23, 4], 1.089057714791707e-92],
    [[0.5, 0.6666666666666666], 0.6299605249474366],
    [[0.5, 1.75], 0.29730177875068026],
    [[1.08, -12], 0.3971137586459912],
    [[1.2, 0.08333333333333333], 1.0153094704997312],
    [[10, -0.4], 0.3981071705534972],
    [[-2, 3], -8],
    [[-2, 0.5], NaN],
    [[1.01, 5000], 4.04453793552371e+21],
    [[0.95, 33.3], 0.18121579811557748],
    [[2, -1060], 8.095e-320],
    [[1.5, -1800], 1.0857597e-317],
    [[3, 646], 1.6608505280233425e+308],
    [[7, 0.1234], 1.271408463576826],
    [[123.456, 2.5], 169348.16848325965],
    [[1.0000000001, 3000000000], 1.349858841062101],
    [[0, -1], Infinity],
    [[-0, -3], -Infinity],
  ],
  sin: [
    [[1.9309227940781253e+185], -0.6830280374557155],
    [[1e-9], 1e-9],
    [[0.5], 0.479425538604203],
    [[0.785], 0.706825181105366],
    [[2], 0.9092974268256817],
    [[3.14159], 0.00000265358979335273],
    [[-4.5], 0.977530117665097],
    [[100], -0.5063656411097588],
    [[12345.678], -0.7040813137533816],
    [[1000000], -0.34999350217129294],
    [[-35000000], -0.051601838411157],
    [[1e+22], -0.8522008497671888],
    [[1e+300], -0.8178819121159085],
  ],
  cos: [
    [[-1.7641840465205726e+179], -0.5051117749458593],
    [[1e-9], 1],
    [[0.5], 0.8775825618903728],
    [[0.785], 0.7073882691671998],
    [[2], -0.4161468365471424],
    [[3.14159], -0.9999999999964793],
    [[-4.5], -0.2107957994307797],
    [[100], 0.8623188722876839],
    [[12345.678], 0.7101193587160628],
    [[1000000], 0.9367521275331447],
    [[-35000000], 0.998667737674843],
    [[1e+22], 0.523214785395139],
    [[1e+300], -0.5753861119575491],
  ],
  tanh: [
    [[0.035394377207959765], 0.03537960436779528],
    [[1e-10], 1e-10],
    [[0.3], 0.2913126124515909],
    [[-0.7], -0.6043677771171636],
    [[1.5], 0.9051482536448664],
    [[-5], -0.9999092042625951],
    [[21.9], 1],
    [[30], 1],
  ],
  asin: [
    [[0.2031057251748525], 0.20452871971445202],
    [[1e-9], 1e-9],
    [[0.25], 0.25268025514207865],
    [[-0.49], -0.5120897529341477],
    [[0.6], 0.6435011087932844],
    [[-0.9], -1.1197695149986342],
    [[0.98], 1.3704614844717768],
    [[1], 1.5707963267948966],
    [[-1], -1.5707963267948966],
    [[1.5], NaN],
  ],
  hypot: [
    [[3, 4], 5],
    [[0.1, 0.2], 0.223606797749979],
    [[1e+200, 1e+200], 1.414213562373095e+200],
    [[5, 12, 84], 85],
    [[-0, 0], 0],
  ],
};

test("each function answers fdlibm's exact bits, edge cases and huge angles included", () => {
  for (const [name, rows] of Object.entries(EXPECTED)) {
    const fn: (...args: number[]) => number = functions[name as keyof typeof functions];
    for (const [args, expected] of rows) expect([name, args, fn(...args)]).toEqual([name, args, expected]);
  }
});

/** Every other input from raw random bits (any magnitude, infinities and NaN), the rest uniform in [low, high). */
function inputs(count: number, low: number, high: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  let state = 0x9e3779b97f4a7c15n;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    if (i % 2 === 0) {
      view.setBigUint64(0, state);
      values.push(view.getFloat64(0));
    } else {
      values.push(low + ((high - low) * Number(state >> 11n)) / 9007199254740992);
    }
  }
  return values;
}

// NaN's bits differ between CPUs and never reach a save (JSON writes null), so answers are compared as text.
const digest = (values: number[]) => createHash("sha256").update(values.map((v) => (Object.is(v, -0) ? "-0" : String(v))).join(",")).digest("hex").slice(0, 16);

test("ten thousand inputs per function give the same answers as x86-64 Node 22's Math", () => {
  const ranges = { exp: [-750, 750], log: [0, 1e6], log2: [0, 1e6], log10: [0, 1e6], sin: [-100, 100], cos: [-100, 100], tanh: [-25, 25], asin: [-1, 1] } as const;
  const digests: Record<string, string> = {};
  for (const [name, [low, high]] of Object.entries(ranges)) digests[name] = digest(inputs(10_000, low, high).map((x) => functions[name as keyof typeof ranges](x)));
  const bases = inputs(10_000, 0, 50);
  const exponents = inputs(10_000, -30, 30);
  digests.pow = digest(bases.map((base, i) => pow(base, exponents[i] ?? 0)));
  digests.hypot = digest(bases.map((base, i) => hypot(base, exponents[i] ?? 0)));
  expect(digests).toEqual({
    exp: "bb54eaf176b84339",
    log: "8c70d4be88f37969",
    log2: "ebe9946193a6b29f",
    log10: "0d54a61905a4beef",
    sin: "12b8973f39a8f379",
    cos: "8a154e24cb9da8d9",
    tanh: "a8c6ba988a24bf25",
    asin: "fd70160ea72fcb00",
    pow: "e5582cd4c9b5e404",
    hypot: "10a706917108865a",
  });
});
