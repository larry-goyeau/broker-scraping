// What every Pakistan Stock Exchange online broker shares in a round trip:
// the exchange floor on commission, the levies the exchange, the SECP, the
// CDC and the NCCPL set, the sales tax on services, and the whole
// `roundTrip` contract of the PSX cost files (ktrade, abbasi,
// standardcapital). A broker cost file keeps its own header (tariff URL,
// quote for each fee, formula, what is left out) and passes only its
// commission to makePsxCost(); everything else is here, once.
//
// Ready market, read on 2026-10-26 unless said otherwise.
//
//   https://www.psx.com.pk/psx/themes/psx/uploads/Schedule-of-Charges-Updated-as-on-December-18-2024.pdf
//   still the "Schedule of Charges" linked from
//   https://www.psx.com.pk/psx/regulations/legal-framework (the only newer
//   notice there, PSX/N-691 of 8 June 2026, revises IT service charges to
//   brokers, not trading fees)
//     PSX trading fee     "Ready Market Trade 3.50 | Rs. 100,000/- value
//                         traded", each side
//     Sales tax           "The applicable rate as notified from time to time
//                         | On the trading fee amount": Sindh, 15 %
//     SECP levy           "PKR 0.65 | Per Rs. 100,000/- value trade"
//     CVT, advance tax    "0.00%"
//     Regulatory fee      0.62084 per PKR 100,000, "with effect from August
//                         29, 2025 [...] the Regulatory Fee shall be
//                         discontinued": out.
//
//   https://www.cdcpakistan.com/assets/uploads/2025/03/Fees-and-Deposits-Schedule-Updated-March-2025-Final.pdf
//     CDC transaction fee 0.0036 % of the market value, "Levied on both
//                         delivery and receipt. The minimum and maximum fee
//                         shall be Rs.5 and Rs.25,000 respectively." Read
//                         for ktrade on 2026-10-18 through the search index
//                         (the site answers 403 to a script). A broker that
//                         prints its own "CDC handling" per share bills the
//                         depository that way instead (standardcapital):
//                         pass cdcHandlingPerShare.
//
//   https://www.nccpl.com.pk/storage/sections/files/01KFJCHGN36R38Q94Q7C1SF3D4.pdf
//     NCCPL "Fee Charges and Deposits Schedule", 8 January 2026, Regular
//     Market, retail sector, per Rs. 100,000: trade fee 1.70 + commission
//     fee 0.30 + RMS fee 1.00 + Settlement Guarantee Fund 0.22 = PKR 3.22
//     each side (read for ktrade on 2026-10-18; 403 to a script today).
//
//   Commission floor, PSX Regulations, Annexure-III (rulebook of
//   27 August 2025), standard range in force since 14 October 2019:
//   https://www.psx.com.pk/psx/themes/psx/uploads/PSX-Rulebook-August-27-2025.pdf
//     ready market, every buy and sell not squared the same day
//                         max(3 paisa a share, 0.15 % of the value)
//     intra-day squared   the same floor, one side only
//     fixed-income ETF    max(1 paisa a share, 0.01 %)
//
//   Sales tax on the broker's commission, by the province the broker is
//   registered in (use the rate the broker prints when it prints the
//   current one):
//     Sindh  SST 15 % since 1 July 2024 (Sindh Finance Act 2024; a page
//            still printing 13 % is older than that)
//            https://www.ey.com/en_gl/technical/tax-alerts/2024-1353-pakistan-adopts-changes-to-provincial-sales-tax-laws
//     Punjab PST 16 % (abbasi's RDA sheet: "16% Punjab Sales Tax (PST)
//            shall be deducted on the Commission amount")
//     Islamabad ICT 15 % and Khyber Pakhtunkhwa 15 %: standard rates, use
//            only when the broker prints no rate.
//
// CGT is a tax on the gain: out. Custody, UIN, account maintenance, SMS:
// not per order, out.
//
//   import { makePsxCost, bandSide, psxFloor, SALES_TAX } from "../nextcapital/psxCost.mjs";
//   const cost = makePsxCost({
//     folder: "foundation",
//     brand: "Foundation Securities",
//     catalogueUrl: new URL("foundation-parsed.json", import.meta.url),
//     url: "https://www.fsedge.com/fee.php",
//     readOn: "2026-10-26",
//     salesTax: SALES_TAX.sindh,
//     plans: {
//       value: {
//         label: "Edge Value",
//         side: ({ notional, shares, price }) => bandSide([...], notional, shares, price),
//         basis: "Edge Value : ... à chaque sens, plus SST 15 %",
//       },
//     },
//     remark: "Selling the same day pays commission half less.",
//     notes: ["English facts for `confidence`"],
//   });
//   export const { roundTrip, PLANS, planOf } = cost;
//   if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
//
//   node brokers/nextcapital/psxCost.mjs     self-test, no catalogue needed

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

