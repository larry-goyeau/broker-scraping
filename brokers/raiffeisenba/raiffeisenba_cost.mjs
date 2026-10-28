// What one round trip costs at Raiffeisen CAPITAL a.d. Banja Luka: buy n
// Banja Luka shares at price p and sell them back, in dollars, ordered
// online through its eTrader application. Its only place is the Banja Luka
// Stock Exchange (Banjalučka berza, convertible-mark lines).
//
// Read on 2026-10-26.
//   https://www.raiffeisenbank.ba/content/dam/rbi/retail/eu/ba/raiffeisen-capital/dokumenti/Brokerage%20fees%20-%20Raiffeisen%20Capital%20JSC%20Banja%20Luka.pdf.coredownload.pdf
//     (fee schedule approved by the RS Securities Commission on 25.05.2016)
//     1. "Brokerage services for sale and purchase of securities", by
//     "Value of deal (in KM)": up to 100.00 "KM 7.00", 100.01-500.00
//     "KM 9.50", 500.01-1,000.00 "2.00%", 1,000.01-3,000.00 "1.90%",
//     3,000.01-5,000.00 1.70%, 5,000.01-10,000.00 1.60%, 10,000.01-20,000.00
//     1.50%, 20,000.01-40,000.00 1.40%, 40,000.01-50,000.00 1.30%,
//     50,000.01-100,000.00 1.20%, 100,000.01-200,000.00 1.00%, from
//     200,000.01 0.80%. The bracket rate applies to the whole deal value,
//     each buy and each sell.
//     Article 2: the fees of Article 1 "include the fee costs of Banjalučka
//     berza ... and fees of the Centralni registar", so nothing is added
//     for the exchange or the register.
//     Article 3: lower prices may be agreed in a separate resolution; no
//     figure, so it stays out.
//   https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/proizvodi-i-usluge/e-trading.html
//     "use the eTrader application free of charge"; real-time best bid/ask
//     only for a fee (no amount, a data subscription, not a trade fee).
//
// In the total: the book and the bracket fee each side. No transaction
// tax in taxMap.mjs. Left out: block deals (0.60%), takeover bids, treasury
// bills, repo, transfers, the individually agreed lower prices.
//
// Cash: the purchase page asks for an advance payment to Raiffeisen
// CAPITAL's account at Raiffeisen BANK dd BiH ("Advance payment
// instructions in BiH"), a convertible-mark account, the only currency the
// exchange settles, so a Banja Luka line takes no FX in the number. Paying
// from euros or dollars is the bank's account rate list no. 299, valid
// 2026-10-26 (https://www.raiffeisenbank.ba/en/personal/help-tools/kursna-lista.html,
// data /en.exchangerates.20261026.ACCOUNT....BAM.SOURCE.json): EUR
// 1.95583 / 1.95583 (the currency-board peg, no gap), USD 1.686211 /
// 1.808527 KM, half the gap over the mid 3.50%, the remark.
//
// fx.mjs has no BAM rate yet and spreads/ no Banja Luka book, so the dollar
// total stays unknown until both exist; the KM figures are in the answer.
//
//   node brokers/raiffeisenba/raiffeisenba_cost.mjs TLKM-R-A XBLB BAM --shares=1850 --price=0.95
//   node brokers/raiffeisenba/raiffeisenba_cost.mjs RITE-R-A XBLB BAM --shares=80000 --price=0.022
//   node brokers/raiffeisenba/raiffeisenba_cost.mjs NOVB-R-E XBLB BAM --shares=180 --price=0.5
//   node brokers/raiffeisenba/raiffeisenba_cost.mjs --schedule
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

const FOLDER = "raiffeisenba";
const NAME = "Raiffeisen CAPITAL";
const CATALOGUE = new URL("raiffeisenba-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.raiffeisenbank.ba/content/dam/rbi/retail/eu/ba/raiffeisen-capital/dokumenti/Brokerage%20fees%20-%20Raiffeisen%20Capital%20JSC%20Banja%20Luka.pdf.coredownload.pdf",
  page: "https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/proizvodi-i-usluge/e-trading.html",
  readOn: "2026-10-26",
  rateList: "https://www.raiffeisenbank.ba/en/personal/help-tools/kursna-lista.html",
};

