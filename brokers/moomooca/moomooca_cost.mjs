// What one round trip costs at moomoo Canada (Moomoo Financial Canada Inc.,
// carried by Canaccord Genuity Corp.): buy n shares, sell them back, in
// dollars. Online cash order on a US or Canadian listed stock or ETF. US
// options, margin and market-data cards stay out.
//
// Fee schedule, read on 2026-10-21:
//   https://www.moomoo.com/ca/support/topic10_122   US market commission & fees
//   https://www.moomoo.com/ca/support/topic10_123   Canada market commission & fees
//   https://www.moomoo.com/ca/support/topic10_125   currency conversion fee schedule
//   https://www.moomoo.com/ca/pricing, /ca/pricing/us-stock, /ca/pricing/ca-stock
//                                                   (same figures: US min. 1.99, CAD min. 1.49)
//   https://www.moomoo.com/ca/support/topic10_235   carrying broker Canaccord Genuity Corp.
//                                                   (since 22 Sep 2025); no US dealer named
//
//   US stocks and ETFs, each side, USD. The same card "also applies to
//   Canadian stocks and ETFs denominated in USD".
//                       price >= 1.00 USD            price < 1.00 USD
//     commission        0.0049 a share, min 0.99     0.0005 a share, min 0.99
//     platform          0.005 a share, min 1.00      0.0005 a share, min 1.00
//     SEC               0.0000206 of the sale, min 0.01 USD a trade, sell only,
//                       on a US listing (collected by Canaccord Genuity Corp.)
//   No TAF and no CAT is printed: they stay at 0.
//   Canadian stocks and ETFs in CAD, each side, CAD
//                       price >= 1.00 CAD            price < 1.00 CAD
//     commission        0.0049 a share, min 0.49     0.0005 a share, min 0.49
//     platform          0.01 a share, min 1.00       0.001 a share, min 1.00
//   The page's own examples (2,000 at 0.20: 3.00 CAD; 400 at 0.20: 1.49 CAD;
//   2,000 at 0.20 USD: 2.00 USD; 500 at 0.20 USD: 1.99 USD) are this card.
//   Both cards add "ECN and/or specialist fees may apply, depending on the
//   execution venue" with no rate; nothing is charged for them here. The CA
//   card's "VAT ... applied separately to eligible services" reaches no
//   share trade: Canadian GST/HST exempts a securities brokerage commission.
//   Stamp and transaction taxes by ISIN from taxMap.mjs (UK and Irish stamp
//   only on their home book, so none here; Italian FTT where the map has it).
//
// Cash. EFT and wire take CAD or USD and each stays in its own currency
// (deposits.mjs: CAD, USD), so every line of the catalogue is held as it is
// and no conversion is in the total. Moving cash between them is at the
// "Moomoo Preferred Rate, a live rate that includes a spread", with a 0 %
// fee "waived until further notice"; the spread is not printed, so the
// remark names no rate: "FX when cash ≠ CCY." (fxRemark, as moomoo JP).
//
// Book. Canadian lines take the venue's own book (spreads/book.mjs). US
// lines: the schedule names Canaccord Genuity Corp. as carrying broker and
// no US dealer; CGC sends US-only retail orders to Citadel Securities or
// Virtu Americas, so the US book takes their Q (owner's choice, alias in
// spreads/rule606.mjs).
//
//   node brokers/moomooca/moomooca_cost.mjs SHOP "Toronto Stock Exchange" CAD --shares=10 --price=150
//   node brokers/moomooca/moomooca_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("moomooca-parsed.json", import.meta.url);
const US_PAGE = "https://www.moomoo.com/ca/support/topic10_122";
const CA_PAGE = "https://www.moomoo.com/ca/support/topic10_123";
const READ_ON = "2026-10-21";
const SEC_RATE = 0.0000206;
const SEC_MIN = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "XCHI"]);
const CA_MICS = new Set(["XTSE", "XTSX", "XTNX", "XCNQ", "NEOE"]);
const STAMP_HOME = { GB: new Set(["XLON", "AQXE", "XMSM"]), IE: new Set(["XMSM", "XLON", "AQXE"]) };

