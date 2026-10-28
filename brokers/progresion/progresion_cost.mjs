// What one round trip costs at Progresión SCB (Progresión Sociedad
// Comisionista de Bolsa S.A., Colombia): buy n shares at price p on the
// Bolsa de Valores de Colombia (local market or Mercado Global Colombiano,
// all in pesos) in its online platform Trader Pro, sell them back at once,
// in dollars.
//
// Tariff read 2026-10-26 (in force from 18 April 2026), page 4,
// "TARIFAS CLIENTES TRADER PRO", "Valor Operación" → "Valor Comisión":
//   https://www.progresion.com.co/wp-content/uploads/2026/09/Tarifario-2026-1.pdf
//     COP 0 - 2.000.000             "$ 15.000 + IVA"
//     COP 2.000.001 - 5.000.000     "0.40% + IVA"
//     COP 5.000.001 - 10.000.000    "0.35% + IVA"
//     COP 10.000.001 - 50.000.000   "0.30% + IVA"
//     COP 50.000.001 - En adelante  "0.25% + IVA"
//   The band of the order's value gives the rate on the whole order, on the
//   buy and on the sell. Read as printed: from 2 million the 0.40 % band is
//   below the COP 15,000 flat fee (COP 8,000 at 2,000,001); no floor is
//   printed for it.
// IVA: 19 %, the general rate (Estatuto Tributario, art. 468).
// No BVC, Deceval or other market line is printed: 0, as in
// brokers/valores and brokers/triico.
//
// Left out:
// - The adviser desk ("RENTA VARIABLE", COP 95,800 to 301,500 + IVA and
//   "Comisión del 1% al 3% + IVA") is not the online price.
// - "Administración Valores" (COP 7,900 to 22,100 + IVA a month): "Clientes
//   que operen mensualmente a través de Trader Pro no pagan administración".
// - GMF (4 per 1,000) on withdrawals and the ACH/cheque fees: money
//   movements, not the trade.
//
// Money: the account takes pesos (PSE, Baloto, cash networks) and every
// line in the catalogue is in pesos on XBOG, so no conversion. Book: the
// BVC's own leaf (spreads/bvc-touch.mjs).
//
// Formula: book + 2 × rate(band of n × p) × n × p × 1.19
//          (rate = COP 15,000 flat up to COP 2,000,000).
//
//   node brokers/progresion/progresion_cost.mjs ECOPETROL BVC COP --shares=2000 --price=2000
//   node brokers/progresion/progresion_cost.mjs PFCIBEST BVC COP --shares=100 --price=40000
//   node brokers/progresion/progresion_cost.mjs MSFTCO BVC COP --shares=1 --price=1500000
//
// `roundTrip(...)` reads files, not the network.

import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";

const PAGE = "https://www.progresion.com.co/wp-content/uploads/2026/09/Tarifario-2026-1.pdf";
const READ_ON = "2026-10-26";
const IVA = 0.19;

// [upper bound of the order value in COP, flat fee or null, rate or null]
const BANDS = [
  [2_000_000, 15_000, null],
  [5_000_000, null, 0.004],
  [10_000_000, null, 0.0035],
  [50_000_000, null, 0.003],
  [Infinity, null, 0.0025],
];

const fr = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");

/** One Trader Pro order on the BVC, pesos, IVA included. */
export function traderProOrder(notional) {
  const [, flat, rate] = BANDS.find(([top]) => notional <= top);
  return (flat ?? notional * rate) * (1 + IVA);
}

export const roundTrip = makeLineCost({
  folder: "progresion",
  name: "Progresión",
  catalogue: new URL("progresion-parsed.json", import.meta.url),
  url: PAGE,
  base: "COP",
  price: ({ listing, notional }) => {
    if (listing.mic !== "XBOG" || listing.currency !== "COP") {
      return { buy: null, sell: null, why: `Progresión ne publie aucun tarif Trader Pro pour ${listing.exchange} en ${listing.currency}` };
    }
    const [top, flat, rate] = BANDS.find(([upper]) => notional <= upper);
    const each = traderProOrder(notional);
    return {
      buy: each,
      sell: each,
      feeCurrency: "COP",
      basis:
        `tarifario Progresión 2026 (en vigueur le 18 avril 2026), relu le ${READ_ON}, « TARIFAS CLIENTES TRADER PRO » : ` +
        "15 000 COP + IVA jusqu'à 2 000 000 COP, puis 0,40 %, 0,35 %, 0,30 % et 0,25 % + IVA selon la tranche de l'ordre, " +
        "à l'achat et à la vente ; IVA 19 % ; aucun droit de bourse refacturé ; administration de titres offerte aux clients actifs sur Trader Pro",
      confidence:
        `${fr(each, 0)} COP par ordre (` +
        (flat != null ? "forfait 15 000 COP" : `${fr(rate * 100)} % de ${fr(notional, 0)} COP, tranche ≤ ${top === Infinity ? "∞" : fr(top, 0)}`) +
        ", IVA comprise)",
      detail: { flat, rate, iva: IVA, band: top === Infinity ? null : top },
    };
  },
});

printLineCli(roundTrip, import.meta.url);
