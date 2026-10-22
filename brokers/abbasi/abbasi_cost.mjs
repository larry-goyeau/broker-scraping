// What one round trip costs at Abbasi and Company: buy n shares at price
// p, sell them back at once, in dollars. Online, PSX ready market. Custody
// stays out.
//
// The commission-slab page links one PDF per package, read on 2026-10-21:
//
//   https://abbasiandcompany.com/commission-slab
//   https://abbasiandcompany.com/Documents/digital_account/RCP%20-%20Online%20Self%20Trading.pdf
//   https://abbasiandcompany.com/Documents/Investors_Relations/Commission/New%20RDA-Commission.pdf
//
//   "For Shares Trading Without Trader" (RCP/Online Self Trading):
//     Share price up to 20        "0.03 paisa per share" (Rs 0.03, the
//                                 RDA sheet prints "Rs. 0.03")
//     20.01 and above             0.15 % of the transaction value
//   Roshan Digital Account (RDA/001): the same two bands, and "16% Punjab
//   Sales Tax (PST) shall be deducted on the Commission amount."
//   "Regulatory charges (PSX, SECP, and NCCPL) shall be billed to the
//   client as and when applicable." "CDC custody transaction and annual
//   maintenance charges shall be deducted on an actual basis."
//   "On trading, a single side commission shall be deducted." The RDA
//   sheet says it of a day trade: "On Day Trade, a single side commission
//   shall be deducted." The trip, not squared the same day, pays it each
//   way, as the PSX floor (3 paisa or 0.15 % on every buy and sell not
//   squared the same day) requires; the remark gives the same-day saving.
//
// The package with a trader (RCP/TRADER PKG-001, 0.45 % delivery) is an
// order through a dealer: out. The annual account maintenance of Rs 2,500
// plus PST is not per order: out.
//
// Levies, each side, as the exchange, the SECP, the CDC and the NCCPL set
// them (Abbasi passes them on at cost). Same figures and sources as
// ktrade_cost.mjs, read there on 2026-10-18:
//
//   https://www.psx.com.pk/psx/themes/psx/uploads/Schedule-of-Charges-Updated-as-on-December-18-2024.pdf
//     PSX trading fee  "Ready Market Trade 3.50 | Rs. 100,000/- value traded",
//                      plus Sindh sales tax on it, SST 15 %
//     SECP levy        "PKR 0.65 | Per Rs. 100,000/- value trade"
//     CVT, advance tax 0.00 %; PSX regulatory fee discontinued since
//                      29 August 2025
//   https://www.cdcpakistan.com/assets/uploads/2025/03/Fees-and-Deposits-Schedule-Updated-March-2025-Final.pdf
//     CDC transaction fee 0.0036 % of the value, at least Rs 5, at most
//     Rs 25,000, on delivery and on receipt
//   https://www.nccpl.com.pk/storage/sections/files/01KFJCHGN36R38Q94Q7C1SF3D4.pdf
//     NCCPL retail Regular Market, per Rs. 100,000: trade fee 1.70 +
//     commission fee 0.30 + RMS fee 1.00 + SGF 0.22 = PKR 3.22
//
// CGT is a tax on the gain, not on the trip: out.
//
//   node brokers/abbasi/abbasi_cost.mjs OGDC PSX PKR --shares=100 --price=299.1
//   node brokers/abbasi/abbasi_cost.mjs MIIETF PSX PKR --shares=1000 --price=15.7
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("abbasi-parsed.json", import.meta.url);
const READ_ON = "2026-10-21";

const SCHEDULE = {
  url: "https://abbasiandcompany.com/commission-slab",
  online: "https://abbasiandcompany.com/Documents/digital_account/RCP%20-%20Online%20Self%20Trading.pdf",
  rda: "https://abbasiandcompany.com/Documents/Investors_Relations/Commission/New%20RDA-Commission.pdf",
  readOn: READ_ON,
};

const LEVIES = {
  psx: "https://www.psx.com.pk/psx/themes/psx/uploads/Schedule-of-Charges-Updated-as-on-December-18-2024.pdf",
  cdc: "https://www.cdcpakistan.com/assets/uploads/2025/03/Fees-and-Deposits-Schedule-Updated-March-2025-Final.pdf",
  nccpl: "https://www.nccpl.com.pk/storage/sections/files/01KFJCHGN36R38Q94Q7C1SF3D4.pdf",
  readOn: "2026-10-18",
};

// Sindh sales tax on the PSX trading fee; Punjab sales tax on Abbasi's
// commission (the RDA sheet).
const SST = 0.15;
const PST = 0.16;
const CASH = "PKR";
const PER = 100_000;
const PSX_TRADE = 3.5 / PER;
const SECP_LEVY = 0.65 / PER;
const CDC = 0.000036;
const CDC_MIN = 5;
const CDC_MAX = 25_000;
const NCCPL = (1.7 + 0.3 + 1.0 + 0.22) / PER;

// Price up to Rs 20: 3 paisa a share. From Rs 20.01: 0.15 % of the value.
const LOW_CEILING = 20;
const LOW_PER_SHARE = 0.03;
const HIGH_RATE = 0.0015;