export const CASH = "PKR";
const PER = 100_000;

export const LEVY_SOURCES = {
  psx: "https://www.psx.com.pk/psx/themes/psx/uploads/Schedule-of-Charges-Updated-as-on-December-18-2024.pdf",
  cdc: "https://www.cdcpakistan.com/assets/uploads/2025/03/Fees-and-Deposits-Schedule-Updated-March-2025-Final.pdf",
  nccpl: "https://www.nccpl.com.pk/storage/sections/files/01KFJCHGN36R38Q94Q7C1SF3D4.pdf",
  rulebook: "https://www.psx.com.pk/psx/themes/psx/uploads/PSX-Rulebook-August-27-2025.pdf",
  readOn: "2026-10-26",
};

// Sales tax on a broker's commission. `fr` goes into the French basis.
export const SALES_TAX = {
  sindh: { rate: 0.15, label: "SST 15%", fr: "SST 15 %" },
  punjab: { rate: 0.16, label: "PST 16%", fr: "PST 16 %" },
  ict: { rate: 0.15, label: "ICT sales tax 15%", fr: "taxe ICT 15 %" },
  kpk: { rate: 0.15, label: "KPK sales tax 15%", fr: "taxe KPK 15 %" },
};

// The sales tax PSX adds to its own trading fee: Sindh, wherever the broker is.
export const PSX_FEE_SST = 0.15;
export const PSX_TRADE = 3.5 / PER;
export const SECP_LEVY = 0.65 / PER;
export const CDC = 0.000036;
export const CDC_MIN = 5;
export const CDC_MAX = 25_000;
// NCCPL, retail sector, Regular Market: trade fee 1.70 + commission fee 0.30
// + RMS fee 1.00 + Settlement Guarantee Fund 0.22, per Rs. 100,000.
export const NCCPL = (1.7 + 0.3 + 1.0 + 0.22) / PER;

export const FLOOR = { perShare: 0.03, rate: 0.0015 };
export const FIXED_INCOME_FLOOR = { perShare: 0.01, rate: 0.0001 };

export const paisa = (amount) => Math.round(amount * 100) / 100;

// The exchange floor on one side: max(3 paisa a share, 0.15 %), or
// max(1 paisa, 0.01 %) on a fixed-income ETF.
export function psxFloor(notional, shares, { fixedIncome = false } = {}) {
  const f = fixedIncome ? FIXED_INCOME_FLOOR : FLOOR;
  return Math.max(shares * f.perShare, notional * f.rate);
}

// A fixed-income ETF on PSX (today HBLTETF, HBL Total Treasury ETF).
export function isFixedIncomeEtf(row) {
  return /treasury|fixed income|money market|sovereign|income etf/i.test(String(row?.name || ""));
}

// One side of a price-banded slab. Each band covers prices up to `upTo`
// (the last one Infinity) and has `perShare` (PKR a share), `rate` (of the
// value) or both, both meaning "whichever is higher". Optional `min`: PKR
// per order on that side. Returns { each, band }.
export function bandSide(bands, notional, shares, price) {
  const band = bands.find((b) => price <= b.upTo) || bands[bands.length - 1];
  const legs = [];
  if (band.perShare != null) legs.push(shares * band.perShare);
  if (band.rate != null) legs.push(notional * band.rate);
  let each = legs.length ? Math.max(...legs) : null;
  if (each != null && band.min != null) each = Math.max(each, band.min);
  return { each, band };
}

