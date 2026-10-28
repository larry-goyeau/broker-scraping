// What one round trip costs at Ersparniskasse Schaffhausen: buy n shares
// on SIX Swiss Exchange in e-banking (Solo, no advice) and sell them
// straight back, in dollars. The SIX book, the Swiss stamp, the SIX
// exchange fee, taxMap and the FX rule come from ../migros/sixCost.mjs;
// this file gives the bank's courtage and its currencies.
//
// Read on 2026-10-26:
//   https://www.ersparniskasse.ch/documents/d/eks/eksh_broschuere_a5_anlagegeschaeft_konditionen
//     (Anlagegeschäft, Konditionen und Preisübersicht, 05/2026)
//   https://www.ersparniskasse.ch/documents/d/eks/eksh_fs_anlegen_solo
//     Anlageberatung Solo, "Kauf und Verkauf Aktien, Optionsscheine, ETF
//     und ähnliche Papiere", "In der Schweiz gehandelt":
//       bis zu CHF 50'000              1.10 %
//       für die nächsten CHF 50'000    0.95 %
//       für die nächsten CHF 50'000    0.85 %
//       für die nächsten CHF 50'000    0.75 %
//       für die nächsten CHF 50'000    0.65 %
//       Minimum                        CHF 80
//     "Auf Börsenaufträge, die selbst per e-Banking erteilt werden,
//     gewähren wir einen Courtagerabatt von 50 %. Die Minimumansätze werden
//     ebenfalls um 50 % reduziert. Börsenabgaben und eidg. Steuern werden
//     separat verrechnet."
//     Basisgebühr (Solo) 0.35 % a year on the deposit, minimum CHF 120,
//     charged quarterly (remark).
//   https://www.ersparniskasse.ch/de/fremdwaehrungskonto
//     Eurokonto, and a Fremdwährungskonto for "Zahlungs- und
//     Wertschriftenverkehr in verschiedenen Fremdwährungen ohne laufende
//     Umrechnung": USD, GBP, DKK, NOK, SEK, JPY, AUD, CAD, NZD, HKD, ZAR,
//     SGD, THB, TRY.
//
// Commission, one side: the slices above at half rate (0.55 %, 0.475 %,
// 0.425 %, 0.375 %, 0.325 %), cumulated ("für die nächsten"), minimum
// CHF 40. The tariff prints slices up to CHF 250,000 only; a larger order
// is unknown. The band is set on the amount in CHF.
//
// FX: every currency of the SIX book is a deposit currency, so nothing is
// converted. No markup is printed, so there is no FX remark.
//
// Left out: the "Im Ausland gehandelt" column (other exchanges), bonds,
// structured products, partner funds, 0.10 % custody on foreign titles
// held abroad, VAT on the Basisgebühr.
//
//   node brokers/ersparniskassesc/ersparniskassesc_cost.mjs NESN XSWX CHF --shares=12 --price=80
//   node brokers/ersparniskassesc/ersparniskassesc_cost.mjs CSSPX XSWX USD --shares=2 --price=650
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced, pctFr } from "../migros/sixCost.mjs";

const PAGE = "https://www.ersparniskasse.ch/documents/d/eks/eksh_broschuere_a5_anlagegeschaeft_konditionen";
const SOLO = "https://www.ersparniskasse.ch/documents/d/eks/eksh_fs_anlegen_solo";
const ACCOUNTS = "https://www.ersparniskasse.ch/de/fremdwaehrungskonto";
const DISCOUNT = 0.5;
const LIST = [
  { upTo: 50000, rate: 0.011 },
  { upTo: 100000, rate: 0.0095 },
  { upTo: 150000, rate: 0.0085 },
  { upTo: 200000, rate: 0.0075 },
  { upTo: 250000, rate: 0.0065 },
];
const SLICES = LIST.map((b) => ({ upTo: b.upTo, rate: b.rate * DISCOUNT }));
const MIN = 80 * DISCOUNT;
const LAST = LIST[LIST.length - 1].upTo;

export const roundTrip = makeRoundTrip({
  folder: "ersparniskassesc",
  brand: "Ersparniskasse Schaffhausen",
  catalogue: new URL("ersparniskassesc-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "DKK", "NOK", "SEK", "JPY", "AUD", "CAD", "NZD", "HKD", "ZAR", "SGD", "THB", "TRY"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.35% a year (min CHF 120).",
  sources: { solo: SOLO, accounts: ACCOUNTS },
  commission: ({ amountChf }) => {
    const basis =
      `Solo, ordre saisi en e-banking (rabais de 50 % sur la courtage et le minimum) : ` +
      SLICES.map((b) => `${pctFr(b.rate)} %`).join(" / ") +
      ` par tranches de CHF 50 000 cumulées, minimum CHF ${MIN}.`;
    if (amountChf > LAST) {
      return { chf: null, rate: SLICES[0].rate, min: MIN, basis: `${basis} Au-delà de CHF ${LAST} le tarif ne publie pas de taux.` };
    }
    return {
      chf: sliced(SLICES, amountChf, MIN),
      rate: SLICES[0].rate,
      min: MIN,
      basis,
      confidence: "tarif par tranches publié, rabais e-banking appliqué au taux et au minimum",
    };
  },
});

cli(import.meta.url, roundTrip);