const REMARK = "Selling the same day pays commission half less.";

const paisa = (amount) => Math.round(amount * 100) / 100;

function side(notional, shares, price) {
  return price <= LOW_CEILING ? shares * LOW_PER_SHARE : notional * HIGH_RATE;
}

// The levies on one side (a buy or a sell) of `notional` rupees.
function leviesOf(notional) {
  const psxTrade = paisa(notional * PSX_TRADE);
  const psxSst = paisa(psxTrade * SST);
  const secp = paisa(notional * SECP_LEVY);
  const cdc = paisa(Math.min(CDC_MAX, Math.max(CDC_MIN, notional * CDC)));
  const nccpl = paisa(notional * NCCPL);
  return { psxTrade, psxSst, secp, cdc, nccpl, total: paisa(psxTrade + psxSst + secp + cdc + nccpl) };
}

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the Abbasi ticket:
 * commission with its Punjab sales tax.
 */
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
  };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Abbasi n'existe pas encore : lancer `node brokers/abbasi/abbasi_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Abbasi` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Abbasi`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "abbasi",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    remark: REMARK,
    url: SCHEDULE.url,
    basis: `Abbasi en ligne sans opérateur (RCP/Online Self Trading), barème relu le ${READ_ON} : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % à partir de 20,01 PKR, à chaque sens, plus PST 16 %`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  if (listing.currency !== CASH) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème PSX en roupies` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(notional, n, p);
  const commission = each * 2 * (1 + PST);
  const commissionUsd = dollars(commission, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  // PSX trading fee + SST, SECP levy, CDC transaction fee and NCCPL, each side.
  const levy = leviesOf(notional);
  const leviesUsd = dollars(paisa(levy.total * 2), CASH);
  const usd = plus(bookUsd, commissionUsd, taxUsd, leviesUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    "single-side commission read as the same-day square (RDA sheet, PSX floor); the trip pays it each way",
    "PST 16% printed on the RDA sheet, applied to the online package too",
    "the package with a trader (0.45%) is not online and stays out",
    `levies each side, as read on ${LEVIES.readOn} for ktrade: PSX trading fee PKR 3.50 per 100,000 plus SST 15%, SECP levy PKR 0.65 per 100,000, CDC 0.0036% (PKR 5 to 25,000), NCCPL PKR 3.22 per 100,000, CVT and advance tax 0%, PSX regulatory fee discontinued`,
    "PKR line: no foreign exchange",
    marketBp != null
      ? `book ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `book ${marketPerShare} PKR a share`
        : `no book leaf: ${m.unsourced?.name || listing.exchange}`,
  ].join("; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: {
      rate: p <= LOW_CEILING ? null : HIGH_RATE,
      perShare: p <= LOW_CEILING ? LOW_PER_SHARE : null,
      each: finite(each, 6),
      pst: PST,
      eachWay: true,
      currency: CASH,
    },
    levies: {
      each: {
        psxTrade: levy.psxTrade,
        psxSst: levy.psxSst,
        secp: levy.secp,
        cdc: levy.cdc,
        nccpl: levy.nccpl,
      },
      eachWay: true,
      currency: CASH,
      basis:
        "par sens : frais de négociation PSX 3,50 PKR pour 100 000 PKR échangés plus SST 15 %, prélèvement SECP 0,65 PKR pour 100 000 PKR, transaction CDC 0,0036 % (5 à 25 000 PKR), NCCPL 3,22 PKR pour 100 000 PKR ; CVT et impôt anticipé à 0 % ; frais réglementaire PSX supprimé depuis le 29 août 2025",
      urls: [LEVIES.psx, LEVIES.cdc, LEVIES.nccpl],
    },
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(commissionUsd, 6),
      levies: finite(leviesUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/abbasi/abbasi_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p] [--bp=x]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });

  const show = (value) => (value == null ? "N/A" : value);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const listing = out.listing;
  console.log(`${listing.ticker || listing.isin} — ${listing.name || ""}`);
  console.log(`${listing.exchange}${listing.mic ? ` (${listing.mic})` : ""}, ${listing.currency}, ${(listing.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const trade = out.trade;
    console.log(
      `${trade.shares} share${trade.shares > 1 ? "s" : ""} at ${trade.price} ${trade.currency} = ${trade.notional.toFixed(2)} ${trade.currency}\n`,
    );
    console.log(`round trip : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees: ${show(out.brokerFees)} $`);
    const bill = out.parts || {};
    if (bill.market != null) console.log(`  book       : ${bill.market} $`);
    if (bill.commission != null) console.log(`  commission : ${bill.commission} $`);
    if (bill.levies != null) console.log(`  levies     : ${bill.levies} $`);
    if (bill.taxes) console.log(`  taxes      : ${bill.taxes} $`);
  } else if (out.why) {
    console.log(`round trip : N/A — ${out.why}`);
  }
  if (out.confidence) console.log(`\n${out.confidence}`);
}
