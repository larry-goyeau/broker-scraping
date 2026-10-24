// What one round trip costs at RHB Sekuritas Indonesia: buy n shares at
// price p, sell them back at once, in dollars. Online, through RHB
// TradeSmart ID (mobile and desktop), regular account.
//
// The FAQ, read on 2026-10-24 (the site often answers a Cloudflare 520;
// it was retried). The Sharia online trading answer lists what differs
// from the regular account (Sharia shares only, no buying past the cash,
// a BCA Syariah RDN) and closes: "selebihya untuk fee beli dan jual sama
// yaitu 0.15% dan 0.25%" ("for the rest, the buy and sell fees are the
// same, namely 0.15% and 0.25%"). "Sama" cannot mean that buy equals sell,
// since two different figures follow; it says the Sharia fees are the
// regular ones. So the regular account is read as:
//   buy online     0.15% of the fill
//   sell online    0.25% of the fill
// No page prints a floor or any other line. The sell figure is 0.10
// points above the buy, which is the 0.1% final income tax on a sale, so
// the two figures are read as all-in (broker fee, VAT, levy and, on the
// sell, the tax), as BNI and BRI print theirs. Nothing is added on top.
//
// The home page advertises "Smart Free ... serendah 0.08% (*S&K
// Berlaku)", and the app's store page says the buy fee "dapat turun
// hingga serendah 0.08%" under "Smart Fee", where the fee changes day to
// day and falls as the trade grows. No schedule is printed and only the
// buy floor is named, so the total keeps 0.15%/0.25% and the remark says
// the buy may be 0.07 points lower.
//
// A share and an ETF on the exchange are the same order and take these
// two figures. The account is in rupiah and every line is IDR: no FX.
// Margin is a loan and stays out.
//
//   https://www.rhbtradesmart.co.id/faq
//   https://www.rhbtradesmart.co.id/
//   https://apps.apple.com/us/app/-/id1450456793
//
//   node brokers/rhbid/rhbid_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("rhbid-parsed.json", import.meta.url);
const PAGE = "https://www.rhbtradesmart.co.id/faq";
const READ_ON = "2026-10-24";
const BUY = 0.0015;
const SELL = 0.0025;
const REMARK = "Fees might be 0.07% lower.";

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
    cashCurrency: "IDR",
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue RHB Sekuritas n'existe pas encore : lancer `node brokers/rhbid/rhbid_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue RHB Sekuritas` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez RHB Sekuritas`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "rhbid",
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
    cashCurrency: listing.currency || "IDR",
    basis: `compte régulier, RHB TradeSmart ID en ligne, FAQ relue le ${READ_ON} (réponse Syariah : frais « sama » que le compte régulier). Achat 0,15 %. Vente 0,25 %.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const ticket = notional * (BUY + SELL);
  const brokerFees = dollars(ticket, listing.currency);
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
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: BUY, sell: SELL, currency: listing.currency },
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
