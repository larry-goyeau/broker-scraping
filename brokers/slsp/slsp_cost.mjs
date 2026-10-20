// What one round trip costs at Slovenská sporiteľňa (Erste Group, Slovakia),
// trading in George: buy n shares at price p, sell them back at once, in
// dollars. One row per investment programme (`query.plan`): STANDARD,
// EXPLORE and TRADE.
//
// Read 2026-10-20:
//   Sadzobník, Časť A, fyzické osoby nepodnikatelia, published 24 April
//   2026, in force from 1 July 2026, section 6 "Investovanie", pp. 16-18:
//   https://cdn.erstegroup.com/content/dam/sk/slsp/www_slsp_sk/documents/sadzobnik/sadzobnik-obyvatelstvo.pdf
//   Podmienky poskytovania Služieb (investment programmes, order and FX
//   conditions, list of places), in force from 18 April 2026:
//   https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/podmienky-investovania-do-cennych-papierov.pdf
//   Programme page (what EXPLORE and TRADE include):
//   https://www.slsp.sk/sk/ludia/investovanie
//   Kurzový lístok, devízy, 20 Oct 2026 16:25:05 (the page and its API):
//   https://www.slsp.sk/sk/kurzovy-listok
//   https://api.slsp.sk/api/v1/fxRatesList?rateType=All&currencies=EUR;USD;CZK;PLN;HUF;GBP;CHF;AUD;CAD;RUB;JPY;NOK;DKK;SEK;RON
//   Execution policy (MiFID brochure, section 9):
//   https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/Ine/mifid-brozura-web.pdf
//
// Commission, Slovak and foreign securities, of the transaction volume,
// each order. George column (footnote 3); the 25 € branch minimum stays out.
//   0.01 to 10,000 €          1.00 %, min 5 €
//   10,000.01 to 100,000 €    0.70 %
//   from 100,000.01 €         0.40 %
// The band is that of the whole order. A foreign volume is sized in euro at
// the fx.mjs mid.
//
// Programmes:
//   STANDARD  0 a month. Every order pays the commission above. Custody of
//             foreign securities 0.60 %/year (ETF, ETC) or 0.40 %/year
//             (other), Slovak securities 0.20 %/year: the remark.
//   EXPLORE   0.70 %/year of the portfolio, at least 3 € a month. 3 orders
//             a month free, each up to 10,000 €; custody included.
//   TRADE     1.00 %/year, at least 9 € a month. 9 free orders a month,
//             same 10,000 € ceiling.
// A round trip is two orders, inside both free counts. An order above
// 10,000 € pays the commission table. The programme fee is the remark.
// The free monthly fee ran only until 31 July 2026. Crypto ETPs are in the
// "wider offer" of EXPLORE and TRADE only: under STANDARD they are not
// bought online (onlineBuy: false).
//
// "Additional fees and costs" of a foreign place may be added (Sadzobník,
// footnote 2), without an amount. The German places' own charges (Xetra,
// Frankfurt, Stuttgart, Munich, Düsseldorf, Hamburg, Hannover) are priced
// as in brokers/consorsbank/consorsbank_cost.mjs (`exchangeFeeEur`, each
// exchange's list in force in 2026). Other foreign places' fees stay at 0.
// Stamp duty and the FTTs come from taxMap.mjs.
//
// FX. A trade in another currency than the account is converted at the
// bank's kurzový lístok (Podmienky, p. 4). Accounts: EUR, and the SPACE účet
// MINI in USD, CZK, GBP, HUF or PLN (deposits.mjs). The devízy list quotes
// only those five: half the buy/sell spread is 2.50 % for each, which is the
// remark on a listing in one of them. CHF, NOK, SEK, DKK, CAD and AUD have
// no published rate and no account: that forced conversion is unknown, so
// those rows are N/A. The list holds "up to a limit set by the bank", not
// printed; above it the rate is the interbank one.
//
// US lines. Orders go to the exchange, or to Erste Group Bank AG when the
// bank is not a member; no US broker-dealer is named, so the book is the
// quoted NBBO. SEC fee and TAF are not published and stay 0.
//
//   node brokers/slsp/slsp_cost.mjs DE0007164600 XETR EUR --shares=10 --price=230
//   node brokers/slsp/slsp_cost.mjs US0378331005 XNAS USD --shares=10 --price=250 --plan=explore
//   node brokers/slsp/slsp_cost.mjs AT0000652011 XWBO EUR --shares=100 --price=70 --plan=trade
//   node brokers/slsp/slsp_cost.mjs CH0038863350 XSWX CHF --shares=10 --price=80
//   node brokers/slsp/slsp_cost.mjs --schedule
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
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { exchangeFeeEur } from "../consorsbank/consorsbank_cost.mjs";

