// What one round trip costs at Global Securities Company (GSC, Ramallah, a
// subsidiary of Palestine Investment Bank): buy n shares at price p on the
// Palestine Exchange (Shamel eTrade), on Amman, Tadawul, Qatar, DFM, ADX or
// a US exchange (GTN platform), sell them back at once, online, in dollars.
//
// Fees and Commissions page, read 2026-10-26 (the page's own calculator
// applies the same rate to the buy and to the sell):
//   Palestine Exchange   Capital Market Authority 0.05 %, Palestine Exchange
//                        0.20 %, securities company 0.47 %: "Total 0.72% of
//                        trade value"; no minimum.
//   Amman (ASE)          0.65 % of trade value
//   Saudi (Tadawul)      0.55 %
//   Qatar (QSE)          0.55 %, minimum QAR 50 a trade
//   Dubai (DFM)          0.55 % + AED 10.5 a trade
//   Abu Dhabi (ADX)      0.55 %
//   US markets           under $1: 0.4 % of trade value; $1 to $9.99:
//                        $0.01 a share; $10 and above: $0.02 a share;
//                        minimum $25 a trade. "In addition, the client bears
//                        the US Securities and Exchange Commission (SEC) fee
//                        applied to sell orders": no figure, so 0 like the
//                        other files.
//   "The commissions shown do not include taxes — taxes due in each market
//   are added": the stamp and transaction taxes of taxMap.mjs by ISIN.
// brokerFees is GSC's part: 0.47 % on the Palestine Exchange (the CMA and
// exchange shares are levies), the whole rate elsewhere.
//
// FX: the client accounts at Palestine Investment Bank and Arab Bank are
// JOD and USD, "the only channels through which client deposits for trading
// are accepted" (deposits.mjs). Palestine Exchange lines (USD or JOD),
// Amman (JOD) and the US (USD) are held currencies: FX is the remark "FX
// when cash ≠ CCY." (no rate printed). Tadawul (SAR), Qatar (QAR), DFM and
// ADX (AED) lines convert on the buy and back on the sale at a rate GSC does
// not print: those totals are N/A. No stand-in was found: the bank's own
// board prices only USD, JOD and EUR against the shekel.
//
// Books: the venue's own book where spreads/ has one (Amman, Tadawul, DFM,
// ADX). The Palestine Exchange and the Qatar Stock Exchange have no venue
// in spreads/venues.mjs, so those lines have no book (N/A). US: orders go
// "electronically through the GTN platform for regional and US markets";
// Capital.com's GTN lines use GTN Americas' 606 (owner's choice), and
// spreads/rule606.mjs needs `globalsecurities: "gtnamericas"` for the same
// Q; until then the quoted NBBO.
//
//   https://gsc.ps/en/content/trading/الرسوم-والعمولات.html
//   https://gsc.ps/en/content/accounts/حسابات-الأسواق-العالمية.html
//   https://gsc.ps/en/content/customer-relations/الحسابات-البنكية.html
//
//   node brokers/globalsecurities/globalsecurities_cost.mjs AALU XAMM JOD --shares=1000 --price=1.5
//   node brokers/globalsecurities/globalsecurities_cost.mjs AIB XPAE USD --shares=1000 --price=1
//   node brokers/globalsecurities/globalsecurities_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/globalsecurities/globalsecurities_cost.mjs AIRARABIA XDFM AED --shares=1000 --price=3
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

const FOLDER = "globalsecurities";
const CATALOGUE = new URL("globalsecurities-parsed.json", import.meta.url);
const PAGE = "https://gsc.ps/en/content/trading/%D8%A7%D9%84%D8%B1%D8%B3%D9%88%D9%85-%D9%88%D8%A7%D9%84%D8%B9%D9%85%D9%88%D9%84%D8%A7%D8%AA.html";
const READ_ON = "2026-10-26";

