// What one round trip costs at KTrade Securities (KASB): buy n shares at
// price p, sell them back at once, in dollars. Online, PSX ready market.
// Custody stays out.
//
// The pricing block on the PSX page prints three plans. The default here is
// Classic, the cheapest one; `--plan=premier` and `--plan=premier-i` are
// the other two. Commission is per share price band, each way.
//
//   https://kasb.com/invest-in-stock-market/            read on 2026-10-18
//   https://www.kasb.com/wp-content/uploads/2025/01/commision-Structure.pdf
//
//   Classic      price ≤ PKR 20       PKR 0.03 a share
//                price > PKR 20       0.15 % of the traded value
//   Premier      price ≤ PKR 1.99     PKR 0.03 a share
//                PKR 2.00 – 19.99     PKR 0.05 a share
//                price ≥ PKR 20       0.25 % of the traded value
//   Premier – I  price ≤ PKR 1.99     PKR 0.03 a share
//                PKR 2.00 – 24.99     PKR 0.05 a share
//                price ≥ PKR 25       0.20 % of the traded value
//   Sindh sales tax 15 % on the brokerage fee (the commission form).
//
// The commission form linked from the service-agreement page is a blank
// account form, uploaded in January 2025, printing "6 paisa or 0.3 %,
// whichever is higher". The pricing block is the schedule the site shows
// today and gives the rate; the form's notes are used: the same rate on delivery and day trade, a day trade is charged
// one side only, SST 15 % on brokerage, CDC custody and transaction charges
// and the NCCPL, CGT lines "as per actual", SMS PKR 50 a month. KTrade
// prints no rate for the levies it passes through, so they come from the
// bodies that set them. `brokerFees` (commission + SST) stays the KTrade
// ticket; the levies sit next to it. Custody and SMS are not per order and
// stay out. A GB/IE/FR/IT/ES share with no tax-map line would be N/A too
// (taxGap).
//
// Levies, each side (buy and sell), ready market:
//
//   https://www.psx.com.pk/psx/themes/psx/uploads/Schedule-of-Charges-Updated-as-on-December-18-2024.pdf
//   still the "Schedule of Charges" linked from
//   https://www.psx.com.pk/psx/regulations/legal-framework   read on 2026-10-18
//
//   PSX trading fee     "Ready Market Trade 3.50 | Rs. 100,000/- value traded"
//   Sales tax           "The applicable rate as notified from time to time |
//                        On the trading fee amount": SST 15 %, as on brokerage.
//   SECP levy           "PKR 0.65 | Per Rs. 100,000/- value trade"
//   CVT, advance tax    "0.00%" on purchase value / purchase and sale value.
//   PSX regulatory fee  0.62084 per PKR 100,000, but "with effect from August
//                       29, 2025 or such date as specified by the SECP, [...]
//                       whichever comes first, the Regulatory Fee shall be
//                       discontinued": out.
//
//   https://www.cdcpakistan.com/assets/uploads/2025/03/Fees-and-Deposits-Schedule-Updated-March-2025-Final.pdf
//
//   CDC transaction fee 0.0036 % of the market value, "On all Inter/Intra-
//                       Participant/Account Holder Transactions - Levied on
//                       both delivery and receipt. The minimum and maximum fee
//                       shall be Rs.5 and Rs.25,000 respectively." The site
//                       sits behind a Cloudflare human check: the PDF text
//                       was read through the search index on 2026-10-18, not
//                       opened. The closing price is taken as the trade price.
//
//   NCCPL               "Fee Charges and Deposits Schedule", 8 January 2026,
//                       read on 2026-10-18 past the site's human check:
//                       https://www.nccpl.com.pk/storage/sections/files/01KFJCHGN36R38Q94Q7C1SF3D4.pdf
//                       Regular Market, retail sector (individuals), "Per
//                       Rs. 100,000 value of trade", levied on the clearing
//                       member, which KTrade recovers "as per actual":
//                         Trade Fee "a. Regular Market Fee/GEM ... 1.70"
//                         "g. COMMISSION fee- Regular Market/GEM 0.30"
//                         "h. RMS Fee – Regular Market/GEM 1.00"
//                         Settlement Guarantee Fund "a. Regular Market/GEM 0.22"
//                       PKR 3.22 per 100,000 each side. The schedule names no
//                       sales tax on these, so none is added.
//
// CGT is a tax on the gain, not on the trip: remark only.
//
// This trip is not squared the same day, so the commission is each way.
//
//   node brokers/ktrade/ktrade_cost.mjs OGDC PSX PKR --shares=100 --price=131.87
//   node brokers/ktrade/ktrade_cost.mjs OGDC PSX PKR --shares=100 --price=131.87 --plan=premier
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("ktrade-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://kasb.com/invest-in-stock-market/",
  form: "https://www.kasb.com/wp-content/uploads/2025/01/commision-Structure.pdf",
  readOn: "2026-10-18",
};

