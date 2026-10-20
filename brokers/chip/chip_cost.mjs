// What one round trip costs at Chip: buy n shares or units at price p,
// sell them back at once, in dollars.
//
// Read on 2026-10-18. Chip Financial (Investments) Ltd runs the ISA, the
// GIA and the pension on Seccl Custody Limited. Two plans, and they differ
// on the platform fee only, never on the deal:
//
//   Basic (free)   platform 0.25% a year, min £1 a month per account
//   ChipX          £5.99 every 28 days (£65.05 a year), platform 0%,
//                  except on the Chip Personal Pension
//   dealing        0: "there are no per-trade or broker fees", "we never
//                  charge any extra fees when you buy or sell funds"
//   FX             none published
//
// The platform terms (29 January 2025) allow "standard dealing fees" on
// exchange-traded lines "as per the Fees Schedule"; the schedule they point
// to (getchip.uk/pricing) prints none, so the ticket is 0.
//
// Seccl places every ETF and ETC order with Winterflood Business Services,
// whose venue is London: the book is London's. A unit trust or OEIC (a
// FUND line with no exchange) goes to the fund manager at the next
// valuation point, at one price, so it crosses no book: 0. Seccl's policy
// names an initial charge or a dilution levy the manager may add, with no
// amount on Chip's or Seccl's schedule. Those come from each fund's own
// papers, read on 2026-10-18 and kept per ISIN, with the URL, in
// chip-fund-dealing.json (Prosper reads the same table):
//
//   entry / exit   the share class's KIID: "None" or "0.00%" on 17 of the
//                  18 funds. GB00BN090N06, which Chip prints as MyMap 8
//                  Select ESG "D", is BlackRock's Class S Acc: "Entry Charge
//                  5.00%", a maximum the distributor may cut: N/A
//   dilution       the manager's prospectus. Vanguard, BlackRock (iShares
//                  index funds (UK), Emerging Markets, MyMap) and HSBC run a
//                  single swinging price: the swing is inside the dealt
//                  price, nothing added. BlackRock ICS Sterling Liquidity is
//                  a money market fund: no preliminary or redemption charge,
//                  a liquidity fee only under the money market fund rules'
//                  stress triggers, nothing added
//
// The table also holds Prosper's funds. A fund missing from it is N/A.
// `brokerFees` stays 0 either way: what the fund takes is not Chip's. The
// four LifeStrategy lines and AW01 print no ISIN; the table's aliases tie
// them to the A Acc and C Acc classes. A fund line printed with no
// currency is priced in pounds, the only cash the account holds.
//
// The account holds pounds (deposits.mjs). Every listed line is GBP or GBX.
// A non-sterling line would be bought from sterling; Seccl's execution
// policy says FX "may be passed through ... within the price spread", with
// no rate, so no FX line is added. Stamp and FTT come from the tax map;
// these are ETFs and ETCs, so none applies (a GB/IE/FR/IT/ES share with no
// tax-map line would be N/A: taxGap).
//
//   https://www.getchip.uk/pricing
//   https://help.getchip.uk/help-article/what-are-the-fees-for-chip-investments
//   https://cdn.prod.website-files.com/5d65390243727621f8413d93/6978ce4cc764ff5c3d2f1de5_investments_platform_terms_chip_29_jan.pdf
//   brokers/chip/chip-fund-dealing.json (one KIID URL per fund, one
//   prospectus URL and quote per manager)
//
//   node brokers/chip/chip_cost.mjs SWDA LSE GBX --shares=10 --price=11129
//   node brokers/chip/chip_cost.mjs VUAG LSE GBP --shares=10 --price=100
//   node brokers/chip/chip_cost.mjs GB00B4R9F681 --shares=10 --price=2
//   node brokers/chip/chip_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("chip-parsed.json", import.meta.url);
const FUND_DEALING = JSON.parse(fs.readFileSync(new URL("chip-fund-dealing.json", import.meta.url), "utf8"));