// The levies on one side (a buy or a sell) of `notional` rupees. With
// `cdcHandlingPerShare` the broker's per-share CDC handling replaces the CDC
// transaction fee, and is returned apart (it belongs to the broker ticket).
export function psxLevies(notional, shares = 0, { cdcHandlingPerShare = null } = {}) {
  const psxTrade = paisa(notional * PSX_TRADE);
  const psxSst = paisa(psxTrade * PSX_FEE_SST);
  const secp = paisa(notional * SECP_LEVY);
  const cdc = cdcHandlingPerShare == null ? paisa(Math.min(CDC_MAX, Math.max(CDC_MIN, notional * CDC))) : 0;
  const cdcHandling = cdcHandlingPerShare == null ? 0 : paisa(shares * cdcHandlingPerShare);
  const nccpl = paisa(notional * NCCPL);
  return { psxTrade, psxSst, secp, cdc, nccpl, cdcHandling, total: paisa(psxTrade + psxSst + secp + cdc + nccpl) };
}

export function leviesBasis({ cdcHandlingPerShare = null } = {}) {
  const depository =
    cdcHandlingPerShare == null
      ? "transaction CDC 0,0036 % (5 à 25 000 PKR), "
      : "";
  const tail = cdcHandlingPerShare == null ? "" : " ; dépositaire facturé par la manutention CDC du courtier";
  return `par sens : frais de négociation PSX 3,50 PKR pour 100 000 PKR échangés plus SST 15 %, prélèvement SECP 0,65 PKR pour 100 000 PKR, ${depository}NCCPL 3,22 PKR pour 100 000 PKR (frais de transaction 1,70, commission 0,30, RMS 1,00, fonds de garantie 0,22) ; CVT et impôt anticipé à 0 % ; frais réglementaire PSX supprimé depuis le 29 août 2025${tail}`;
}

