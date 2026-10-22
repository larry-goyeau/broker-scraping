// What one round trip costs at Dlala Brokerage: buy n shares at price p,
// sell them back at once, in dollars. Qatar Stock Exchange shares and the
// two QSE funds, in riyals, through the online (E-Trade) account. Margin
// trading and the investment management service are not this catalogue.
//
// Read on 2026-10-21. No page of the site prints a rate: the FAQ, the
// Trading page and the Forms page name none. The account opening / update
// application (2025) says, clause 15 of the general terms: "I agree to pay
// the specified commissions for buying and selling operations in
// accordance with the applicable legislation of the Qatar Stock Exchange
// and the Qatar Financial Markets Authority". The commission is therefore
// the exchange's published one, and that is the figure:
//   https://www.dlalabroker.com/wp-content/uploads/2025/03/DLALA-BROKERAGE-HOLDING-APPLICATION-FORM.pdf
//   https://www.dlalabroker.com/en/forms/
//   https://www.dlalabroker.com/en/about-us/faq/
//
//   Commission           0.275 % of the traded value, each side, no minimum.
//                        QSE removed the 30-riyal minimum from Sunday
//                        16 March 2025, "replacing it with a fixed
//                        proportional commission rate of 0.00275 with no
//                        minimum threshold". Every QSE broker charges that
//                        rate, and the exchange's share is inside it.
//                        https://qna.org.qa/en/News-Area/News/2025-3/6/qse-to-remove-minimum-trading-commission-effective-march-16
//                        The exchange FAQ (https://www.qe.com.qa/faqs, read
//                        2026-10-21) still prints 0.00275 "subject to a
//                        minimum levy (charge) of QR 30"; the later
//                        announcement prevails, as in qsc and cbfs.
//   Additional services  "Any fees or expenses for other additional
//                        services" are not priced and are not this order.
//   Taxes                Qatar has no VAT, no stamp duty and no transaction
//                        tax on a listed share. None is added.
//
// In the total: the book and the commission both ways. No remark.
//
// The book: venues.mjs has no Qatar Stock Exchange yet, so a Dlala line
// does not resolve to a venue and there is no bid and ask to read. `usd` is
// then N/A and `why` says the QSE book is missing; `brokerFees` is still
// the commission. The two funds carry no ISIN in the feed.
//
// The account is in riyals (deposits.mjs: QAR) and the lines are in
// riyals: no conversion on the ticket.
//
//   node brokers/dlala/dlala_cost.mjs BEMA DSMD QAR --shares=1000 --price=4.898
//   node brokers/dlala/dlala_cost.mjs AHCS DSMD QAR --shares=10 --price=0.678
//   node brokers/dlala/dlala_cost.mjs QETF DSMD QAR --shares=500 --price=11
//   node brokers/dlala/dlala_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("dlala-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.dlalabroker.com/en/forms/",
  agreement: "https://www.dlalabroker.com/wp-content/uploads/2025/03/DLALA-BROKERAGE-HOLDING-APPLICATION-FORM.pdf",
  exchange: "https://qna.org.qa/en/News-Area/News/2025-3/6/qse-to-remove-minimum-trading-commission-effective-march-16",
  readOn: "2026-10-21",
  noMinimumFrom: "2025-03-16",
  entity: "Dlala Brokerage Company",
};

const RATE = 0.00275;
const PCT = "0.275";
const REMARK = "";
const QSE = "Qatar Stock Exchange";

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
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter(
      (m) =>
        !wantPlace ||
        loose(m.row.exchange) === wantPlace ||
        loose(m.row.mic) === wantPlace ||
        ["QSE", "QE", "QATAR", "XQAT"].includes(wantPlace)
    )
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
    cashCurrency: "QAR",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Dlala n'existe pas encore : lancer `node brokers/dlala/dlala_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Dlala` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Dlala`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "dlala",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? QSE,
    currency: code(m.row.currency) || "QAR",
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    venueAuthoritative: false,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `commission QSE ${PCT} % chaque sens, sans minimum depuis le ${SCHEDULE.noMinimumFrom} ; contrat Dlala relu le ${SCHEDULE.readOn}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * RATE;
  const brokerFees = dollars(each * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const bookWhy = m.venue
    ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
    : `aucun carnet pour ${QSE} : le Qatar n'est pas dans spreads/venues.mjs, la ligne ne se rattache à aucune place`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: bookWhy } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: { rate: RATE, min: 0, each, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      `${PCT} % de ${notional.toFixed(2)} ${listing.currency} = ${each.toFixed(4)} ${listing.currency} par sens`,
      marketPerShare != null
        ? `carnet ${marketPerShare} par titre`
        : marketBp != null
          ? `carnet ${marketBp} pb`
          : `pas de feuille de carnet : ${listing.exchange}`,
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: 0, currency: "QAR", eachWay: true }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/dlala/dlala_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip       : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees      : ${out.brokerFees ?? "N/A"} $`);
    for (const [name, v] of Object.entries(out.parts || {})) if (v) console.log(`  ${name.padEnd(15)}: ${v} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