const SCHEDULE = {
  pricing: "https://www.getchip.uk/pricing",
  help: "https://help.getchip.uk/help-article/what-are-the-fees-for-chip-investments",
  terms:
    "https://cdn.prod.website-files.com/5d65390243727621f8413d93/6978ce4cc764ff5c3d2f1de5_investments_platform_terms_chip_29_jan.pdf",
  readOn: "2026-10-18",
  entity: "Chip Financial (Investments) Ltd",
  custodian: "Seccl Custody Limited",
  dealingPartner: "Winterflood Business Services",
  fundDealing: "brokers/chip/chip-fund-dealing.json",
};

const CASH = "GBP";
const EACH = 0;
const PLANS = {
  basic: { id: "basic", label: "Basic", platform: 0.0025, minMonthly: 1 },
  chipx: { id: "chipx", label: "ChipX", platform: 0, per28Days: 5.99, yearly: 65.05 },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const sterling = (currency) => {
  const c = String(currency || "").toUpperCase();
  return c === "GBP" || c === "GBX";
};

// A unit trust or OEIC: dealt with its manager, no exchange on the row.
const managerDealt = (row) => String(row?.type || "").toUpperCase() === "FUND" && !row?.exchange && !row?.mic;

const percent = (x) => `${Number((x * 100).toFixed(2))} %`;

// What the fund itself takes on a buy and a sell at once (KIID charges and
// the manager's dilution policy), in dollars, or null with the reason.
function fundLeg(row, notionalUsd, pounds) {
  const upper = (s) => String(s || "").toUpperCase().trim();
  const isin = upper(row?.isin) || FUND_DEALING.aliases[upper(row?.ticker)] || FUND_DEALING.aliases[upper(row?.name)] || null;
  const f = isin ? FUND_DEALING.funds[isin] : null;
  if (!f) {
    return { usd: null, why: "fonds absent de chip-fund-dealing.json : frais d'entrée ou de dilution chez la société de gestion inconnus", note: "frais du fonds inconnus : N/A" };
  }
  const manager = FUND_DEALING.managers[f.manager];
  const d = manager.dilution;
  const why = [];
  const note = [];
  if (f.entry == null) why.push(`frais d'entrée jusqu'à ${percent(f.entryMax)} selon le DICI, maximum que le distributeur peut réduire, montant réel non publié`);
  if (f.exit == null) why.push("frais de sortie non chiffrés dans le DICI");
  const charges = f.entry == null || f.exit == null || notionalUsd == null ? null : (f.entry + f.exit) * notionalUsd;
  if (charges != null) note.push(`DICI (${f.kiidDate}) : entrée ${percent(f.entry)}, sortie ${percent(f.exit)}`);
  let dilution = null;
  if (d.kind === "swing") {
    dilution = 0;
    note.push("prix unique ajusté (swing) : l'ajustement est dans le prix, rien en plus");
  } else if (d.kind === "mmf") {
    dilution = 0;
    note.push("fonds monétaire : commission de liquidité seulement sur les seuils de tension du règlement, rien en plus");
  } else if (d.kind === "levy" && d.rate != null) {
    dilution = notionalUsd == null ? null : 2 * d.rate * notionalUsd;
    note.push(`prélèvement de dilution attendu ${percent(d.rate)}`);
  } else if (d.kind === "levy" && d.freeBelowGbp != null && pounds != null && pounds <= d.freeBelowGbp) {
    dilution = 0;
    note.push(`aucun prélèvement de dilution jusqu'à ${d.freeBelowGbp} £ par ordre`);
  } else if (d.kind === "levy") {
    why.push(`prélèvement de dilution possible au-delà de ${d.freeBelowGbp} £ par ordre, à la discrétion du gérant, taux non publié`);
  } else if (d.kind === "duties") {
    why.push("« Duties and Charges » ajoutés au prix de souscription et retirés du prix de rachat à la discrétion du gérant, taux non publié");
  } else {
    why.push("mécanisme anti-dilution non précisé (ajustement du prix ou prélèvement), taux non publié");
  }
  if (manager.excessiveTradingMax) note.push(`pénalité jusqu'à ${percent(manager.excessiveTradingMax)} si le gérant soupçonne des allers-retours excessifs : non comptée`);
  return {
    usd: plus(charges, dilution),
    why: why.length ? why.join(" ; ") : null,
    note: why.length ? `${note.concat(why).join(" ; ")} : N/A` : note.join(" ; "),
    detail: { isin, manager: f.manager, entry: f.entry, exit: f.exit, dilution: d, kiid: f.kiid, prospectus: manager.source },
  };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || managerDealt(m.row)) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || !m.row.currency || String(m.row.currency).toUpperCase() === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. Chip charges no ticket, so
 * `brokerFees` is 0 and `usd` is the book and any tax. The platform fee
 * is the remark.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.pricing,
    remark:
      "Platform fee is 0.25% a year on Basic. ChipX is £5.99 every 28 days or £65.05 a year, with no platform fee except on the pension.",
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Chip n'existe pas encore : lancer `node brokers/chip/chip_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Chip` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Chip`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "fonds"}`),
    };
  }

  const m = matches[0];
  const fund = managerDealt(m.row);
  const book = fund
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? m.row.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "chip",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: fund ? null : book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: fund ? null : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || (fund ? currency || CASH : "")).toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = fund ? 0 : bp ?? leaf?.bp ?? null;
  const marketPerShare = fund ? null : perShare ?? leaf?.perShare ?? null;
  const partsBook = fund
    ? { a: 0, b: 0 }
    : bookParts({
        bp: marketBp,
        perShare: marketPerShare,
        venue: m.venue,
        unsourced: m.unsourced,
        toUsd: (x) => dollars(x, listing.currency),
      });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    via606: false,
    basis: fund
      ? `Chip, fonds traité auprès de la société de gestion, sans frais de transaction, relu le ${SCHEDULE.readOn}`
      : `Chip, ordre transmis par Seccl à Winterflood, sans courtage, relu le ${SCHEDULE.readOn}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const commissionUsd = EACH;
  const brokerFees = commissionUsd;
  // A manager-dealt fund: its KIID charges and its manager's dilution policy (chip-fund-dealing.json).
  const gbp = usdPer(CASH);
  const pounds = notionalUsd == null || !(gbp > 0) ? null : notionalUsd / gbp;
  const fundCost = fund ? fundLeg(m.row, notionalUsd, pounds) : null;
  const fundChargeUsd = fund ? fundCost.usd : 0;
  const usd = plus(bookUsd, brokerFees, taxUsd, fundChargeUsd);
  const unknown = [
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    fundCost?.why,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each: EACH, currency: CASH, eachWay: true },
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
      ...(fund ? { fonds: finite(fundChargeUsd, 6) } : {}),
    },
    ...(fundCost?.detail ? { fundDealing: fundCost.detail } : {}),
    confidence: [
      `barème relu le ${SCHEDULE.readOn}`,
      "aucun frais de transaction publié",
      sterling(listing.currency) ? "ligne en sterling : pas de change" : "change non publié (dans l'écart selon Seccl) : non compté",
      fund
        ? `fonds à prix unique auprès de la société de gestion : pas de carnet${m.row.currency ? "" : " ; devise non imprimée, prix lu en livres"} ; ${fundCost.note}`
        : marketBp != null
          ? `carnet ${Number(marketBp.toPrecision(4))} bp`
          : marketPerShare != null
            ? `carnet ${marketPerShare} $ la part`
            : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange || "cette ligne"}`,
    ].join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, each: EACH, plans: PLANS, cash: CASH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/chip/chip_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "fonds"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.fonds != null) console.log(`  fonds          : ${parts.fonds} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
