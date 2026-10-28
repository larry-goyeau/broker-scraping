// What one round trip costs at Mercantile Bank (Bank Mercantile Discount,
// Israel): buy n shares at price p on the Tel Aviv Stock Exchange or a US
// exchange through a direct channel (internet, app, Mercantile TRADE),
// sell them back at once, in dollars.
//
// Private tariff, part 4 (securities, taarifon_private_4.xlsx and the full
// PDF updated 07/02/2025), and the direct-channel table of appendix ה,
// read 2026-10-26. Each buy and each sell:
//   4.1.1 TASE shares and bonds, "כולל ... קרן מחקה" and fund units listed
//         on the exchange (so ETFs too): 0.54 %, min ₪35, max ₪7,300; in a
//         direct channel "מחיר מופחת בשיעור 0.40% לפעולה ... בכפוף למינימום
//         של 25 ש"ח מקסימום 7,150 ש"ח".
//   4.4.1 Securities abroad (shares, bonds, funds): 0.79 %, min $25, max
//         $10,900; direct channel "0.59% בכפוף למינימום של 23.5 $ מקסימום
//         10,680 $" ("השרות ניתן עבור מניות בארה"ב בלבד": US shares only).
//         Column "הוצאות נוספות" (extra expenses): "עמלת סוכן, Sec fee, מס
//         מלכה, Option regulatory fee, הוצאות סוויפט".
// The SEC fee stays at 0 like the other files (no figure); the option fee
// and SWIFT costs are not a share trade. The foreign agent's commission
// (עמלת סוכן) has no figure on any Mercantile page (11.9 "הוצאות סוכן בחוץ
// לארץ משתנה בהתאם לסוג נייר /הסוכן / השוק"). Its parent Discount Bank,
// which is merging Mercantile's systems into its own, charges "עד חצי סנט
// למניה" with a $5.5 minimum (Calcalist, 28.10.2025), so that group figure
// stands in, each side (owner, 2026-10-26: "cherche ailleurs").
//   https://www.calcalist.co.il/market/article/r14ruetrgx
// 4.11.1, a "custodian commission" of 0.1 % (min ₪50) at the time of the
// operation, is read as the fee on securities held at an outside custodian,
// not an exchange trade, and is left out. Custody (0.2 % / 0.25 % a quarter)
// is not this trip.
// FX (part 5): "עמלת חליפין מט"י-מט"ח" 0.19 % (min $6.8, max $1,075), in a
// direct channel 0.17 % (min $6.30, max $1,055). Foreign-currency deposits
// go to a foreign-currency current account (general terms, part D;
// deposits.mjs: ILS, USD, EUR, GBP, CAD, CHF), so a US line is in a held
// currency: "FX 0.17% (min 6.30 USD) when cash ≠ USD." on every line.
// Israel has no stamp duty; a US FTT comes from taxMap.mjs by ISIN.
//
// Books: TASE (XTAE) from spreads/. US: no US broker is named, so the
// quoted NBBO.
//
//   https://www.mercantile.co.il/private/generalinfo/price-list-fees-tracks/
//   https://www.mercantile.co.il/media/wa0inth4/taarifon_private_4.xlsx
//   https://www.mercantile.co.il/media/5sgkpskc/taarifon_private_full.pdf
//
//   node brokers/mercantile/mercantile_cost.mjs ANLT.F1 XTAE ILS --shares=100 --price=20
//   node brokers/mercantile/mercantile_cost.mjs ABRA XTAE ILS --shares=10000 --price=5
//   node brokers/mercantile/mercantile_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "mercantile";
const CATALOGUE = new URL("mercantile-parsed.json", import.meta.url);
const PAGE = "https://www.mercantile.co.il/private/generalinfo/price-list-fees-tracks/";
const READ_ON = "2026-10-26";

// Direct channel, each side.
const TASE = { rate: 0.004, min: 25, max: 7150 }; // ILS
const ABROAD = { rate: 0.0059, min: 23.5, max: 10680 }; // USD
// The foreign agent's commission ("עמלת סוכן"), USD a side: Discount's.
const AGENT_FEE = { perShare: 0.005, min: 5.5 };
const FX = { rate: "0.17", min: "6.30 USD" };
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** One side's commission in the listing currency: rate, floor, cap. */
export function commissionSide(market, notional) {
  const t = market === "tase" ? TASE : market === "us" ? ABROAD : null;
  if (!t) return null;
  return Math.min(t.max, Math.max(t.min, notional * t.rate));
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
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const BASIS = {
  tase: `tarif Mercantile, partie 4, relu le ${READ_ON}, 4.1.1 en canal direct : 0,40 % par opération, minimum 25 ₪, maximum 7 150 ₪ (actions, ETF et fonds indiciels de la TASE)`,
  us: `tarif Mercantile, partie 4, relu le ${READ_ON}, 4.4.1 en canal direct (actions américaines) : 0,59 % par opération, minimum 23,5 USD, maximum 10 680 USD ; en sus « עמלת סוכן » (commission de l'agent étranger) sans montant chez Mercantile : celle de sa maison mère Discount, jusqu'à 0,5 cent par action, minimum 5,5 USD par opération (Calcalist, 28.10.2025) ; SEC sans montant (0)`,
};

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
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Mercantile n'existe pas encore : lancer `node brokers/mercantile/mercantile_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Mercantile` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Mercantile`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
  const rowMic = code(m.venue?.mic ?? m.row.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? rowMic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = rowMic === "XTAE" && listing.currency === "ILS" ? "tase" : US_MICS.has(rowMic) && listing.currency === "USD" ? "us" : null;
  const american = market === "us";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const fxLine = held ? fxRemark(FX.rate, listing.currency, `(min ${FX.min})`) : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : "",
    basis: BASIS[market] || `tarif Mercantile relu le ${READ_ON}`,
    remark: fxLine,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} ${listing.currency} n'a pas de ligne dans le tarif Mercantile` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = commissionSide(market, notional);
  const commissionUsd = dollars(2 * side, listing.currency);
  const agentUsd = american ? (AGENT_FEE == null ? null : 2 * Math.max(AGENT_FEE.min, AGENT_FEE.perShare * n)) : 0;
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, agentUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  let marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  let marketPerShare = perShare ?? (american ? null : book.leaf?.perShare ?? null);
  if (american && bp == null && perShare == null) {
    marketPerShare = usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, agentUsd, taxUsd, fxUsd);

  const unknown = [
    agentUsd == null ? "« עמלת סוכן » (commission de l'agent étranger) en sus, sans montant publié" : null,
    held ? null : `${listing.currency} n'est pas une devise de dépôt`,
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);
  const t = market === "tase" ? TASE : ABROAD;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: side, sell: side, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      agent: finite(agentUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    tax,
    confidence: [
      shared.basis,
      side === t.min ? "minimum par opération appliqué" : side === t.max ? "maximum par opération appliqué" : null,
      american ? "pas de courtier américain nommé : NBBO coté" : null,
      "aucun aller-retour réel chez Mercantile dans ce dépôt",
    ]
      .filter(Boolean)
      .join(" ; "),
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
  if (!etf) {
    console.error("usage : node brokers/mercantile/mercantile_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
