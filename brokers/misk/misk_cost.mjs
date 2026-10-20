// What one round trip costs at Misk Financial Brokerage (MISC, a Safwa
// Islamic Bank subsidiary): buy n shares on the Amman Stock Exchange
// through the online service and sell them straight back, in dollars. The
// ASE trades in dinars and the account is held in dinars, so nothing is
// converted.
//
// https://www.safwabank.com/en/product/misc/
// read on 2026-10-18. The product page prints three rates, as fractions of
// the trade value, with no unit, no side and no floor:
//   Trading commission                     0.002   (0.20%)
//   Tax for the state treasury             0.0008  (0.08%)
//   Fees of capital market institutions    0.0014  (0.14%)
// All three are taken on each side. The ASE's Transaction Cost page adds
// the treasury tax "by each party to the contract", and the ASE By-Law
// charges its own commission "from each contracting party" (0.0006 from
// 1 January 2026, 0.0007 from 2027, inside Misk's 0.0014). The broker
// commission is per trade, "buying or selling one security in one day";
// online, its minimum is 0.002, Misk's rate. No floor or cap is printed.
//   https://www.ase.com.jo/en/Product-Services/Trading-Services/Transaction-Cost
//   https://www.ase.com.jo/en/Legislation/Laws/Laws-Fees-Charges-and-Commissions
// The Arabic page carries the same figures. The PDF the scraper reads
// (Misk-Brokerage-1.pdf) is the Shari'a-compliant list, not a tariff.
//
// Left out: no custody, inactivity or account fee is printed. The dinar
// amounts are in `parts`.
// Amman's book is the daily bulletin's best bid and ask for the last
// session (spreads/ase-touch.mjs); a share that did not trade has none.
//
//   node brokers/misk/misk_cost.mjs AALU XAMM JOD --shares=100 --price=1.2
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("misk-parsed.json", import.meta.url);
const PAGE = "https://www.safwabank.com/en/product/misc/";
const READ_ON = "2026-10-18";
const COMMISSION = 0.002;
const TREASURY = 0.0008;
const INSTITUTIONS = 0.0014;
const EACH = COMMISSION + TREASURY + INSTITUTIONS;
const CASH = "JOD";
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
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Misk n'existe pas encore : lancer `node brokers/misk/misk_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Misk` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Misk`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "misk",
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
    basis:
      `service en ligne, page Safwa Bank relue le ${READ_ON}. ` +
      `Commission 0,20 %, taxe du Trésor 0,08 %, frais des institutions du marché 0,14 %, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Misk ne publie un barème que pour la bourse d'Amman en dinars ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commissionJod = notional * COMMISSION * 2;
  const leviesJod = notional * (TREASURY + INSTITUTIONS) * 2;
  const brokerFees = dollars(commissionJod, listing.currency);
  const levies = dollars(leviesJod, listing.currency);
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
    commission: {
      buy: EACH,
      sell: EACH,
      broker: COMMISSION,
      treasury: TREASURY,
      institutions: INSTITUTIONS,
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
      courtageJod: finite(commissionJod, 6),
      taxesJod: finite(leviesJod, 6),
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
