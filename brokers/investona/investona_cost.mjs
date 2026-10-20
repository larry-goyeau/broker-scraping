// What one round trip costs at Investona (Czech Asset Investments, a.s.,
// Czech Republic) in « Akcie a ETF » / « Vlastní strategie »: buy n shares
// at price p and sell them straight back, in dollars.
//
// Ceník produktů a služeb Investona in force from 7 April 2026, read on
// 2026-10-20:
//   https://www.investona.cz/static/investona_cenik.pdf
//   https://www.investona.cz/cenik
//   Obstarání obchodů s Investičními nástroji, které jsou obchodovány na
//   burze: akcie, ETF                    0.99 % a year (p.a.), VAT included
// The price page lists what that one fee covers and what is not charged on
// top: no entry or exit fee, no fee for buys and sells, no fee for currency
// conversions. The cost disclosure of the Základní informace pro zákazníky
// (in force from 15 September 2026, Příloha č. 2, « ETF a Akcie ») prints
// the same: entry 0 %, 0.99 % a year, nothing else.
//   https://www.investona.cz/static/150926_zakladni_informace_pro_klienty.pdf
// The 0.99 % is a charge on holding (accrued monthly, in arrears, pro rata
// on the days held), not on the order, so the round trip pays no
// commission and the annual fee is the remark.
//
// Orders go to Saxo Bank A/S (Základní informace, 12.2). Saxo's RTS 28 gives US-traded shares to Citadel Securities LLC, so the
// US book is the blended 605 × Citadel's Q (alias in spreads/rule606.mjs).
//
// Currency. Investona's only deposit currency is CZK (deposits.mjs). The
// strategy page says Investona converts the money itself at no extra fee:
//   https://www.investona.cz/vlastni-strategie
// The Obchodní podmínky (6. Devizové služby, 6.1) say every cost of that
// conversion is the client's, at the rate of the bank, execution venue or
// other institution Investona converts with:
//   https://www.investona.cz/static/obchodni_podminky.pdf
// No rate is published by Investona. Client money sits in CZK accounts at
// ČSOB, so the conversion is priced at ČSOB's kurzovní lístek (deviza
// nákup / prodej, 2026-10-20), half its spread on each leg: EUR and USD
// 2.62% (owner's choice, 2026-10-20). The price page's "no conversion fee"
// is Investona's own fee, on top of that rate.
//   https://www.csob.cz/spa/exrate/exrates/2026-10-20/kurzovni-listek.xml
// A crown line needs no conversion.
//
// Stamp and transaction taxes come from taxMap, on the buy.
//
//   node brokers/investona/investona_cost.mjs CEZ XPRA CZK --shares=10 --price=1100
//   node brokers/investona/investona_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/investona/investona_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("investona-parsed.json", import.meta.url);

const SCHEDULE = {
  priceList: "https://www.investona.cz/static/investona_cenik.pdf",
  pricePage: "https://www.investona.cz/cenik",
  strategy: "https://www.investona.cz/vlastni-strategie",
  terms: "https://www.investona.cz/static/obchodni_podminky.pdf",
  costs: "https://www.investona.cz/static/150926_zakladni_informace_pro_klienty.pdf",
  readOn: "2026-10-20",
  inForceFrom: "2026-04-07",
  entity: "Czech Asset Investments, a.s. (Investona)",
  executingBroker: "Saxo Bank A/S",
};

// One side of an order: nothing (« Poplatky za nákupy a prodeje » not charged).
const COMMISSION = 0;
// ČSOB deviza buy and sell, CZK for one unit, 2026-10-20.
const FX_BOARD = { EUR: [23.693, 24.967], USD: [21.104, 22.241] };
const FX_BOARD_AT = "2026-10-20";
// Half the spread: the cost of one conversion against the mid.
const fxHalf = (ccy) => {
  const pair = FX_BOARD[listingCash(ccy)];
  return pair ? (pair[1] - pair[0]) / (pair[1] + pair[0]) : null;
};
const pctText = (x) => String(Number((100 * x).toFixed(2))).replace(".", ",");
// The one fee, on the value held, a year.
const ANNUAL_FEE = 0.0099;
const HOLD = new Set(["CZK"]);

const REMARK = "Fee 0.99%/year of holdings.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

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
    cashCurrency: "",
    url: SCHEDULE.priceList,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Investona n'existe pas encore : lancer `node brokers/investona/investona_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Investona` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Investona`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange || "place non dite"}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? null;
  const american = code(m.row.currency) === "USD" && isListedUsTape(mic);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "investona",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const held = HOLD.has(listing.currency);
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? listing.currency : "",
    remark: REMARK,
    basis:
      `ceník Investona du ${SCHEDULE.inForceFrom}, relu le ${SCHEDULE.readOn}, akcie et ETF : ` +
      `0,99 % par an sur l'avoir, ni frais d'achat ni frais de vente` +
      (held ? "" : ` ; change forcé CZK ↔ ${listingCash(listing.currency)} dans le total, demi-écart du kurzovní lístek ČSOB du ${FX_BOARD_AT}`),
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commissionUsd = dollars(COMMISSION * 2, listing.currency);
  // A dollar or euro line is bought with crowns converted by Investona and
  // sold back into crowns: both legs at half of ČSOB's buy/sell spread.
  const half = held ? 0 : fxHalf(listing.currency);
  const fxUsd = held ? 0 : notionalUsd == null || half == null ? null : notionalUsd * half * 2;
  const brokerFees = plus(commissionUsd, fxUsd);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    "courtage 0 : les achats et les ventes ne sont pas facturés (ceník, page cenik)",
    held
      ? "pas de change : la couronne est la devise du compte"
      : half == null
        ? `change forcé CZK ↔ ${listingCash(listing.currency)} : pas de cours ČSOB pour cette devise, total inconnu`
        : `change forcé CZK ↔ ${listingCash(listing.currency)} deux fois, ${pctText(half)} % par sens (demi-écart deviza du kurzovní lístek ČSOB du ${FX_BOARD_AT}, banque des comptes clients) ; Investona ne publie pas son cours (obchodní podmínky 6.1)`,
    american ? "ordres chez Saxo Bank A/S, actions US chez Citadel Securities LLC : carnet 605 × Q de Citadel ; SEC et TAF absents du ceník" : "",
    taxPct > 0 ? `taxes à l'achat ${(100 * taxPct).toFixed(2).replace(".", ",")} % (taxMap)` : "",
    marketPerShare != null
      ? `carnet ${marketPerShare} la part`
      : marketBp != null
        ? `carnet ${marketBp} bp à ${listing.exchange}`
        : `pas de carnet pour ${listing.exchange || "cette ligne"}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  const why = fxUsd == null && notionalUsd != null
    ? `change forcé CZK ↔ ${listingCash(listing.currency)} sans cours ČSOB publié`
    : bookUsd == null
      ? `aucun carnet pour ${listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: 0, each: 0, currency: listing.currency, eachWay: true, annualFee: ANNUAL_FEE },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
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
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          commission: COMMISSION,
          annualFee: ANNUAL_FEE,
          hold: [...HOLD],
          fx: { forced: "USD and EUR", rate: "half of ČSOB's deviza spread each way", board: FX_BOARD, asOf: FX_BOARD_AT },
        },
        null,
        2
      )
    );
    return;
  }
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/investona/investona_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
