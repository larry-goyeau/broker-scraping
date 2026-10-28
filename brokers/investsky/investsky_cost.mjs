// What one round trip costs at InvestSky (a CMA-permitted social trading
// platform; orders executed and held by anb capital, CMA licence 07072-37):
// buy n shares on Tadawul or a US exchange in the app, sell them straight
// back, in dollars.
//
// Pricing page (Saudi Arabia), read 2026-10-26:
//   Saudi market   Commission "0.105% of the traded value"; Capital Market
//                  Authority 0.03 %; "Tadawul, Edaa and Muqassa" 0.02 %;
//                  "Total Fees (Commission + Regulatory & Exchange Fees)
//                  0.155% of the traded value"; "15% VAT on fees wherever
//                  applicable". Help centre, "What are the fees for trading
//                  Saudi stocks?": the same three lines, "No minimum
//                  commission applies". Each side.
//   US market      "Stocks over $1 FREE 🎉 Saudi Launch Gift"; "Stocks under
//                  $1 1.5% of trade value" (help centre: "completely free for
//                  stocks priced at $1 or above", under $1 "a flat fee of 1.5%
//                  of your trade value"). "Regulatory Fees (Sell Orders
//                  Only)": FINRA CAT $0.000009 a share, min $0.01; FINRA TAF
//                  $0.000166 a share, min $0.01, max $8.30. No SEC figure: 0.
//                  (A help article prints a CAT of $0.000035 a share on all
//                  trades; the pricing page is the schedule.)
// VAT 15 % is put on anb capital's commission and on the Tadawul, Edaa and
// Muqassa fees, not on the CMA fee (a government levy) nor on the FINRA
// pass-through, as Sahm's schedule splits the same Saudi lines. InvestSky
// prints no foreign-investor exemption, so no remark.
//
// The "Saudi Launch Gift" (help centre, launch offer terms): 0 Saudi
// commission for 6 months after depositing SAR 5,000 "no later than April
// 30th, 2026", US commission-free once registered, "applied to until
// October 31, 2026". A new client can no longer reach the Saudi part, so the
// Saudi row is the 0.105 % list commission. The US $0 is what the pricing
// page and the help centre print today; after 2026-10-31 the US commission
// above $1 has no published figure (US_FREE_UNTIL below).
//
// FX: the SAR wallet is the only way in; "To fund your USD wallet, you must
// first deposit SAR ... Then convert it to USD directly in the app", and
// "You cannot withdraw USD directly" (deposits.mjs: SAR). InvestSky prints
// no conversion rate or spread, so the board of Arab National Bank, parent
// of anb capital (its executing broker and custodian), stands in (owner,
// 2026-10-26): USD 3.7406 / 3.763 SAR, (ask - mid) / mid = 0.30 % on the
// buy and again on the sale.
//   https://www.anb.com.sa/web/anb/exchange-rates
// US book: no US dealer is named (orders go to "our brokerage partner"),
// so the quoted NBBO. Saudi book: the Tadawul book.
//
//   https://investsky.com/en/saudi/pricing
//   https://help.investsky.com/en/articles/13452008-what-are-the-fees-for-trading-saudi-stocks
//   https://help.investsky.com/en/articles/10264778-are-there-any-fees-when-trading-u-s-stocks-under-1
//   https://help.investsky.com/en/articles/13621303-launch-offer-terms-and-conditions
//   https://help.investsky.com/en/articles/10260386-how-do-i-deposit-money-into-my-account
//
//   node brokers/investsky/investsky_cost.mjs 1120 Tadawul SAR --shares=100 --price=100
//   node brokers/investsky/investsky_cost.mjs 9400 Tadawul SAR --shares=100 --price=30
//   node brokers/investsky/investsky_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "investsky";
const CATALOGUE = new URL("investsky-parsed.json", import.meta.url);
const PAGE = "https://investsky.com/en/saudi/pricing";
const READ_ON = "2026-10-26";
const VAT = 0.15;