export function leviesNote({ cdcHandlingPerShare = null } = {}) {
  return cdcHandlingPerShare == null
    ? "levies each side: PSX trading fee PKR 3.50 per 100,000 plus SST 15%, SECP levy PKR 0.65 per 100,000, CDC 0.0036% (PKR 5 to 25,000), NCCPL PKR 3.22 per 100,000, CVT and advance tax 0%, PSX regulatory fee discontinued (PSX schedule of 18 December 2024, CDC March 2025, NCCPL 8 January 2026)"
    : `levies each side: PSX trading fee PKR 3.50 per 100,000 plus SST 15%, SECP levy PKR 0.65 per 100,000, NCCPL PKR 3.22 per 100,000, CVT and advance tax 0%, PSX regulatory fee discontinued; CDC handling PKR ${cdcHandlingPerShare} a share replaces the CDC 0.0036% fee`;
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/**
 * Builds the cost module of one PSX broker.
 *
 *   folder        "foundation"
 *   brand         "Foundation Securities" (in the French `why` lines)
 *   catalogueUrl  new URL("<folder>-parsed.json", import.meta.url)
 *   url, readOn   the tariff page and the day it was read; `urls` optional
 *   salesTax      SALES_TAX.sindh | .punjab | ... or { rate, label, fr }
 *   plans         { id: { label, basis, side(ctx) } }; ctx = { notional,
 *                 shares, price, listing, fixedIncome }. side returns PKR
 *                 for one side, or { each, band } (bandSide), or null when
 *                 the commission is unknown (then `unknownWhy` says why).
 *                 One plan: the answer carries no `plan`. Several: `plan`
 *                 and query.plan, first plan the default unless
 *                 `defaultPlan`; describe front.mjs SPLIT_PLANS.
 *   planAliases   optional { alias: id }
 *   applyFloor    true: a side below the PSX floor is raised to it (akd)
 *   cdcHandlingPerShare  broker CDC handling per share, in its ticket,
 *                 replacing the CDC 0.0036 % levy (standardcapital)
 *   ticketExtra   optional ({notional, shares, price}) => PKR per side
 *                 added to the broker ticket, not taxed (e.g. a fixed
 *                 per-order charge the tariff prints)
 *   taxExtra      true: the sales tax also falls on ticketExtra
 *   remark        English cost remark, or null
 *   notes         English facts appended to `confidence`
 *   onlineBuy     default true
 */
export function makePsxCost(config) {
  const {
    folder,
    brand,
    catalogueUrl,
    url,
    urls = [],
    readOn,
    salesTax,
    plans,
    planAliases = {},
    defaultPlan = Object.keys(plans)[0],
    applyFloor = false,
    cdcHandlingPerShare = null,
    ticketExtra = null,
    taxExtra = false,
    remark = null,
    notes = [],
    onlineBuy = true,
  } = config;
  if (!folder || !brand || !catalogueUrl || !url || !salesTax || !plans) {
    throw new Error("makePsxCost: folder, brand, catalogueUrl, url, salesTax and plans are required");
  }
  const ids = Object.keys(plans);
  const multi = ids.length > 1;

  const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);

  function planOf(value) {
    const key = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (plans[key]) return key;
    if (planAliases[key]) return planAliases[key];
    return defaultPlan;
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

  function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
    const id = planOf(plan);
    const P = plans[id];
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy,
      cashCurrency: CASH,
      ...(multi ? { plan: id } : {}),
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${brand} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing({ etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${brand}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${brand}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
      };
    }

    const m = matches[0];
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: m.venue?.mic ?? null,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: folder,
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
      ...(remark ? { remark } : {}),
      url,
      basis: `${P.basis}, barème relu le ${readOn}`,
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
    const fixedIncome = isFixedIncomeEtf(m.row);
    const raw = P.side({ notional, shares: n, price: p, listing, fixedIncome });
    const band = raw && typeof raw === "object" ? raw.band ?? null : null;
    let each = raw && typeof raw === "object" ? raw.each : raw;
    if (each != null && !Number.isFinite(each)) each = null;
    let floored = false;
    if (each != null && applyFloor) {
      const floor = psxFloor(notional, n, { fixedIncome });
      if (floor > each) {
        each = floor;
        floored = true;
      }
    }
    const levy = psxLevies(notional, n, { cdcHandlingPerShare });
    const extra = ticketExtra ? Number(ticketExtra({ notional, shares: n, price: p })) || 0 : 0;
    const taxed = each == null ? null : (each + (taxExtra ? extra : 0)) * 2 * (1 + salesTax.rate);
    const untaxed = (taxExtra ? 0 : extra) * 2 + levy.cdcHandling * 2;
    const ticket = taxed == null ? null : taxed + untaxed;
    const commissionUsd = ticket == null ? null : dollars(ticket, CASH);
    const bookUsd =
      parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const gap = taxGap(listing.isin, listing.type, listing.mic);
    const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
    const leviesUsd = dollars(paisa(levy.total * 2), CASH);
    const usd = plus(bookUsd, commissionUsd, taxUsd, leviesUsd);
    const unknown = [
      bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
      each == null ? P.unknownWhy || `commission ${brand} inconnue pour ce prix` : null,
      gap,
    ].filter(Boolean);
    const confidence = [
      shared.basis,
      `${salesTax.label} on the commission`,
      ...(floored ? ["printed rate below the PSX floor: raised to max(3 paisa, 0.15%) (Annexure-III)"] : []),
      ...(fixedIncome ? ["fixed-income ETF"] : []),
      ...notes,
      leviesNote({ cdcHandlingPerShare }),
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
        ...(multi ? { plan: P.label } : {}),
        rate: floored ? (fixedIncome ? FIXED_INCOME_FLOOR : FLOOR).rate : band?.rate ?? null,
        perShare: floored ? (fixedIncome ? FIXED_INCOME_FLOOR : FLOOR).perShare : band?.perShare ?? null,
        each: each == null ? null : finite(each, 6),
        salesTax: salesTax.rate,
        ...(cdcHandlingPerShare != null ? { cdcHandlingPerShare } : {}),
        ...(extra ? { extraEach: extra } : {}),
        ...(floored ? { floored: true } : {}),
        eachWay: true,
        currency: CASH,
      },
      levies: {
        each: {
          psxTrade: levy.psxTrade,
          psxSst: levy.psxSst,
          secp: levy.secp,
          ...(cdcHandlingPerShare == null ? { cdc: levy.cdc } : {}),
          nccpl: levy.nccpl,
        },
        eachWay: true,
        currency: CASH,
        basis: leviesBasis({ cdcHandlingPerShare }),
        urls: [LEVY_SOURCES.psx, ...(cdcHandlingPerShare == null ? [LEVY_SOURCES.cdc] : []), LEVY_SOURCES.nccpl],
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
      ...(urls.length ? { urls: [url, ...urls] } : {}),
    };
  }

  function printCli(argv = process.argv) {
    const flag = (name) => {
      const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
      return hit ? hit.split("=").slice(1).join("=") : null;
    };
    const positional = argv.slice(2).filter((arg) => !arg.startsWith("--"));
    const [etf, place, currency] = positional;
    if (!etf) {
      console.error(
        `usage: node brokers/${folder}/${folder}_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p] [--bp=x]${multi ? ` [--plan=${ids.join("|")}]` : ""}`
      );
      process.exit(2);
    }
    const out = roundTrip({
      etf,
      place,
      currency,
      shares: flag("shares") ? Number(flag("shares")) : null,
      price: flag("price") ? Number(flag("price")) : null,
      bp: flag("bp") ? Number(flag("bp")) : null,
      plan: flag("plan"),
    });
    const show = (value) => (value == null ? "N/A" : value);
    if (!out.listing) {
      console.log(out.why);
      if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
      return out;
    }
    const listing = out.listing;
    console.log(`${listing.ticker || listing.isin} — ${listing.name || ""}`);
    console.log(`${listing.exchange}${listing.mic ? ` (${listing.mic})` : ""}, ${listing.currency}, ${(listing.type || "").toLowerCase()}\n`);
    if (out.trade) {
      const trade = out.trade;
      console.log(
        `${trade.shares} share${trade.shares > 1 ? "s" : ""} at ${trade.price} ${trade.currency} = ${trade.notional.toFixed(2)} ${trade.currency}${out.plan ? ` (${out.plan})` : ""}\n`
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
    return out;
  }

  return { roundTrip, printCli, PLANS: plans, planOf };
}

// Self-test: rebuilds the abbasi and standardcapital bills from this module
// and compares them with those files (same catalogue rows, same inputs).
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (ok, msg) => {
    if (!ok) {
      console.error(`FAIL ${msg}`);
      process.exitCode = 1;
    } else console.log(`ok   ${msg}`);
  };
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-6;

  assert(psxFloor(280_000, 1000) === 420, "floor 0.15% on 1000 x 280");
  assert(near(psxFloor(10_000, 1000), 30), "floor 3 paisa on 1000 x 10");
  assert(near(psxFloor(100_000, 1000, { fixedIncome: true }), 10), "fixed-income floor 1 paisa");
  const l = psxLevies(280_000);
  assert(l.psxTrade === 9.8 && l.psxSst === 1.47 && l.secp === 1.82 && l.cdc === 10.08 && l.nccpl === 9.02, "levies on PKR 280,000");
  assert(psxLevies(1_000).cdc === 5, "CDC minimum Rs 5");
  const b = bandSide([{ upTo: 1.99, perShare: 0.03 }, { upTo: Infinity, perShare: 0.05, rate: 0.0017 }], 20_000, 1000, 20);
  assert(near(b.each, 50), "bandSide whichever higher (5 paisa beats 0.17%)");

  const here = new URL("../", import.meta.url);
  const abbasi = await import(new URL("abbasi/abbasi_cost.mjs", here));
  const mine = makePsxCost({
    folder: "abbasi",
    brand: "Abbasi",
    catalogueUrl: new URL("abbasi/abbasi-parsed.json", here),
    url: "https://abbasiandcompany.com/commission-slab",
    readOn: "2026-10-21",
    salesTax: SALES_TAX.punjab,
    plans: {
      online: {
        label: "Online",
        basis: "test",
        side: ({ notional, shares, price }) =>
          bandSide([{ upTo: 20, perShare: 0.03 }, { upTo: Infinity, rate: 0.0015 }], notional, shares, price),
      },
    },
  });
  for (const [t, n, p] of [["OGDC", 1000, 280], ["MIIETF", 15000, 18.5], ["ATRL", 230, 1206]]) {
    const a = abbasi.roundTrip({ etf: t, place: "PSX", currency: "PKR", shares: n, price: p, bp: 10 });
    const c = mine.roundTrip({ etf: t, place: "PSX", currency: "PKR", shares: n, price: p, bp: 10 });
    assert(
      near(a.usd, c.usd) && near(a.brokerFees, c.brokerFees) && near(a.parts?.levies, c.parts?.levies),
      `abbasi ${t} ${n} x ${p}: ${a.usd} = ${c.usd}`
    );
  }

  const scs = await import(new URL("standardcapital/standardcapital_cost.mjs", here));
  const mine2 = makePsxCost({
    folder: "standardcapital",
    brand: "Standard Capital",
    catalogueUrl: new URL("standardcapital/standardcapital-parsed.json", here),
    url: "https://www.scstrade.com/OnlineTrading/OT_Commission.aspx",
    readOn: "2026-10-21",
    salesTax: SALES_TAX.sindh,
    cdcHandlingPerShare: 0.005,
    plans: {
      one: {
        label: "One Account For All",
        basis: "test",
        side: ({ notional, shares, price }) =>
          bandSide([{ upTo: 10, perShare: 0.03 }, { upTo: Infinity, perShare: 0.05, rate: 0.0015 }], notional, shares, price),
      },
    },
  });
  for (const [t, n, p] of [["OGDC", 1000, 280], ["MIIETF", 15000, 18.5]]) {
    const a = scs.roundTrip({ etf: t, place: "PSX", currency: "PKR", shares: n, price: p, bp: 10 });
    const c = mine2.roundTrip({ etf: t, place: "PSX", currency: "PKR", shares: n, price: p, bp: 10 });
    assert(
      near(a.usd, c.usd) && near(a.brokerFees, c.brokerFees) && near(a.parts?.levies, c.parts?.levies),
      `standardcapital ${t} ${n} x ${p}: ${a.usd} = ${c.usd}`
    );
  }

  // The nextcapital catalogue through the factory, PSX floor and Sindh tax.
  const next = makePsxCost({
    folder: "nextcapital",
    brand: "Next Capital",
    catalogueUrl: new URL("nextcapital-parsed.json", import.meta.url),
    url: "https://nextcapital.com.pk/",
    readOn: LEVY_SOURCES.readOn,
    salesTax: SALES_TAX.sindh,
    plans: { floor: { label: "floor", basis: "test", side: ({ notional, shares, fixedIncome }) => psxFloor(notional, shares, { fixedIncome }) } },
  });
  const o = next.roundTrip({ etf: "OGDC", place: "PSX", currency: "PKR", shares: 1000, price: 280, bp: 10 });
  // commission 420 x 2 x 1.15 = 966; levies (9.80+1.47+1.82+10.08+9.02) x 2 = 64.38; book 10 bp of 280,000 = 280.
  const usdPerPkr = toUsd(1, "PKR");
  assert(Math.abs(o.brokerFees - 966 * usdPerPkr) < 1e-5, `nextcapital OGDC commission ${o.brokerFees} $`);
  assert(Math.abs(o.parts.levies - 64.38 * usdPerPkr) < 1e-5, `nextcapital OGDC levies ${o.parts.levies} $`);
  assert(Math.abs(o.usd - (966 + 64.38 + 280) * usdPerPkr) < 1e-4, `nextcapital OGDC total ${o.usd} $`);
}