// Each side. `own` is GSC's share of the rate, the rest is levies.
const MARKETS = {
  pex: { label: "Palestine Exchange", rate: 0.0072, own: 0.0047, ccy: ["USD", "JOD"] },
  amm: { label: "Amman Stock Exchange", rate: 0.0065, ccy: ["JOD"] },
  tdwl: { label: "Saudi Exchange (Tadawul)", rate: 0.0055, ccy: ["SAR"] },
  qse: { label: "Qatar Stock Exchange", rate: 0.0055, min: 50, ccy: ["QAR"] },
  dfm: { label: "Dubai Financial Market", rate: 0.0055, fixed: 10.5, ccy: ["AED"] },
  adx: { label: "Abu Dhabi Securities Exchange", rate: 0.0055, ccy: ["AED"] },
  us: { label: "US markets", ccy: ["USD"] },
};
const BY_MIC = {
  XPAE: "pex",
  XAMM: "amm",
  XSAU: "tdwl",
  DSMD: "qse",
  XDFM: "dfm",
  XADS: "adx",
  XNAS: "us",
  XNYS: "us",
  XASE: "us",
  ARCX: "us",
  BATS: "us",
  TXSE: "us",
};
const US = { low: 0.004, mid: 0.01, high: 0.02, min: 25 };

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

/** One side's commission in the listing currency, as the page's calculator computes it. */
export function commissionSide(market, { shares, price }) {
  const value = shares * price;
  const t = MARKETS[market];
  if (!t) return null;
  let fee;
  if (market === "us") {
    fee = price >= 10 ? shares * US.high : price >= 1 ? shares * US.mid : value * US.low;
    fee = Math.max(US.min, fee);
  } else {
    fee = value * t.rate + (t.fixed || 0);
    if (t.min != null) fee = Math.max(t.min, fee);
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
      if (loose(m.row.mic) === wantPlace) return true;
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
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Global Securities n'existe pas encore : lancer `node brokers/globalsecurities/globalsecurities_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Global Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Global Securities`,
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
  const market = BY_MIC[rowMic] || null;
  const table = market ? MARKETS[market] : null;
  const american = market === "us";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const fxLine = held ? fxRemark("", listing.currency) : "";
  const basis = !table
    ? `barème GSC relu le ${READ_ON}`
    : american
      ? `barème GSC relu le ${READ_ON}, marchés US : 0,4 % sous 1 USD, 0,01 USD la part de 1 à 9,99 USD, 0,02 USD la part à partir de 10 USD, minimum 25 USD par ordre ; SEC à la vente sans montant (0)`
      : market === "pex"
        ? `barème GSC relu le ${READ_ON}, Bourse de Palestine : 0,72 % par ordre (autorité 0,05 %, bourse 0,20 %, GSC 0,47 %)`
        : `barème GSC relu le ${READ_ON}, ${table.label} : ${(100 * table.rate).toFixed(2).replace(".", ",")} % par ordre${table.min ? `, minimum ${table.min} QAR` : ""}${table.fixed ? ` + ${String(table.fixed).replace(".", ",")} AED par ordre` : ""}`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : "",
    basis,
    remark: fxLine,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!table || !table.ccy.includes(listing.currency)) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} ${listing.currency} n'a pas de ligne dans le barème GSC` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = commissionSide(market, { shares: n, price: p });
  const ownSide = market === "pex" ? notional * table.own : side;
  const commissionUsd = dollars(2 * ownSide, listing.currency);
  const levyUsd = dollars(2 * (side - ownSide), listing.currency);
  // A SAR, QAR or AED line: JOD or USD converted on the buy and back on the
  // sale, at a rate GSC does not print.
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);

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
  const usd = plus(bookUsd, commissionUsd, levyUsd, taxUsd, fxUsd);

  const unknown = [
    held ? null : `change forcé JOD/USD → ${listing.currency} à l'achat et retour à la vente : GSC n'imprime ni taux ni écart`,
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.brokerExchange || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

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
      réglementaire: finite(levyUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    tax,
    confidence: [
      basis,
      side === (market === "us" ? US.min : table.min) ? "minimum par ordre appliqué" : null,
      "« taxes due in each market are added » : taxes de taxMap.mjs par ISIN",
      american ? "ordres US par la plateforme GTN ; Q de GTN Americas si spreads/rule606.mjs l'associe, sinon NBBO coté" : null,
      "aucun aller-retour réel chez GSC dans ce dépôt",
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
    console.error("usage : node brokers/globalsecurities/globalsecurities_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