const LEVIES = {
  psx: "https://www.psx.com.pk/psx/themes/psx/uploads/Schedule-of-Charges-Updated-as-on-December-18-2024.pdf",
  cdc: "https://www.cdcpakistan.com/assets/uploads/2025/03/Fees-and-Deposits-Schedule-Updated-March-2025-Final.pdf",
  nccpl: "https://www.nccpl.com.pk/storage/sections/files/01KFJCHGN36R38Q94Q7C1SF3D4.pdf",
  readOn: "2026-10-18",
};

const SST = 0.15;
const CASH = "PKR";
const PER = 100_000;
const PSX_TRADE = 3.5 / PER;
const SECP_LEVY = 0.65 / PER;
const CDC = 0.000036;
const CDC_MIN = 5;
const CDC_MAX = 25_000;
// NCCPL, retail sector, Regular Market: trade fee 1.70 + commission fee 0.30
// + RMS fee 1.00 + Settlement Guarantee Fund 0.22, per Rs. 100,000.
const NCCPL = (1.7 + 0.3 + 1.0 + 0.22) / PER;

const paisa = (amount) => Math.round(amount * 100) / 100;

// The levies on one side (a buy or a sell) of `notional` rupees.
function leviesOf(notional) {
  const psxTrade = paisa(notional * PSX_TRADE);
  const psxSst = paisa(psxTrade * SST);
  const secp = paisa(notional * SECP_LEVY);
  const cdc = paisa(Math.min(CDC_MAX, Math.max(CDC_MIN, notional * CDC)));
  const nccpl = NCCPL == null ? null : paisa(notional * NCCPL);
  const known = paisa(psxTrade + psxSst + secp + cdc);
  return { psxTrade, psxSst, secp, cdc, nccpl, known, total: nccpl == null ? null : paisa(known + nccpl) };
}

// Each band: shares priced up to `upTo` pay `perShare` a share, or `rate`
// of the traded value. The last band has no ceiling.
const PLANS = {
  classic: {
    label: "Classic",
    bands: [
      { upTo: 20, perShare: 0.03 },
      { upTo: Infinity, rate: 0.0015 },
    ],
    basis: "KTrade Classic : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % au-delà, à chaque sens, plus SST 15 %",
  },
  premier: {
    label: "Premier",
    bands: [
      { upTo: 1.99, perShare: 0.03 },
      { upTo: 19.99, perShare: 0.05 },
      { upTo: Infinity, rate: 0.0025 },
    ],
    basis:
      "KTrade Premier : 0,03 PKR par action jusqu'à 1,99 PKR, 0,05 PKR de 2 à 19,99 PKR, 0,25 % à partir de 20 PKR, à chaque sens, plus SST 15 %",
  },
  "premier-i": {
    label: "Premier – I",
    bands: [
      { upTo: 1.99, perShare: 0.03 },
      { upTo: 24.99, perShare: 0.05 },
      { upTo: Infinity, rate: 0.002 },
    ],
    basis:
      "KTrade Premier – I : 0,03 PKR par action jusqu'à 1,99 PKR, 0,05 PKR de 2 à 24,99 PKR, 0,20 % à partir de 25 PKR, à chaque sens, plus SST 15 %",
  },
};

