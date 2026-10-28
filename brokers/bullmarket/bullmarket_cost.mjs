// What one round trip costs at Bull Market Brokers (Bull Market Brokers
// S.A., ALyC Propio n° 247 CNV): buy n shares at price p and sell them back,
// in dollars, ordered online (web or app, "operatoria autogestionada"). Two
// places from one account: BYMA (Buenos Aires shares and CEDEARs, ETF
// certificates included; peso, MEP (D) and cable (C) lines) and the US
// (NYSE, NYSE Arca and Nasdaq shares, ADRs and ETFs, in dollars).
//
// Read on 2026-10-26. "Tabla de Aranceles y Comisiones", "Actualización:
// Mayo 2026", "Comisiones por operatoria autogestionada online (WEB y/o
// APP)":
//   https://s3-sa-east-1.amazonaws.com/bmb.s3.webbucket/System/Files/Tarifario.pdf
//   https://bullmarket.com.ar/aranceles/   ("Sin comisiones mínimas")
//
//   Mercado Local, "Acciones y CEDEARs": Digital Account 0,50 %, "Derecho
//   de Mercado 0,070 %"; "Trading intradiario*" 0,25 % and 0,055 %.
//   Mercado Internacional, "Acciones, ADRs y ETFs": Digital Account 0,50 %,
//   "Derecho de Mercado 0,00 %".
//   "(1) Digital Account: corresponde a las comisiones normales, sin
//   bonificación." The other columns are levels the account reaches by
//   itself, not subscriptions: Active Trader (over $ 5,000,000 traded the
//   month before) 0.25 %, Active Trader Plus (over $ 25,000,000) 0.10 %,
//   Wealth Management (over USD 100,000 invested) 0.40 %, Wealth Management
//   Premium (over USD 250,000) 0.25 %, the same on both tables. The figure
//   is Digital Account; the best level is the remark.
//   "A todos los aranceles y comisiones se debe aplicar el IVA, exceptuando
//   Títulos Públicos, Letras del Tesoro y Obligaciones Negociables": 21 %
//   on the commission and on the printed market rights. "En caso de
//   operaciones en dólares, la comisión y otros costos asociados se cobran
//   en dólares."
//   "*Trading Intradiario | Bonificación del 50% en compras y ventas en el
//   mismo día, mismo título, misma cantidad, misma moneda e igual plazo de
//   liquidación. ... No aplica a Dólar MEP ... ni para Activos USA": the
//   figure assumes another day; the remark is the cut on a BYMA line's
//   commission: 0.50 → 0.25 % = 50 % lower (the market rights' 0.070 →
//   0.055 % is BYMA's, not the commission). The Active Trader Plus level is
//   0.50 → 0.10 % = 80 % lower.
//
// Formula, each side.
//   BYMA  0.50 % × notional × 1.21 + 0.070 % × notional × 1.21
//   US    0.50 % × notional × 1.21; no SEC, TAF or CAT printed (0)
// plus the book (BYMA's own; on the US, the quoted NBBO: Bull Market names
// no US dealer, and its Miami affiliate cites several custodians), and a
// tax when taxMap.mjs names one (none).
// Left out: dividends (1 %), CEDEAR / ADR conversions, transfers abroad
// (USD 100), the Matriz platform fee, and phone orders (1 %, min $ 100).
//
// Cash: pesos and dollars (deposits.mjs ARS, USD); a line settles in its
// own currency and no FX enters the number. The remark is the MEP half
// spread on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/bullmarket/bullmarket_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/bullmarket/bullmarket_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bullmarket/bullmarket_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/bullmarket/bullmarket_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "./arUsCost.mjs";

const URL_PDF = "https://s3-sa-east-1.amazonaws.com/bmb.s3.webbucket/System/Files/Tarifario.pdf";
// Active Trader Plus against Digital Account, as a cut of the commission.
const TIER = "Fees might be 80% lower if the account traded over ARS 25 million the month before.";

const file = arUsCostFile({
  folder: "bullmarket",
  name: "Bull Market",
  catalogue: new URL("bullmarket-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: URL_PDF,
      page: "https://bullmarket.com.ar/aranceles/",
      readOn: "2026-10-26",
      inForce: "2026-05",
      entity: "Bull Market Brokers S.A. (ALyC Propio n° 247)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.005 },
    vatOnCommission: true,
    market: 0.0007,
    marketVat: true,
    basis: "tableau de mai 2026, Digital Account en ligne : 0,50 % + IVA par sens, sans minimum ; droits de marché imprimés 0,070 % + IVA",
    remark: `Same day sell fees are 50% lower. ${TIER}`,
    notes: ["niveaux Active Trader / Wealth Management : remarque ; intrajournalier : remarque"],
  },
  us: {
    rate: 0.005,
    vat: true,
    url: URL_PDF,
    readOn: "2026-10-26",
    basis: "tableau de mai 2026, Mercado Internacional « Acciones, ADRs y ETFs », Digital Account : 0,50 % + IVA par sens, droits de marché 0,00 %",
    remark: TIER,
    notes: ["Bull Market ne nomme pas de courtier américain : NBBO coté", "SEC, TAF et CAT non imprimées : 0", "le rabais intrajournalier ne vise pas les « Activos USA »"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