const CATALOGUE = new URL("slsp-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://cdn.erstegroup.com/content/dam/sk/slsp/www_slsp_sk/documents/sadzobnik/sadzobnik-obyvatelstvo.pdf",
  programmes: "https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/podmienky-investovania-do-cennych-papierov.pdf",
  fx: "https://www.slsp.sk/sk/kurzovy-listok",
  readOn: "2026-10-20",
  tariffOn: "2026-07-01",
  entity: "Slovenská sporiteľňa",
};

// Sadzobník p. 17: the band is the order's volume in euro.
const BANDS = [
  { to: 10000, rate: 0.01, min: 5 },
  { to: 100000, rate: 0.007, min: 0 },
  { to: Infinity, rate: 0.004, min: 0 },
];

// Sadzobník p. 16 and the programme conditions, p. 2.
const PLANS = {
  standard: { id: "standard", label: "STANDARD", free: 0 },
  explore: { id: "explore", label: "EXPLORE", free: 3, yearly: 0.007, monthlyMin: 3 },
  trade: { id: "trade", label: "TRADE", free: 9, yearly: 0.01, monthlyMin: 9 },
};
const FREE_CEILING_EUR = 10000;

// Sadzobník p. 18, STANDARD only.
const CUSTODY = { fund: 0.006, other: 0.004, slovak: 0.002 };

// Devízy, kurzový lístok of 20 Oct 2026 16:25:05, units per euro: the bank
// sells (client buys the currency), then buys.
const FX_BOARD = {
  USD: [1.0939, 1.1499],
  CZK: [23.725, 24.942],
  PLN: [4.2608, 4.4794],
  HUF: [353.75, 371.9],
  GBP: [0.821, 0.8631],
};
const FX_BOARD_AT = "2026-10-20T16:25:05";