// Deal value in KM → fee each side: a flat KM amount or a rate on the whole value.
const BRACKETS = [
  { upTo: 100, flat: 7 },
  { upTo: 500, flat: 9.5 },
  { upTo: 1_000, rate: 0.02 },
  { upTo: 3_000, rate: 0.019 },
  { upTo: 5_000, rate: 0.017 },
  { upTo: 10_000, rate: 0.016 },
  { upTo: 20_000, rate: 0.015 },
  { upTo: 40_000, rate: 0.014 },
  { upTo: 50_000, rate: 0.013 },
  { upTo: 100_000, rate: 0.012 },
  { upTo: 200_000, rate: 0.01 },
  { upTo: Infinity, rate: 0.008 },
];
// Account rate list no. 299, valid 2026-10-26, KM per unit, buy / sell.
const KURS = { EUR: [1.95583, 1.95583], USD: [1.686211, 1.808527] };
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const BANJALUKA = new Set(["XBLB", "BLSE", "BLBERZA", "BANJALUKASTOCKEXCHANGE", "BANJALUKA", "BANJALUCKABERZA"]);

// Round to the 0.01 KM the deal brackets are printed in.
const cents = (value) => Math.round(value * 100) / 100;

export function bracketOf(value) {
  const v = cents(value);
  return BRACKETS.find((b) => v <= b.upTo);
}

export function sideFee(value) {
  const b = bracketOf(value);
  return b.flat != null ? b.flat : value * b.rate;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || BANJALUKA.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
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
  const shared = {
    ...answer,
    listing,
    remark: fxRemark(half(KURS.USD), listing.currency, "from USD, none from EUR"),
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif Raiffeisen CAPITAL Banja Luka relu le ${SCHEDULE.readOn} : achat et vente d'actions par tranche de valeur de l'ordre, ` +
      `7,00 KM jusqu'à 100 KM, 9,50 KM jusqu'à 500 KM, puis 2,00 % jusqu'à 1 000 KM, 1,90 % jusqu'à 3 000 KM ... 0,80 % au-delà de 200 000 KM, ` +
      `sur toute la valeur et par sens, frais de la Bourse de Banja Luka et du Registre central compris (article 2) ; ordre en ligne par eTrader, gratuit`,
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
  const bracket = bracketOf(notional);
  const side = sideFee(notional);
  const commissionKm = side * 2;
  const brokerFees = dollars(commissionKm, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why = [
    notionalUsd == null ? `fx.mjs n'a pas de cours ${listing.currency}` : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    bracket.flat != null
      ? `tranche forfaitaire ${bracket.flat.toFixed(2)} KM par sens (ordre de ${notional.toFixed(2)} KM)`
      : `tranche ${(bracket.rate * 100).toFixed(2)} % : ${side.toFixed(2)} KM par sens`,
    `frais aller-retour hors carnet ${commissionKm.toFixed(2)} KM`,
    taxTotal ? `taxe ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe de transaction dans taxMap.mjs",
    "ligne en marks convertibles, seule devise de règlement : pas de change ; demi-écart USD de la liste de cours de la banque en remarque (EUR au cours fixe, sans écart)",
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
      brackets: BRACKETS.map((b) => ({ ...b, upTo: Number.isFinite(b.upTo) ? b.upTo : null })),
      eachWay: true,
      currency: "BAM",
      thirdPartyIncluded: true,
    },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    km: {
      courtage: Number(commissionKm.toFixed(2)),
      total: Number(commissionKm.toFixed(2)),
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, brackets: BRACKETS.map((b) => ({ ...b, upTo: Number.isFinite(b.upTo) ? b.upTo : null })), kurs: KURS }, null, 2));
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
