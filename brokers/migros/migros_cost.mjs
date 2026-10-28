// What one round trip costs at Migros Bank: buy n shares or ETF units on
// SIX Swiss Exchange through E-Banking and sell them straight back, in
// dollars. The SIX book, the federal stamp, the SIX fee, taxMap and the
// conversion are ../migros/sixCost.mjs; this file gives the courtage, the
// account currencies and the bank's FX board.
//
// "Preise für Dienstleistungen", read on 2026-10-26:
//   https://www.migrosbank.ch/dam/jcr:f49f70eb-c052-49ff-92fc-a06630032018/preise_fuer_dienstleistungen_de.2026-06-01-13-26-09.pdf
//   "Aktien und andere Anlagen" (footnote 1: "Aktien, Exchange-Traded Funds
//   (ETFs), Anlagefonds, Obligationen, Strukturierte Produkte ...,
//   Warrants"):
//     "Kauf/Verkauf über E-Banking (wenn verfügbar)   CHF 40"
//     "Zuschlag ab CHF 100'000 Börsenplatz Schweiz (gilt für den gesamten
//     Betrag)   0,020%"
//   "Anfallende Börsengebühren, sowie staatliche Gebühren und Abgaben,
//   werden weiterverrechnet" (the SIX fee and the stamp, in the engine).
//   Custody "Volumen unter CHF 750'000, jährlich 0,230%", "Mindestens
//   jährlich CHF 50 je Depot", plus VAT: a remark.
// So each side is CHF 40, plus 0.02 % of the whole amount from CHF 100,000.
//
// Accounts: the Kontokorrent serves "vom Zahlen von Rechnungen bis zum
// Handel von Wertschriften"; "Gerne führen wir Ihr Kontokorrent in Euro,
// Dollar, Pfund, Yen, sowie weiteren Währungen auf Anfrage" (the price list
// has the columns "Kontokorrent", "Kontokorrent EUR", "Kontokorrent Übrige
// FW"). CHF, EUR, USD, GBP and JPY lines stay unconverted; AUD, CAD and SGD
// ("auf Anfrage") are converted.
//   https://www.migrosbank.ch/de/privatpersonen/konten-karten/konten/kontokorrent.html
// FX: the price list says "Abrechnungen in einer anderen Währung als der
// Kontowährung: Aktueller Devisenkurs", and the bank's FAQ says a booking
// not in the account currency "wird ... automatisch zum Devisenkurs
// gewechselt ... wenn Sie ... Anlagen in Fremdwährungen abwickeln". The
// bank prints that Devisen board (Ankauf / Verkauf) in two bands, "bis CHF
// 50'000" and "bis CHF 250'000"; snapshot 2026-10-26 11:00 below. One way
// vs the mid is (Verkauf - Ankauf) / (Verkauf + Ankauf), as in
// bkssi_cost.mjs. Above CHF 250,000 no rate is printed and the second band
// is used. AUD, CAD and SGD lines convert both ways at that rate; on a
// USD, EUR, GBP or JPY line it is a remark.
//   https://www.migrosbank.ch/de/privatpersonen/konten-karten/noten-devisenkurse.html
//
// Left out: the adviser / Börsen-Hotline price (CHF 100) is not an online
// price; the 0.100 % surcharge is for foreign exchanges; the custody fee
// and the monthly fee for clients domiciled abroad are not per trade.
//
//   node brokers/migros/migros_cost.mjs NESN XSWX CHF --shares=13 --price=77.46
//   node brokers/migros/migros_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/migros/migros_cost.mjs CSUK XSWX GBP --shares=6 --price=130.16
//   node brokers/migros/migros_cost.mjs AUESG XSWX AUD --shares=150 --price=10
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, pctFr } from "./sixCost.mjs";

const PAGE = "https://www.migrosbank.ch/dam/jcr:f49f70eb-c052-49ff-92fc-a06630032018/preise_fuer_dienstleistungen_de.2026-06-01-13-26-09.pdf";
const FX_PAGE = "https://www.migrosbank.ch/de/privatpersonen/konten-karten/noten-devisenkurse.html";
const ONLINE_CHF = 40;
const SURCHARGE_FROM = 100000;
const SURCHARGE = 0.0002;

// Devisen board, CHF per unit (JPY per 100), read 2026-10-26 11:00.
const FX_BOARD = {
  readOn: "2026-10-26",
  upTo50k: {
    EUR: [0.91, 0.942], USD: [0.8105, 0.8415], GBP: [1.079, 1.126], JPY: [0.511, 0.539],
    CAD: [0.578, 0.601], AUD: [0.567, 0.596], SGD: [0.6305, 0.6605],
  },
  upTo250k: {
    EUR: [0.9175, 0.9345], USD: [0.8165, 0.8355], GBP: [1.089, 1.116], JPY: [0.5165, 0.5335],
    CAD: [0.583, 0.596], AUD: [0.572, 0.591], SGD: [0.6355, 0.6555],
  },
};
const oneWay = ([buy, sell]) => (sell - buy) / (sell + buy);
const boardRate = (ccy, amountChf) => {
  const band = amountChf != null && amountChf > 50000 ? FX_BOARD.upTo250k : FX_BOARD.upTo50k;
  return band[ccy] ? oneWay(band[ccy]) : null;
};
function fxFor(ccy) {
  if (!FX_BOARD.upTo50k[ccy]) return null;
  const small = oneWay(FX_BOARD.upTo50k[ccy]);
  const large = oneWay(FX_BOARD.upTo250k[ccy]);
  return {
    rate: (amountChf) => boardRate(ccy, amountChf),
    label: (100 * small).toFixed(2),
    basis:
      `au cours Devisen de la Migros Bank (${ccy}, relevé le ${FX_BOARD.readOn}) : ${pctFr(small)} % du milieu jusqu'à CHF 50 000, ` +
      `${pctFr(large)} % jusqu'à CHF 250 000 (au-delà, aucun cours publié : celui de la seconde tranche)`,
  };
}

const CFG = {
  folder: "migros",
  brand: "Migros Bank",
  catalogue: new URL("migros-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.23% a year, min CHF 50.",
  sources: { fx: FX_PAGE, accounts: "https://www.migrosbank.ch/de/privatpersonen/konten-karten/konten/kontokorrent.html" },
  commission({ amountChf }) {
    const surcharge = amountChf >= SURCHARGE_FROM ? amountChf * SURCHARGE : 0;
    return {
      chf: ONLINE_CHF + surcharge,
      min: ONLINE_CHF,
      rate: surcharge ? SURCHARGE : null,
      basis:
        `E-Banking CHF ${ONLINE_CHF} par achat ou vente (actions, ETF, produits structurés), ` +
        `plus un supplément de 0,020 % sur tout le montant dès CHF 100 000 sur la place suisse` +
        (surcharge ? ` (ici CHF ${Number(surcharge.toFixed(2))} par sens).` : " (non atteint ici)."),
      confidence: "prix E-Banking publié, le même pour chaque sens",
    };
  },
};
const engine = makeRoundTrip(CFG);

/** The listing's currency decides which line of the FX board applies. */
export function roundTrip(query) {
  let ccy = String(query.currency || "").trim().toUpperCase();
  if (!ccy) {
    CFG.fx = null;
    const probe = engine(query);
    ccy = probe.listing?.currency || "";
    if (!fxFor(ccy)) return probe;
  }
  CFG.fx = fxFor(ccy);
  try {
    return engine(query);
  } finally {
    CFG.fx = null;
  }
}

cli(import.meta.url, roundTrip);
