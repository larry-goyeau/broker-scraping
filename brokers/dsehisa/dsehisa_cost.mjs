// What one round trip costs through DSE Hisa Kiganjani, the Dar es Salaam
// Stock Exchange's own mobile trading app: buy n shares (or ETF units) on
// the DSE through the investor's chosen licensed dealing member and sell
// them straight back, in dollars. Every line is quoted in shillings (TZS)
// and the app is paid in shillings, so nothing is converted.
//
// https://dse.co.tz/storage/extras/rules%20&%20regulation/DSE%20Fees.pdf
// read on 2026-10-19: the First Schedule to the DSE Rules, "The DSE and CDS
// fee structure". Table 1, item 6, "Transaction Fees - Equities", on the
// value of each trade, with min = max = rate:
//   Brokerage commission   1.7 % up to TZS 10 mn, 1.5 % on the next
//                          TZS 40 mn, 0.8 % on any sum above TZS 50 mn.
//   DSE and CMSA           0.3 % (0.02 % to the Fidelity Fund, 0.28 %
//                          split equally between the DSE and the CMSA).
// Table 4, item 2: CSD standard transaction fee 0.06 % of the value.
// https://dse.co.tz/faqs read the same day, question 9, "What is the cost
// of each trade?": "The maximum total brokerage fees stand at 2.3768% of
// the value of the trade", brokerage, DSE, CMSA, CDS and Fidelity fees
// included. 2.3768 % is 1.7 % × 1.18 + 0.3 % + 0.06 % × 1.18: VAT at 18 %
// (Tanzania's standard rate) on the brokerage and on the CSD fee, so both
// carry it here. The schedule is for equities; the FAQ gives one cost for
// every trade on the app, so the ETFs pay the same.
// All of it is taken on each side. The brokerage (before VAT) is
// brokerFees; DSE/CMSA/Fidelity, CSD and the VAT are in usd only.
// Left out: the CSDR "Custody Fee TZS 1,000 per transaction" (Table 3) is
// not in the FAQ's all-in 2.3768 %, which this file matches exactly; the
// 0.005 % custody fee is for institutions.
// The DSE book is not stored, so the total stays unknown until it is; the
// shilling has no rate in fx.mjs either.
//
//   node brokers/dsehisa/dsehisa_cost.mjs CRDB XDAR TZS --shares=100 --price=1500
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("dsehisa-parsed.json", import.meta.url);
const PAGE = "https://dse.co.tz/storage/extras/rules%20&%20regulation/DSE%20Fees.pdf";
const FAQ = "https://dse.co.tz/faqs";
const READ_ON = "2026-10-19";
const BROKER = "DSE Hisa Kiganjani";
// [upper bound of the band in TZS, rate]; the last band is open.
const BROKERAGE = [
  [10_000_000, 0.017],
  [50_000_000, 0.015],
  [Infinity, 0.008],
];
const DSE_CMSA = 0.003; // of which Fidelity Fund 0.0002
const CSD = 0.0006;
const VAT = 0.18;
const CASH = "TZS";
const REMARK = "";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const joinRemark = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

// Brokerage on one side: each band of the trade value at its own rate.
function brokerageOf(value) {
  let fee = 0;
  let floor = 0;
  for (const [ceiling, rate] of BROKERAGE) {
    if (value <= floor) break;
    fee += (Math.min(value, ceiling) - floor) * rate;
    floor = ceiling;
  }
  return fee;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
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
    cashCurrency: CASH,
    url: FAQ,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/dsehisa/dsehisa_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "dsehisa",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    remark: joinRemark(m.row.remark, REMARK),
    listing,
    basis:
      `barème de la DSE (First Schedule des DSE Rules) et FAQ de la DSE relus le ${READ_ON} : courtage 1,7 % jusqu'à 10 M TZS, ` +
      `1,5 % sur les 40 M suivants, 0,8 % au-delà, chaque sens. DSE et CMSA 0,3 % (dont 0,02 % Fidelity Fund), CSD 0,06 %. ` +
      `TVA 18 % sur le courtage et le CSD, comme le total maximal de 2,3768 % de la FAQ.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, faq: FAQ },
  };
  if (listing.currency !== CASH || listing.mic !== "XDAR") {
    return { ...shared, why: `${BROKER} ne couvre que la bourse de Dar es Salaam en shillings ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : la DSE ne donne pas d'ISIN, donc rien dans assets/prices.json" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = brokerageOf(notional);
  const dseCmsaEach = notional * DSE_CMSA;
  const csdEach = notional * CSD;
  const vatEach = (each + csdEach) * VAT;
  const brokerFees = dollars(each * 2, listing.currency);
  const levies = dollars((dseCmsaEach + csdEach + vatEach) * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { bands: BROKERAGE.map(([upTo, rate]) => ({ upTo: Number.isFinite(upTo) ? upTo : null, rate })), each, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { dseCmsa: dseCmsaEach, csd: csdEach, vat: vatEach, eachWay: true, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levies, 6),
      courtageTzs: finite(each * 2, 6),
      réglementaireTzs: finite((dseCmsaEach + csdEach + vatEach) * 2, 6),
    },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
