// Do the places agree? A fund quoted on two exchanges in the same currency should cost
// about the same to round trip on either, so the ratio of the two published figures is
// a test of the conversion `spread.mjs` applies to each source — and the only test
// available, since the sources publish different grandeurs and no exchange publishes
// what a retail order actually pays.
//
// Same currency on both sides, always. The euro line of a fund on Xetra and its dollar
// line in London are two books with two different sets of participants, and their costs
// differ for reasons that have nothing to do with the conversion: on a sample taken at
// the London close the cross-currency ratio ran from 0.19 to 16, which measures the
// books rather than the arithmetic.
//
//   node spread-calibrate.mjs
//   node spread-calibrate.mjs --min-readings=2   -- ignore single-snapshot figures
//   node spread-calibrate.mjs --cross-currency   -- include the noisy comparison too
//
// Xetra is the reference because it is the only source with real round trips measured
// against it. A median ratio of 1 means the two places are on one scale.
//
// What a ratio above 1 is not, however, is the factor to divide that source by. This
// script compares a touch snapshot with a monthly XLM, so the ratio it reports mixes a
// difference of books with a difference of methods, and the second dominates. Reading
// the Xetra book live and comparing it with London and Zurich within the same minute —
// `probe-xetra-touch.mjs`, 66 funds — put the difference of books at 1.18 while this
// script was reporting 1.74 on the same pairs. The gap sits in the Xetra conversion:
// the live touch came to 0.61 of XLM rather than the 0.50 published, quartiles 0.42 and
// 0.79, and by liquidity 0.77 down to 0.52. Dividing London by 1.61 and Zurich by 1.90
// on the strength of the table below would therefore move two sound figures to fix one
// approximate one. Run that probe before touching a factor.

import fs from "node:fs";
import { listingKey, VENUES } from "./venues.mjs";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (m) return m[1];
  }
  return "";
};
const MIN_READINGS = Number(arg("min-readings") || 0);
const CROSS_CURRENCY = process.argv.includes("--cross-currency");
const STORE_PATH = arg("store") || "parsed_json/spread.json";
const REFERENCE = "XETR";

const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
const spreads = store.spreads || {};
const state = store.state || {};
const sourceOf = new Map(VENUES.map((v) => [v.mic, v.source]));

// A figure standing on one snapshot is a draw, not an average, and two draws make a
// ratio of two draws. The count comes from the readings kept beside the answer; Xetra
// publishes its own average and has none, which is why it is the reference side.
const readings = (isin, mic, currency) => state[`${isin}|${mic}|${currency}`]?.bp?.length ?? null;
const thin = (isin, mic, currency) => {
  const n = readings(isin, mic, currency);
  return n != null && n < MIN_READINGS;
};

// The name each fund trades under, per place, purely to make the report readable.
const tickers = new Map();
for (const file of fs.readdirSync("parsed_json").filter((f) => f.endsWith("-parsed.json"))) {
  const parsed = JSON.parse(fs.readFileSync(`parsed_json/${file}`, "utf8"));
  for (const row of Array.isArray(parsed) ? parsed : parsed.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    const ticker = String(row.ticker || row.symbol || "").toUpperCase();
    if (!isin || !ticker) continue;
    const { venue } = listingKey(row);
    if (venue?.mic) tickers.set(`${isin}|${venue.mic}`, ticker);
  }
}

const pairs = [];
for (const [isin, byMic] of Object.entries(spreads)) {
  const mics = Object.keys(byMic);
  if (!mics.includes(REFERENCE)) continue;
  for (const mic of mics) {
    if (mic === REFERENCE) continue;
    for (const [currency, { bp }] of Object.entries(byMic[mic])) {
      for (const [refCurrency, { bp: refBp }] of Object.entries(byMic[REFERENCE])) {
        if (!CROSS_CURRENCY && currency !== refCurrency) continue;
        if (!(bp > 0) || !(refBp > 0)) continue;
        if (thin(isin, mic, currency) || thin(isin, REFERENCE, refCurrency)) continue;
        pairs.push({
          isin,
          mic,
          currency,
          bp,
          refCurrency,
          refBp,
          ratio: bp / refBp,
          ticker: tickers.get(`${isin}|${mic}`) || isin,
          n: readings(isin, mic, currency),
        });
      }
    }
  }
}

const quantile = (xs, q) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))];

if (!pairs.length) {
  console.log(
    `aucune paire comparable dans ${STORE_PATH}.\n` +
      `Il en faut un même fonds chiffré sur Xetra et sur une autre place, dans la même devise ; ` +
      `les places au carnet ne se relèvent qu'en séance.`
  );
  process.exit(0);
}

const byMic = {};
for (const p of pairs) (byMic[p.mic] ||= []).push(p);

console.log(
  `${pairs.length} paires comparables, ${Object.keys(byMic).length} place(s) face à Xetra` +
    `${MIN_READINGS ? `, relevés < ${MIN_READINGS} écartés` : ""}` +
    `${CROSS_CURRENCY ? ", devises croisées incluses" : ""}\n`
);
console.log("place    paires   rapport médian   quartiles        source");
console.log("-".repeat(70));
for (const [mic, ps] of Object.entries(byMic).sort((a, b) => b[1].length - a[1].length)) {
  const rs = ps.map((p) => p.ratio);
  console.log(
    `${mic.padEnd(8)} ${String(ps.length).padStart(6)}   ${quantile(rs, 0.5).toFixed(2).padStart(14)}   ` +
      `${`${quantile(rs, 0.25).toFixed(2)} / ${quantile(rs, 0.75).toFixed(2)}`.padEnd(15)}  ` +
      `${sourceOf.get(mic)}`
  );
}

// The extremes are where a mistake would show first, so they are printed rather than
// summarised: a fund that costs ten times more on one place than the other is either a
// thin book worth knowing about or a resolution error worth fixing.
console.log("\nles dix écarts les plus larges");
console.log("ticker    place   devise      place        Xetra      rapport   relevés");
for (const p of [...pairs].sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))).slice(0, 10)) {
  console.log(
    `${p.ticker.padEnd(9)} ${p.mic.padEnd(7)} ${p.currency.padEnd(6)} ` +
      `${`${p.bp.toFixed(2)} bp`.padStart(10)} ${`${p.refBp.toFixed(2)} bp`.padStart(10)}   ` +
      `${p.ratio.toFixed(2).padStart(7)}   ${String(p.n ?? "moy.").padStart(7)}`
  );
}

const all = pairs.map((p) => p.ratio);
console.log(
  `\ntoutes places confondues : rapport médian ${quantile(all, 0.5).toFixed(2)}, ` +
    `quartiles ${quantile(all, 0.25).toFixed(2)} / ${quantile(all, 0.75).toFixed(2)}. ` +
    `Un rapport de 1 veut dire que les places sont sur la même échelle.\n` +
    `Ce rapport compare une touche à un XLM mensuel : la mesure de probe-xetra-touch.mjs ` +
    `attribue 1.18 à l'écart réel entre les carnets et le reste à la conversion de Xetra.`
);
