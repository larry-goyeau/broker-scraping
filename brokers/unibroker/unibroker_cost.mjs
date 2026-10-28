// What one round trip costs at Unibroker (Unibroker d.o.o. Sarajevo): buy n
// Sarajevo shares at price p and sell them back, in dollars, ordered online
// through its e-Trading application. Its only place is the Sarajevo Stock
// Exchange (SASE, convertible-mark lines).
//
// Read on 2026-10-26.
//   https://www.unibroker.ba/doc/TarifenaknadaUnibroker04072024.docx
//     (the "Download" of https://www.unibroker.ba/cjenovnik.html; the table
//     still on that page is the 2015 tariff the 2024 one replaces)
//     I 1.1 "Provizija za transakcije dionicama", by "Vrijednost
//     transakcije": "0 – 5.000,00 KM 1,75%", 1.50% from 5,001 to 100,000,
//     1.20% to 500,000, 1.00% to 1,000,000, 0.70% to 2,000,000, 0.50% to
//     5,000,000, 0.30% to 10,000,000, 0.20% above. No minimum. The band's
//     rate is read on the whole transaction, each buy and each sell. The
//     second band is in the remark as a cut of the first band's commission
//     (1.75% → 1.50% = 14% lower).
//     II: the fees of the Sarajevo exchange, the FBiH securities registry,
//     the depository bank and the Securities Commission are not included
//     and are charged "u skladu sa tarifama tih trećih lica", so the
//     exchange and registry trade fees are added from their own tariffs:
//   Cjenovnik SASE (unofficial consolidated text up to 02-6/24), čl. 14:
//     "Proviziju za sklapanje poslova plaćaju i kupac i prodavac":
//     "Berzna provizija za dionice iznosi 0,15% od vrijednosti posla".
//     https://www.sase.ba/v1/LinkClick.aspx?fileticket=4ekyL2wci8c%3d&tabid=336&portalid=0&mid=1357&language=bs-Latn-BA
//     (listed on https://www.sase.ba/v1/Legislativa/Propisi-SASE). Čl. 34
//     prints the amounts without VAT; trading in shares is a VAT-exempt
//     financial service in BiH, so none is added.
//   Registar vrijednosnih papira u FBiH, Odluka o naknadama (Službene
//     novine FBiH 36/26, in force 2026-05-07), 6.1.1 clearing and
//     settlement of exchange trades "tržišna vrijednost transakcije 0,02%"
//     and 6.1.2 transfer through client and broker accounts (C and H)
//     "0,05%", each side; "usluge Registra oslobođene su plaćanja PDV-a".
//     https://www.rvp.ba/Dokumenti_/Cjenovnik
//
//   e-Trading (https://www.unibroker.ba/e-trading.html, "trgovanja
//   vrijednosnim papirima na berzi putem interneta") has no fee of its own
//   on the tariff.
//
// In the total: the book, the band rate each side, the SASE fee 0.15% and
// the registry's 0.07% each side. No transaction tax in taxMap.mjs.
// Left out: the one-off KM 10 for opening the first order ("naplaćuje se
// samo jednom"), the discretionary rebates of IV (up to 25% a criterion,
// 80% in all, at the director's decision), the registry's account opening
// (KM 7) and upkeep (KM 0.10 a month), the depository bank's and postal
// costs (no figure; the bank holds the client's advance, it does not price
// the trade), bonds, treasury bills and off-exchange deals (other sections).
//
// Cash: a buy is paid in advance, in full, to Unibroker's depository
// account at Moja banka Sarajevo (a convertible-mark account, the only
// currency SASE settles; https://www.unibroker.ba/uputstvo.html), so a
// Sarajevo line takes no FX in the number. The broker prints no rate for
// other currencies, so the remark carries no figure.
//
// fx.mjs has no BAM rate yet (a currency board at 1.95583 marks per euro)
// and spreads/ no Sarajevo book, so the dollar total stays unknown until
// both exist; the mark figures are in the answer.
//
//   node brokers/unibroker/unibroker_cost.mjs BHTSR XSSE BAM --shares=120 --price=14
//   node brokers/unibroker/unibroker_cost.mjs JPESR XSSE BAM --shares=200 --price=8.3
//   node brokers/unibroker/unibroker_cost.mjs IKBZRK2 XSSE BAM --shares=7 --price=240
//   node brokers/unibroker/unibroker_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "unibroker";
const NAME = "Unibroker";
const CATALOGUE = new URL("unibroker-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.unibroker.ba/doc/TarifenaknadaUnibroker04072024.docx",
  page: "https://www.unibroker.ba/cjenovnik.html",
  readOn: "2026-10-26",
  inForce: "2024-07-04",
  exchangeTariff: "https://www.sase.ba/v1/LinkClick.aspx?fileticket=4ekyL2wci8c%3d&tabid=336&portalid=0&mid=1357&language=bs-Latn-BA",
  registryTariff: "https://www.rvp.ba/Dokumenti_/Cjenovnik",
};

