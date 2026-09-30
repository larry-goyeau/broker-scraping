// What one round trip costs at Webull: buy n shares at price p, sell them
// back at once, in dollars. A coin is bought by the amount.
//
// The affine triple hid the $1 EU floor, the UK FX cliff and the OTC
// 100 000-share surcharge. `roundTrip` is given the size and charges
// what is charged.
//
// National entities, pages re-read 2026-09-18. Default is Webull
// Financial LLC (`--plan=us`). The catalogue is `webull_scraping.mjs` —
// US listed and OTC, HKEX, a Stock Connect CNH book, and US crypto.
// Until that file has been run, this one answers that the book is
// missing. Options, futures, AU/SGX cash equities and algo
// ($0.005 / share) are not this trip.
//
//   US          listed / ordinary OTC     $0
//               OTC > 100 000 shares, p < $1
//                                   $0.0002 / share, cap 5 %
//               crypto              1 % spread each way (0 on USDC)
//               CAT NMS / OTC       $0.000003 / $0.00000003 a share, both sides
//   UK Go       US / HK / China-A   $0 + FX 0.50 %
//   UK Meridian same                $0 + FX 0.35 %
//   Europe      US shares           $1 a side (no % printed)
//   Singapore   US                  $0 (card does not name SEC / TAF)
//   Canada      US                  $0
//   Australia   US                  $0 + FX 0.50 %
//   Hong Kong   US / HK             $0
//
// SEC 0.0000206 of the sale and TAF $0.000195 / $9.79 where the card
// names regulatory fees (US and UK print the rates; EU / CA / AU / HK
// say they apply). CAT only where the card prints it (US, UK). Stamp /
// FTT from taxMap by ISIN. Tickets already in the number stay out of
// the remark. FX remarks show the one-way rate only.
//
// The 1 % crypto spread sits in the price, not on a ticket, so it is
// in `usd` and not in `brokerFees`. F-stock and NSCC illiquidity
// surcharges are named without a list of symbols and stay out.
//
//   https://www.webull.com/pricing
//   https://www.webull.com/help/faq/11091-Fees-and-Limits
//   https://www.webull-uk.com/pricing
//   https://www.webull.eu/pricing
//   https://www.webull.com.sg/pricing
//   https://www.webull.ca/pricing
//   https://www.webull.com.au/us-stocks
//   https://www.webull.hk/en/us-stocks
//
//   node webull/webull_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node webull/webull_cost.mjs AAPL NASDAQ USD --plan=uk-go --shares=10 --price=230
//   node webull/webull_cost.mjs AAPL NASDAQ USD --plan=eu --shares=10 --price=230
//   node webull/webull_cost.mjs 700 HKEX HKD --plan=uk-go --shares=10 --price=400
//   node webull/webull_cost.mjs BTC --amount=1000
//   node webull/webull_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("webull-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  us: "https://www.webull.com/pricing",
  crypto: "https://www.webull.com/help/faq/11091-Fees-and-Limits",
  uk: "https://www.webull-uk.com/pricing",
  eu: "https://www.webull.eu/pricing",
  sg: "https://www.webull.com.sg/pricing",
  ca: "https://www.webull.ca/pricing",
  au: "https://www.webull.com.au/us-stocks",
  hk: "https://www.webull.hk/en/us-stocks",
  readOn: "2026-09-18",
  entity: "Webull Financial LLC",
  crd: "289063",
};

const DEFAULT_PLAN = "us";
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_MIN = 0.01;
const CAT_NMS = 0.000003;
const CAT_OTC = 0.00000003;
const OTC_LOW_PS = 0.0002;
const OTC_LOW_CAP = 0.05;
const OTC_LOW_SHARES = 100000;
const OTC_LOW_PRICE = 1;
const CRYPTO_SPREAD = 0.01;
const STABLES = new Set(["USDC"]);
const ADR_NAMED = /\bADRs?\b|american deposit|depositary receipt/i;

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;
const HK_CODES = /^(HKEX|SEHK|XGEM)$/;