// The bank's German places, by MIC, as consorsbank's `exchangeFeeEur` names them.
const GERMAN = {
  XETR: { exchange: "xetra", label: "Xetra" },
  XFRA: { exchange: "frankfurt", label: "Frankfurt" },
  XSTU: { exchange: "stuttgart", label: "Stuttgart" },
  XMUC: { exchange: "munich", label: "Munich" },
  XQTX: { exchange: "dusseldorf", label: "Düsseldorf" },
  XHAM: { exchange: "boag", label: "Hamburg" },
  XHAN: { exchange: "boag", label: "Hannover" },
};
const US = new Set(["XNYS", "XNAS", "XASE", "ARCX"]);
const CRYPTO = /\b(BITCOIN|ETHEREUM|RIPPLE|SOLANA|BINANCE|CRYPTO)\b.*\bETP\b/i;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function eurOf(amount, currency) {
  const ccy = code(currency);
  if (!(amount >= 0) || !ccy) return null;
  if (ccy === "EUR") return amount;
  const usd = toUsd(amount, ccy);
  const per = usdPer("EUR");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

const pct = (x) => String(Number((100 * x).toFixed(2)));

export function commissionEur(volumeEur) {
  const band = BANDS.find((b) => volumeEur <= b.to);
  return Math.max(volumeEur * band.rate, band.min);
}

// Half the devízy spread, as a fraction, or null when the bank quotes none.
export function fxHalf(currency) {
  const pair = FX_BOARD[listingCash(currency)];
  if (!pair) return null;
  const [sell, buy] = pair;
  return (buy - sell) / (buy + sell);
}

function custodyOf(listing) {
  if (String(listing.isin || "").startsWith("SK")) return CUSTODY.slovak;
  return ["ETF", "ETC", "ETN", "ETP"].includes(listing.type) ? CUSTODY.fund : CUSTODY.other;
}

function planRemark(plan, listing) {
  if (plan.id === "standard") return `Custody ${pct(custodyOf(listing))}%/year.`;
  return (
    `Plan fee ${pct(plan.yearly)}%/year, min ${plan.monthlyMin} € a month.\n` +
    `${plan.free} free orders a month, up to 10,000 € each.`
  );
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
      if (loose(m.row.mic) === wantPlace || loose(m.row.exchange) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the bank's commission
 * plus the German exchange's own charge.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = "standard" }) {
  const chosen = PLANS[plan] || PLANS.standard;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: chosen.id,
    onlineBuy: true,
    cashCurrency: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Slovenská sporiteľňa n'existe pas encore : lancer `node brokers/slsp/slsp_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Slovenská sporiteľňa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Slovenská sporiteľňa`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "slsp",
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
  const rowMic = code(m.row.mic || listing.mic);
  const cash = listingCash(listing.currency);
  const held = cash === "EUR" || depositHas("slsp", null, cash);
  const half = fxHalf(listing.currency);
  const american = US.has(rowMic) && listing.currency === "USD";
  const german = GERMAN[rowMic] || null;
  const crypto = CRYPTO.test(listing.name || "");

  const remarks = [planRemark(chosen, listing)];
  if (held && cash !== "EUR" && half != null) remarks.push(fxRemark(pct(half), listing.currency));
  // A euro line is bought from a USD, CZK, PLN, HUF or GBP account at the
  // board's half spread, the same 2.5% for each today.
  if (cash === "EUR") {
    const halves = [...new Set(Object.keys(FX_BOARD).map((ccy) => pct(fxHalf(ccy))))];
    const label = halves.length === 1 ? halves[0] : `${halves.sort((x, y) => x - y)[0]}–${halves.at(-1)}`;
    remarks.push(fxRemark(label, "EUR"));
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "EUR",
    onlineBuy: !(crypto && chosen.id === "standard"),
    remark: remarks.join("\n"),
    url: SCHEDULE.url,
    basis:
      `sadzobník Slovenská sporiteľňa en vigueur le ${SCHEDULE.tariffOn}, relu le ${SCHEDULE.readOn} : ` +
      `George 1 % min 5 € jusqu'à 10 000 €, 0,70 % jusqu'à 100 000 €, 0,40 % au-delà ; programme ${chosen.label}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (crypto && chosen.id === "standard") {
    return { ...shared, why: "ETP crypto : seulement dans l'offre élargie des programmes EXPLORE et TRADE" };
  }
  if (!held) {
    return {
      ...shared,
      why:
        `aucun compte en ${cash} et aucun cours ${cash} au kurzový lístok de la banque : ` +
        `conversion EUR→${cash} forcée, au cours non publié`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = eurOf(notional, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (notionalEur == null) return { ...shared, trade, why: `aucun cours de l'euro pour convertir ${listing.currency}` };

  // Bank commission, one order. Free inside the programme's count and ceiling.
  const free = chosen.free >= 2 && notionalEur <= FREE_CEILING_EUR;
  const commission = free ? 0 : commissionEur(notionalEur);

  // The German exchange's own charge, same both ways.
  const bourse = german ? exchangeFeeEur(german, notionalEur, listing) : null;
  if (bourse && bourse.eur == null) return { ...shared, trade, why: bourse.why };
  const bourseEach = bourse?.eur ?? 0;

  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "slsp", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const brokerFees = dollars(2 * (commission + bourseEach), "EUR");
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    shared.basis,
    free
      ? `ordre gratuit : 2 ordres sur les ${chosen.free} du mois, chacun sous 10 000 €`
      : `commission ${commission.toFixed(2)} € par ordre sur ${notionalEur.toFixed(2)} €`,
    bourse?.note ? `${bourse.note}, par ordre (grille de la bourse, comme consorsbank)` : null,
    !german && !US.has(rowMic) && rowMic !== "XBRA" ? "frais de place étrangère éventuels (note 2) non chiffrés, comptés à 0" : null,
    american ? "SEC et TAF non publiés, comptés à 0" : null,
    cash === "EUR"
      ? "montant en euro"
      : `compte en ${cash} possible : change ${pct(half)} % (demi-écart devízy du ${FX_BOARD_AT}) hors total`,
    taxTotal > 0 ? `taxe ${(100 * taxTotal).toFixed(3)} % à l'achat (taxMap)` : null,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet NBBO coté ${marketPerShare} $ la part : aucun courtier US nommé`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      each: commission + bourseEach,
      commissionEach: commission,
      ...(bourse ? { exchangeEach: bourse.eur } : {}),
      free,
      currency: "EUR",
      eachWay: true,
    },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          bands: BANDS,
          plans: PLANS,
          freeCeilingEur: FREE_CEILING_EUR,
          custody: CUSTODY,
          fxBoard: { at: FX_BOARD_AT, ...FX_BOARD },
          rule606: null,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/slsp/slsp_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=standard|explore|trade]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan") || "standard",
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""} [${out.plan}]`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (!out.onlineBuy) console.log("\n(pas achetable en ligne dans ce programme)");
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