// Broker side, by the value of the transaction, each side. Upper bound of each band in KM.
const BANDS = [
  { upToBam: 5_000, rate: 0.0175 },
  { upToBam: 100_000, rate: 0.015 },
  { upToBam: 500_000, rate: 0.012 },
  { upToBam: 1_000_000, rate: 0.01 },
  { upToBam: 2_000_000, rate: 0.007 },
  { upToBam: 5_000_000, rate: 0.005 },
  { upToBam: 10_000_000, rate: 0.003 },
  { upToBam: Infinity, rate: 0.002 },
];
const bandOf = (value) => BANDS.find((band) => value <= band.upToBam);
// Sarajevo Stock Exchange, shares, each side.
const SASE = { rate: 0.0015 };
// Registar vrijednosnih papira u FBiH: 6.1.1 clearing + 6.1.2 transfer (C/H accounts), each side.
const RVP = { clearing: 0.0002, transfer: 0.0005 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const SARAJEVO = new Set(["XSSE", "SASE", "SARAJEVO", "SARAJEVOSTOCKEXCHANGE", "SARAJEVSKABERZA"]);

export const saseFee = (value) => value * SASE.rate;
export const rvpFee = (value) => value * (RVP.clearing + RVP.transfer);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || SARAJEVO.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency || (wantCurrency === "KM" && code(m.row.currency) === "BAM"));
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${NAME} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${NAME}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${NAME}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  // The next band as a cut of the first band's commission (1.75% → 1.50%).
  const tierCut = Math.round(((BANDS[0].rate - BANDS[1].rate) / BANDS[0].rate) * 100);
  const shared = {
    ...answer,
    listing,
    remark: `${fxRemark("", listing.currency)} Over KM 5,000 a trade: fees are ${tierCut}% lower.`,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif Unibroker du ${SCHEDULE.inForce}, relu le ${SCHEDULE.readOn} : actions 1,75 % jusqu'à 5 000 KM, ` +
      `1,50 % jusqu'à 100 000, 1,20 % jusqu'à 500 000, 1,00 % jusqu'à 1 M, 0,70 % jusqu'à 2 M, 0,50 % jusqu'à 5 M, ` +
      `0,30 % jusqu'à 10 M, 0,20 % au-delà, sans minimum, par sens, ` +
      `plus la commission de la Bourse de Sarajevo (0,15 %) et le Registre FBiH (compensation 0,02 % + transfert 0,05 %), ` +
      `chacun par sens ; ordre en ligne par e-Trading`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const band = bandOf(notional);
  const brokerSide = notional * band.rate;
  const leviesSide = saseFee(notional) + rvpFee(notional);
  const commissionBam = brokerSide * 2;
  const leviesBam = leviesSide * 2;
  const brokerFees = dollars(commissionBam, listing.currency);
  const bourse = dollars(leviesBam, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const why = [
    notionalUsd == null ? `fx.mjs n'a pas de cours ${listing.currency}` : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    `côté courtier ${(band.rate * 100).toFixed(2)} %, ${brokerSide.toFixed(2)} KM par sens`,
    `Bourse ${saseFee(notional).toFixed(2)} KM et Registre ${rvpFee(notional).toFixed(2)} KM par sens`,
    `frais aller-retour hors carnet ${(commissionBam + leviesBam).toFixed(2)} KM`,
    taxTotal ? `taxe ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe de transaction dans taxMap.mjs",
    "ligne en marks convertibles, seule devise de règlement, avance payée en KM : pas de change",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: {
      rate: band.rate,
      bands: BANDS.map((b) => ({ upToBam: Number.isFinite(b.upToBam) ? b.upToBam : null, rate: b.rate })),
      min: 0,
      eachWay: true,
      currency: "BAM",
      thirdParty: { exchange: SASE, registry: RVP },
    },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    bam: {
      courtage: Number(commissionBam.toFixed(2)),
      bourse: Number(leviesBam.toFixed(2)),
      total: Number((commissionBam + leviesBam).toFixed(2)),
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(bourse, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, bands: BANDS, sase: SASE, rvp: RVP }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error(`usage : node brokers/${FOLDER}/${FOLDER}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