const REMARK = "Selling the same day pays commission half less.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function planOf(value) {
  const key = String(value || "classic").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (key === "premier-i" || key === "premieri" || key === "premier-1") return "premier-i";
  if (key === "premier") return "premier";
  return "classic";
}

function bandOf(plan, price) {
  return PLANS[plan].bands.find((b) => price <= b.upTo);
}

function side(plan, notional, shares, price) {
  const band = bandOf(plan, price);
  return band.rate != null ? notional * band.rate : shares * band.perShare;
}

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
 * `usd` is the number the page prints. `brokerFees` is the KTrade ticket
 * with its Sindh sales tax.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const id = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    plan: id,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue KTrade n'existe pas encore : lancer `node brokers/ktrade/ktrade_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue KTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez KTrade`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ktrade",
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
    basis: `${PLANS[id].basis}, page relue le ${SCHEDULE.readOn}`,
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
  const each = side(id, notional, n, p);
  const ticket = each * 2 * (1 + SST);
  const commissionUsd = dollars(ticket, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  // PSX trading fee + SST, SECP levy, CDC transaction fee: priced, each
  // side, and the NCCPL clearing charges.
  const levy = leviesOf(notional);
  const leviesKnownUsd = dollars(paisa(levy.known * 2), CASH);
  const leviesUsd = levy.total == null ? null : dollars(paisa(levy.total * 2), CASH);
  const usd = plus(bookUsd, commissionUsd, taxUsd, leviesUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    levy.nccpl == null
      ? "frais NCCPL « au réel » : barème NCCPL du 8 janvier 2026 illisible (contrôle Cloudflare), aucun taux sûr"
      : null,
    gap,
  ].filter(Boolean);
  const band = bandOf(id, p);
  const confidence = [
    shared.basis,
    "the January 2025 account form at 6 paisa or 0.3% is not the rate used: the pricing page is",
    `levies each side from the PSX schedule of 18 December 2024 and the CDC schedule of March 2025, read on ${LEVIES.readOn}: PSX trading fee PKR 3.50 per 100,000 plus SST 15%, SECP levy PKR 0.65 per 100,000, CDC 0.0036% (PKR 5 to 25,000), CVT and advance tax 0%, PSX regulatory fee discontinued since 29 August 2025`,
    "CDC text read through the search index, the site being behind a human check",
    "NCCPL retail Regular Market: trade fee 1.70 + commission fee 0.30 + RMS 1.00 + SGF 0.22 per PKR 100,000 each side, schedule of 8 January 2026",
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
      plan: PLANS[id].label,
      rate: band.rate ?? null,
      perShare: band.perShare ?? null,
      each: finite(each, 6),
      sst: SST,
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
        "par sens : frais de négociation PSX 3,50 PKR pour 100 000 PKR échangés plus SST 15 %, prélèvement SECP 0,65 PKR pour 100 000 PKR, transaction CDC 0,0036 % (5 à 25 000 PKR) ; NCCPL 3,22 PKR pour 100 000 PKR (frais de transaction 1,70, commission 0,30, RMS 1,00, fonds de garantie 0,22) ; CVT et impôt anticipé à 0 % ; frais réglementaire PSX supprimé depuis le 29 août 2025",
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
      leviesKnown: finite(leviesKnownUsd, 6),
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
    console.error(
      "usage: node brokers/ktrade/ktrade_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p] [--plan=classic|premier|premier-i]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan"),
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
    else if (bill.leviesKnown != null) console.log(`  levies     : N/A (PSX + SST + SECP + CDC ${bill.leviesKnown} $, NCCPL unknown)`);
    if (bill.taxes) console.log(`  taxes      : ${bill.taxes} $`);
  } else if (out.why) {
    console.log(`round trip : N/A — ${out.why}`);
  }
  if (out.confidence) console.log(`\n${out.confidence}`);
}