const PLANS = {
  us: {
    id: "us",
    name: "Webull US",
    hold: new Set(["USD"]),
    offers: new Set(["listed", "otc", "crypto"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: null,
    fx: 0,
    sec: true,
    taf: true,
    cat: true,
    crypto: true,
    url: "us",
  },
  "uk-go": {
    id: "uk-go",
    name: "Webull UK Go",
    hold: new Set(["GBP"]),
    offers: new Set(["listed", "hk", "china"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: 0,
    fx: 0.005,
    sec: true,
    taf: true,
    cat: true,
    crypto: false,
    url: "uk",
  },
  "uk-meridian": {
    id: "uk-meridian",
    name: "Webull UK Meridian",
    hold: new Set(["GBP"]),
    offers: new Set(["listed", "hk", "china"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: 0,
    fx: 0.0035,
    sec: true,
    taf: true,
    cat: true,
    crypto: false,
    url: "uk",
  },
  eu: {
    id: "eu",
    name: "Webull Europe",
    hold: new Set(["EUR"]),
    offers: new Set(["listed"]),
    ticket: 1,
    ticketCcy: "USD",
    hk: null,
    fx: 0,
    sec: true,
    taf: true,
    cat: true,
    crypto: false,
    url: "eu",
  },
  sg: {
    id: "sg",
    name: "Webull Singapore",
    hold: new Set(["USD", "SGD"]),
    offers: new Set(["listed"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: null,
    fx: 0,
    sec: false,
    taf: false,
    cat: false,
    crypto: false,
    url: "sg",
  },
  ca: {
    id: "ca",
    name: "Webull Canada",
    hold: new Set(["CAD", "USD"]),
    offers: new Set(["listed"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: null,
    fx: 0,
    sec: true,
    taf: true,
    cat: false,
    crypto: false,
    url: "ca",
  },
  au: {
    id: "au",
    name: "Webull Australia",
    hold: new Set(["AUD"]),
    offers: new Set(["listed"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: null,
    fx: 0.005,
    sec: true,
    taf: true,
    cat: false,
    crypto: false,
    url: "au",
  },
  hk: {
    id: "hk",
    name: "Webull Hong Kong",
    hold: new Set(["HKD", "USD"]),
    offers: new Set(["listed", "hk", "china"]),
    ticket: 0,
    ticketCcy: "USD",
    hk: 0,
    fx: 0,
    sec: true,
    taf: true,
    cat: false,
    crypto: false,
    url: "hk",
  },
};

const PLAN_ALIAS = {
  us: "us",
  usa: "us",
  "uk-go": "uk-go",
  uk: "uk-go",
  go: "uk-go",
  "uk-meridian": "uk-meridian",
  meridian: "uk-meridian",
  eu: "eu",
  europe: "eu",
  eea: "eu",
  sg: "sg",
  singapore: "sg",
  ca: "ca",
  canada: "ca",
  au: "au",
  australia: "au",
  hk: "hk",
  hongkong: "hk",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const settleCcy = (currency) => (code(currency) === "GBX" ? "GBP" : code(currency));
const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB)$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => {
  const text = code(ticker);
  const cut = text.search(/[/_:-]/);
  if (cut >= 0) return text.slice(0, cut);
  return text.replace(/[-/]?(USD|USDT|USDC)$/i, "") || text;
};

const dollars = (amount, currency) => {
  const v = toUsd(amount, settleCcy(currency) || currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(settleCcy(currency) || currency),
});

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  if (isCrypto(row)) return "crypto";
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC") return "otc";
  if (code(row?.currency) === "CNH") return "china";
  if (HK_CODES.test(raw) || m === "XHKG") return "hk";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return null;
}

export function commissionEach({ market, plan, shares, price, notional }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const n = Number(shares);
  const p = Number(price);
  const amt = Number(notional);
  if (!picked) return null;
  if (market === "crypto") return 0;
  if (!picked.offers.has(market)) return null;
  if (market === "hk" || market === "china") return picked.hk;
  if (market === "otc" && picked.id === "us" && n > OTC_LOW_SHARES && p < OTC_LOW_PRICE && amt > 0) {
    return Math.min(n * OTC_LOW_PS, OTC_LOW_CAP * amt);
  }
  if (market === "listed" || market === "otc") return picked.ticket;
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => code(r.currency) === wantCurrency)) ||
      crypto.find((r) => code(r.currency) === "USD") ||
      crypto[0];
    return { named, matches: [{ row, ...listingKey(row) }] };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named.filter((r) => !isCrypto(r));
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = isCrypto(r)
      ? { leaf: { bp: CRYPTO_SPREAD * 1e4 }, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
          broker: "webull",
          ticker: r.ticker,
        });
    const market = feeMarketOf(r, venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ plan, adr }) {
  const lines = [];
  if (plan?.id?.startsWith("uk") && adr) lines.push("ADR custody $0.01–$0.03/share.");
  else if (adr) lines.push("ADR pass-through billed as incurred.");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is Webull's own ticket and, when printed, the FX markup.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: picked ? [...picked.hold][0] : "",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan}` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Webull n'existe pas encore : lancer `node webull/webull_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Webull` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Webull`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const listingCcy = code(m.row.currency) || (crypto ? "USD" : null);
  const book = crypto
    ? { leaf: null, mic: null, assumed: false }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: listingCcy,
        unsourced: m.unsourced,
        broker: "webull",
        ticker: m.row.ticker,
      });
  const market = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Webull Crypto" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: listingCcy,
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
    adr: ADR_NAMED.test(String(m.row.name || "")),
  };

  if (!market) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié chez Webull`,
    };
  }
  if (!picked.offers.has(market)) {
    return {
      ...answer,
      listing,
      onlineBuy: false,
      why: `${picked.name} ne vend pas ce palier (${market})`,
    };
  }
  if ((market === "hk" || market === "china") && picked.hk == null) {
    return {
      ...answer,
      listing,
      why: `${picked.name} n'imprime pas de ticket ${market}`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { known: true, buy: {}, sell: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const holdable = picked.hold.has(settleCcy(listing.currency));
  const fxPct = !crypto && !holdable ? picked.fx : 0;
  const coin = cryptoBase(m.row.ticker || etf);
  const stable = crypto && STABLES.has(coin);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: holdable ? listing.currency : [...picked.hold][0] || "",
    remark: remarkOf({ plan: picked, adr: listing.adr }),
    bp: crypto ? (stable ? 0 : CRYPTO_SPREAD * 1e4) : marketBp,
    perShare: marketPerShare,
    url: SCHEDULE[picked.url] || SCHEDULE.us,
    basis: `barème ${picked.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: fxPct * 2,
  };

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;
  const each = commissionEach({ market, plan: picked, shares: n, price: p, notional });

  shared.commission = {
    rate: crypto ? 0 : 0,
    flat: crypto ? 0 : each,
    currency: picked.ticketCcy,
    eachWay: true,
    plan: picked.id,
    ...(crypto ? { spread: stable ? 0 : CRYPTO_SPREAD } : {}),
  };

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        via606: book.via606,
        fxPct,
        holdable,
        taxTotal,
        stable,
        coin,
      }),
    };
  }

  const notionalUsd = dollars(notional, crypto ? "USD" : listing.currency);
  const commissionUsd = each == null ? null : dollars(each * 2, picked.ticketCcy);
  const spreadUsd = crypto ? (stable || notionalUsd == null ? 0 : notionalUsd * CRYPTO_SPREAD * 2) : 0;
  const bookUsd = crypto
    ? spreadUsd
    : marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const american = market === "listed" || market === "otc";
  const secUsd = picked.sec && american && notionalUsd != null ? notionalUsd * SEC_RATE : 0;
  const tafRaw = picked.taf && american && n > 0 ? n * TAF_PER_SHARE : 0;
  const tafUsd = picked.taf && american ? Math.min(Math.max(tafRaw, tafRaw ? TAF_MIN : 0), TAF_CAP) : 0;
  const catRate = market === "otc" ? CAT_OTC : CAT_NMS;
  const catUsd = picked.cat && american && n > 0 ? n * catRate * 2 : 0;
  const taxUsd = crypto || notionalUsd == null ? 0 : notionalUsd * taxTotal;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, catUsd, taxUsd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto ? "USD" : listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, catUsd), 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    sell: picked.sec || picked.taf
      ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafUsd >= TAF_CAP, cat: finite(catUsd, 6) }
      : null,
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      via606: book.via606,
      fxPct,
      holdable,
      taxTotal,
      stable,
      coin,
      each,
      n,
      p,
      american: market === "listed" || market === "otc",
    }),
  };
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  via606,
  fxPct,
  holdable,
  taxTotal,
  stable,
  coin,
  each,
  n,
  p,
  american,
}) {
  const said = [];
  said.push(`barème ${picked.name} ${market}, relu le ${SCHEDULE.readOn}`);
  if (market === "crypto") {
    said.push(
      stable
        ? `USDC : le 1 % ne s'applique pas aux stablecoins`
        : `spread ${CRYPTO_SPREAD * 100} % par jambe, dans le prix, pas un ticket (FAQ ${SCHEDULE.readOn})`
    );
  } else if (each) {
    said.push(`ticket ${each} ${picked.ticketCcy} par jambe`);
  } else {
    said.push(`courtage 0`);
  }
  if (market === "otc" && picked.id === "us") {
    said.push(
      n > OTC_LOW_SHARES && p < OTC_LOW_PRICE
        ? `surcharge OTC ${OTC_LOW_PS} $/part, plafond ${OTC_LOW_CAP * 100} %`
        : `surcharge OTC $0.0002 / part seulement au-delà de ${OTC_LOW_SHARES} parts sous $1`
    );
  }
  if (fxPct) {
    said.push(
      `change ${(fxPct * 100).toFixed(2)} % × 2 : ${listing.currency} n'est pas tenu, donc dans le total`
    );
  } else if (!holdable && market !== "crypto") {
    said.push(
      `change hors du total : ${listing.currency} n'est pas une devise de caisse imprimée, et aucun % n'est publié`
    );
  } else if (holdable && market !== "crypto") {
    said.push(`change hors du total : le compte tient déjà ${listing.currency}`);
  }
  if (american && picked.sec) {
    said.push(
      `SEC ${SEC_RATE} du montant à la vente` +
        (picked.taf ? ` et TAF ${TAF_PER_SHARE} $/part, plancher ${TAF_MIN} $, plafond ${TAF_CAP} $` : "")
    );
  } else if (american && !picked.sec) {
    said.push(`SEC / TAF non nommés sur cette carte`);
  }
  if (american && picked.cat) {
    said.push(
      `CAT ${market === "otc" ? CAT_OTC : CAT_NMS} $/part les deux jambes` +
        (picked.id === "us" ? ` (la page US dit « Total Trade Volume », le UK dit « per Share »)` : "")
    );
  }
  if (taxTotal) said.push(`taxe à l'achat ${(100 * taxTotal).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (market === "crypto" && coin === "PAXG") {
    said.push(`PAXG n'est pas un stablecoin : le 1 % tient`);
  } else if (market !== "crypto" && marketBp != null) {
    said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  } else if (marketPerShare != null) {
    said.push(
      via606
        ? `carnet 605 × Q Webull, ${marketPerShare} $ la part`
        : `carnet NBBO reconstitué, ${marketPerShare} $ la part`
    );
  } else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  said.push(`aucun aller-retour réel dans ce dépôt`);
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          defaultPlan: DEFAULT_PLAN,
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([id, p]) => [
              id,
              { ...p, hold: [...p.hold], offers: [...p.offers] },
            ])
          ),
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, min: TAF_MIN, cap: TAF_CAP },
          cat: { nms: CAT_NMS, otc: CAT_OTC },
          crypto: { spread: CRYPTO_SPREAD, stables: [...STABLES] },
          coverage: coverage(),
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
    console.error(
      "usage : node webull/webull_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=a] [--plan=us|uk-go|uk-meridian|eu|sg|ca|au|hk] [--json]\n" +
        "        node webull/webull_cost.mjs --schedule\n" +
        "  ex.   node webull/webull_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node webull/webull_cost.mjs AAPL NASDAQ USD --plan=uk-go --shares=10 --price=230\n" +
        "        node webull/webull_cost.mjs AAPL NASDAQ USD --plan=eu --shares=10 --price=230\n" +
        "        node webull/webull_cost.mjs 700 HKEX HKD --plan=uk-go --shares=10 --price=400\n" +
        "        node webull/webull_cost.mjs BTC --amount=1000"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Webull propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.plan}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} $ de crypto\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