// Per side, in the card's currency: [perShare, min] for commission and platform.
const CARDS = {
  usd: {
    high: { commission: [0.0049, 0.99], platform: [0.005, 1] },
    low: { commission: [0.0005, 0.99], platform: [0.0005, 1] },
  },
  cad: {
    high: { commission: [0.0049, 0.49], platform: [0.01, 1] },
    low: { commission: [0.0005, 0.49], platform: [0.001, 1] },
  },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const num = (x) => String(x).replace(".", ",");

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

// "US" or "CA" by the place, "" when the schedule has no line for it.
function marketOf(listing) {
  if (US_MICS.has(listing.mic)) return "US";
  if (CA_MICS.has(listing.mic)) return "CA";
  return "";
}

// The card follows the currency: USD (a Canadian USD line included) or CAD.
function cardOf(currency) {
  if (currency === "USD") return "usd";
  if (currency === "CAD") return "cad";
  return "";
}

function side(card, shares, price) {
  const tier = CARDS[card][price >= 1 ? "high" : "low"];
  const commission = Math.max(tier.commission[1], shares * tier.commission[0]);
  const platform = Math.max(tier.platform[1], shares * tier.platform[0]);
  const r = (x) => Number(x.toPrecision(12));
  return { commission: r(commission), platform: r(platform), total: r(commission + platform) };
}

const BASIS = {
  usd:
    `livraison en ligne, barème moomoo Canada relu le ${READ_ON}. Commission 0,0049 USD l'action (min 0,99) et plateforme 0,005 USD l'action (min 1), ` +
    `0,0005 + 0,0005 USD l'action sous 1 USD ; même barème pour une ligne canadienne en USD. Vente identique.`,
  cad:
    `livraison en ligne, barème moomoo Canada relu le ${READ_ON}. Commission 0,0049 CAD l'action (min 0,49) et plateforme 0,01 CAD l'action (min 1), ` +
    `0,0005 + 0,001 CAD l'action sous 1 CAD. Vente identique.`,
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
    url: US_PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue moomoo Canada n'existe pas encore : lancer `node brokers/moomooca/moomooca_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue moomoo Canada` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez moomoo Canada`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "moomooca",
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
  const market = marketOf(listing);
  const card = cardOf(listing.currency);
  const cash = listingCash(listing.currency);
  const held = depositHas("moomooca", null, cash);
  const shared = {
    ...answer,
    listing,
    cashCurrency: cash,
    url: card === "cad" ? CA_PAGE : US_PAGE,
    remark: held ? fxRemark("", cash) : "",
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème moomoo Canada` };
  if (!card || (market === "US" && card !== "usd")) {
    return { ...shared, why: `pas de barème moomoo Canada pour une ligne en ${listing.currency} sur ${listing.exchange}` };
  }
  if (!held) {
    return { ...shared, why: `change forcé vers ${listing.currency} : seuls CAD et USD sont détenus, aucun cours publié` };
  }

  const sec = market === "US";
  const basis = BASIS[card] + (sec ? " SEC 0,00206 % de la vente (min 0,01 USD), ni TAF ni CAT imprimés." : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(card, n, p);
  const brokerLocal = Number((each.total * 2).toPrecision(12));
  const levyLocal = sec ? Number(Math.max(SEC_MIN, notional * SEC_RATE).toPrecision(12)) : 0;
  const brokerFees = dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);

  // Taxes by ISIN; UK / Irish stamp only on their home book.
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const country = (listing.isin || "").slice(0, 2);
  const stampReaches = !STAMP_HOME[country] || STAMP_HOME[country].has(code(listing.mic));
  const taxPct = stampReaches ? Object.values(rates).reduce((s, r) => s + r, 0) : 0;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US" && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "moomooca", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: market === "US" && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levyUsd, taxUsd);
  const unknown = [
    gap,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    basis,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: each.total,
      sell: each.total,
      commission: each.commission,
      platform: each.platform,
      currency: listing.currency,
    },
    levy: { amount: levyLocal, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levyUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      basis,
      taxPct ? `taxe à l'achat ${Object.entries(rates).map(([k, v]) => `${k} ${num(+(100 * v).toFixed(2))} %`).join(", ")} (taxMap.mjs)` : null,
      market === "US"
        ? "aucun courtier américain nommé : NBBO coté (605 × Q une fois l'alias posé)"
        : marketBp != null
          ? `carnet ${Number(marketBp.toPrecision(4))} bp`
          : "pas de carnet",
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
  const [symbol, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf: symbol,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
