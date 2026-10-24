// What one round trip costs at BDO Securities: buy n shares at price p,
// sell them back at once, in dollars. Online. A broker-assisted account
// is not this order.
//
// The FAQ "BDO Securities Fees & Charges", Trade-related Fees, read on the
// Wayback Machine copies of 15 November 2025 and 21 May 2026 (bdo.com.ph
// hangs for scripts), buy and sell:
//   SCCP fee            "0.010% of the gross amount", each side
//   Broker's Commission "0.25% of the gross amount", each side
//   VAT                 "12% of the broker's commission", each side
//   Sales Tax           "0.10% of the gross selling amount", on the sell
// The table has no PSE transaction fee line. Every PSE trade pays the
// exchange's 0.005% of the gross each side ("For all stock trades that go
// through the exchange or the PSE, the PSE charges 0.005%", China Bank
// Securities' FAQ), the line every other PSE broker prints, so it is added
// here, as in mytrade.
//
// Floor: the old FAQ (/securities/frequently-asked-questions, Wayback
// June 2023) printed "Minimum Commission charge is Php 20.00 or 0.25% of
// trade value, whichever is higher". The current FAQ (/bdo-securities/faqs,
// November 2025 and May 2026) prints no minimum, so no floor is applied.
// No rounding rule is printed. A share and the PSE's ETF take this one
// table. There is no maintaining balance. Lodgement and upliftment are not
// this order.
//
// The settlement account can be in pesos or in dollars (deposits.mjs), so
// the three PSE lines in dollars (DTEL, TCB2A, TCB2B) are priced in
// dollars on the same percentages, with no conversion. Cash held in the
// other currency is converted: BDO Securities prints no rate, so BDO
// Unibank's own board stands in (owner's choice, 2026-10-24). On
// 2026-10-23, 9:03 am, it read US dollar "Bank's Buy Rate" 63.2500 and
// "Bank's Sell Rate" 63.7500 pesos ("Rates are indicative only"): half
// the gap over the mid, 0.39% each way, is the remark "FX 0.39% when
// cash ≠ PHP." (or ≠ USD on a dollar line).
//
//   https://www.bdo.com.ph/forex
//   https://www.bdo.com.ph/bdo-securities/faqs
//   https://web.archive.org/web/20260521050426/https://www.bdo.com.ph/bdo-securities/faqs
//   https://web.archive.org/web/20230603141224/https://www.bdo.com.ph/securities/frequently-asked-questions
//
//   node brokers/bdosec/bdosec_cost.mjs SM PSE PHP --shares=20000 --price=5
//   node brokers/bdosec/bdosec_cost.mjs DTEL PSE USD --shares=10 --price=25
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("bdosec-parsed.json", import.meta.url);
const PAGE = "https://www.bdo.com.ph/bdo-securities/faqs";
const READ_ON = "2026-10-24";
const COPY_OF = "2026-05-21";
// The commission and 12% VAT on it, each side. LEVIES are rates of the
// gross, each side. The sales tax is on the sell.
const COMMISSION = 0.0025;
const VAT = 0.12;
const LEVIES = [
  ["SCCP", 0.0001],
  ["PSE transaction", 5e-05],
];
const SALES_TAX = 0.001;
// Cash the account takes (deposits.mjs). A line in another currency would be
// bought through a conversion the broker does not price.
const CASH = ["PHP", "USD"];
// BDO Unibank board, USD in pesos, read on 2026-10-23 (https://www.bdo.com.ph/forex).
const BOARD_USD = { buy: 63.25, sell: 63.75 };
const FX_GAP = (BOARD_USD.sell - BOARD_USD.buy) / (BOARD_USD.sell + BOARD_USD.buy);
const fxRemark = (ccy) => `FX ${Number((FX_GAP * 100).toFixed(2))}% when cash ≠ ${ccy}.`;

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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function ticket(notional) {
  const commission = notional * COMMISSION;
  const vat = commission * VAT;
  const levies = LEVIES.reduce((sum, [, rate]) => sum + notional * rate, 0);
  const buy = commission + vat + levies;
  return { commission, vat, levies, buy, sell: buy + notional * SALES_TAX };
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
    cashCurrency: "PHP",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BDO Securities n'existe pas encore : lancer `node brokers/bdosec/bdosec_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BDO Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BDO Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bdosec",
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
    listing,
    cashCurrency: listing.currency || "PHP",
    basis: `BDO Securities en ligne, FAQ relue le ${READ_ON} (copie Wayback du ${COPY_OF}). Commission 0,25 % plus TVA 12 % de la commission, SCCP 0,01 %, chaque côté, frais PSE 0,005 % (absents du tableau, ajoutés comme chez les autres brokers PSE) ; taxe de vente 0,1 % à la vente. Pas de minimum imprimé (l'ancienne FAQ de 2023 imprimait 20 pesos).${listing.currency === "USD" ? " Ligne en dollars payée depuis le compte de règlement en dollars, mêmes taux." : ""}`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!CASH.includes(listing.currency)) {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : le compte de règlement est en ${CASH.join(", ")} et la conversion n'a pas de taux publié` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const fees = ticket(notional);
  const local = fees.buy + fees.sell;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(local, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: fxRemark(listing.currency),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: COMMISSION, vat: VAT, ...fees, salesTax: SALES_TAX, currency: listing.currency },
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