// Saudi, each side, fraction of the amount.
const SA = { commission: 0.00105, cma: 0.0003, market: 0.0002 };
// US, each side.
const US = {
  freeAtOrAbove: 1, // USD a share
  lowRate: 0.015, // under $1
  catPerShare: 0.000009,
  catMin: 0.01,
  tafPerShare: 0.000166,
  tafMin: 0.01,
  tafMax: 8.3,
};
const US_FREE_UNTIL = "2026-10-31";
// SAR <-> USD conversion, each way: Arab National Bank's spread over its mid.
const FX_EACH = 0.003;
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** One US side's commission, USD; null when no figure is published. */
export function usCommission(price, value, on = today()) {
  if (price < US.freeAtOrAbove) return value * US.lowRate;
  return on <= US_FREE_UNTIL ? 0 : null;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
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
    cashCurrency: "SAR",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue InvestSky n'existe pas encore : lancer `node brokers/investsky/investsky_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue InvestSky` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez InvestSky`,
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
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const american = US_MICS.has(code(listing.mic)) && listing.currency === "USD";
  const saudi = code(listing.mic) === "XSAU" && listing.currency === "SAR";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const basis = american
    ? `barème InvestSky relu le ${READ_ON}, marché US : 0 au-dessus de 1 USD (« Saudi Launch Gift », jusqu'au ${US_FREE_UNTIL}), 1,5 % de la valeur sous 1 USD ; à la vente CAT 0,000009 USD la part (min 0,01) et TAF 0,000166 USD la part (min 0,01, max 8,30) ; SEC non imprimée (0) ; TVA 15 % sur la commission ; compte en SAR, change sans taux publié`
    : `barème InvestSky relu le ${READ_ON}, marché saoudien : commission 0,105 %, CMA 0,03 %, Tadawul, Edaa et Muqassa 0,02 %, sans minimum ; TVA 15 % sur la commission et les frais de place (pas sur la CMA) : 0,17375 % par sens`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : "SAR",
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!american && !saudi) {
    return { ...shared, why: `${listing.exchange} ${listing.currency} n'a pas de ligne dans le barème InvestSky` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let commission;
  let levy;
  let settlement;
  let vat;
  let vatOnCommission;
  if (saudi) {
    commission = 2 * notional * SA.commission;
    settlement = 2 * notional * SA.market;
    levy = 2 * notional * SA.cma;
    vatOnCommission = commission * VAT;
    vat = (commission + settlement) * VAT;
  } else {
    const side = usCommission(p, notional);
    commission = side == null ? null : 2 * side;
    settlement = 0;
    const cat = Math.max(US.catMin, US.catPerShare * n);
    const taf = Math.min(US.tafMax, Math.max(US.tafMin, US.tafPerShare * n));
    levy = cat + taf; // sells only
    vatOnCommission = commission == null ? null : commission * VAT;
    vat = vatOnCommission;
  }
  const commissionUsd = dollars(commission, listing.currency);
  const settlementUsd = dollars(settlement, listing.currency);
  const levyUsd = dollars(levy, listing.currency);
  const vatUsd = dollars(vat, listing.currency);
  const vatOnCommissionUsd = dollars(vatOnCommission, listing.currency);
  // SAR converted to USD on the buy and back on the sale, at anb's spread.
  const fxUsd = held ? 0 : listing.currency === "USD" && notionalUsd != null ? notionalUsd * FX_EACH * 2 : null;
  const brokerFees = plus(commissionUsd, vatOnCommissionUsd, fxUsd);

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
  const usd = plus(bookUsd, commissionUsd, settlementUsd, levyUsd, vatUsd, taxUsd, fxUsd);

  const unknown = [
    held || fxUsd != null ? null : `change forcé SAR → ${listing.currency} à l'achat et retour à la vente : InvestSky n'imprime ni taux ni écart`,
    commission == null ? `après le ${US_FREE_UNTIL}, aucune commission US publiée au-dessus de 1 USD` : null,
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
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
    commission: { total: commission, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      règlement: finite(settlementUsd, 6),
      réglementaire: finite(levyUsd, 6),
      tva: finite(vatUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    tax,
    confidence: [
      basis,
      saudi ? "l'offre de lancement (0 commission) exigeait un dépôt avant le 30 avril 2026 : hors d'atteinte d'un nouveau client" : null,
      american ? "pas de courtier américain nommé : NBBO coté" : null,
      "aucun aller-retour réel chez InvestSky dans ce dépôt",
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
    console.error("usage : node brokers/investsky/investsky_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
