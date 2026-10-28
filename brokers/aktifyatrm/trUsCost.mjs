// Round trip for the Turkish brokers that sell Borsa İstanbul in lira and US
// shares in dollars from one account (Aktif, Ata, Fiba, Osmanlı, Piapiri,
// Tacirler: see the header of each broker file). Buy n shares at price p,
// sell them back at once, in dollars.
//
// Borsa İstanbul lines go to ../halkyatrm/bistCost.mjs with the broker's
// schedule (`bist`), so the BIST sums, levies and BSMV are the ones every
// BIST file uses. Two hooks sit on top of it, both lira on each leg:
//   bistPerTrade(notional)   a fixed fee per leg that depends on the order
//                            (Ata's MKK record fee plus the top-up of its
//                            1 TL floor on the borsa payı)
//   bistRemark(notional)     the remark at the order amount (a lower
//                            monthly band as a cut of the commission,
//                            floors included: bandRemark)
//
// US lines (`us`), all in dollars, each leg:
//   commission(n, p)   the broker's commission before BSMV, in USD
//   tripCommission(c)  what the client pays for the two legs together
//                      when the broker waives part of it (Ata's free
//                      allowance); default 2 × c
//   bsmv               true: 5 % BSMV on the commission
//   regulatory         { sec, secMin, taf, tafMin, tafCap, cat } as the
//                      broker prints them (SEC on the sale amount, TAF a
//                      share sold, CAT a share each side); unprinted = 0
//   bsmvOnRegulatory   true when the broker adds BSMV to those fees too
//   dealer             the US broker-dealer whose Rule 606 Q prices the
//                      NBBO book (spreads/rule606.mjs key), or null: quoted
//                      NBBO
//   mics               the US places the tariff covers (OTCM for OTC lines)
//   types              the row types the US tariff covers
//   remark(n, p)       extra remark after the FX one
//   fxPct              the FX remark's figure ("0.61"), "" or absent when unpublished
//   basis, notes       French basis and confidence notes
// FX: every US line is dollars, a deposit currency of these accounts
// (deposits.mjs), so the lira-dollar change is a remark without a rate,
// as at Slayz. OTC lines have no 605 tape: their book is the OTC Markets
// leaf of spreadLeaf, or N/A.
//
// trUsCost(schedule, query) → the bistCost object for a BIST line, else the
// same shape as ../slayz/slayz_cost.mjs for a US line.

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { bistCost, legs, roundPct, BSMV, BORSA_PAYI, TAKAS, SOURCES as BIST_SOURCES } from "../halkyatrm/bistCost.mjs";

export { BSMV, BORSA_PAYI, TAKAS };
export const US_TAPE = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"]);
// FINRA's own ceiling on the TAF of one sale (Section 1 of Schedule A).
export const TAF_CAP = 8.3;

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const fr = (x) => String(Number(Number(x).toPrecision(6))).replace(".", ",");
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CATALOGUES = new Map();
function catalogueOf(folder) {
  if (CATALOGUES.has(folder)) return CATALOGUES.get(folder);
  const file = new URL(`../${folder}/${folder}-parsed.json`, import.meta.url);
  const parsed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows || [];
  if (rows.length) warmListingIndex(rows);
  const out = { parsed, rows };
  CATALOGUES.set(folder, out);
  return out;
}

function findListing(rows, { etf, place, currency }) {
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// The regulatory fees of one trip in dollars, before any BSMV.
export function usRegulatory(reg = {}, notional, n) {
  let sec = (reg.sec || 0) * notional;
  if (sec > 0 && reg.secMin) sec = Math.max(reg.secMin, sec);
  let taf = (reg.taf || 0) * n;
  if (taf > 0 && reg.tafCap) taf = Math.min(reg.tafCap, taf);
  if (taf > 0 && reg.tafMin) taf = Math.max(reg.tafMin, taf);
  const cat = (reg.cat || 0) * n * 2;
  return { sec, taf, cat, total: sec + taf + cat };
}

// A lower monthly band at the order amount, buy and sell with the floor, as
// a cut of the commission itself (BSMV cancels out): "Over 20,000,000 TL
// traded a month: 50% lower." (0.2 % → 0.1 % each way).
export function bandRemark({ top, lowest, minimum = null, label }) {
  return (notional) => {
    if (!(notional > 0)) return "";
    const full = legs(notional, top, minimum).commission;
    if (!(full > 0)) return "";
    const pct = roundPct(((full - legs(notional, lowest, minimum).commission) / full) * 100);
    return pct > 0 ? `${label}: fees are ${pct}% lower.` : "";
  };
}

function bistLine(schedule, query) {
  const n = Number(query.shares);
  const p = Number(query.price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const bist = { folder: schedule.folder, broker: schedule.broker, entity: schedule.entity, url: schedule.url, readOn: schedule.readOn, ...schedule.bist };
  if (notional != null && schedule.bistPerTrade) bist.perTrade = schedule.bistPerTrade(notional);
  // With no order yet, the remark at 1,000,000 TL (above any floor).
  if (schedule.bistRemark) bist.remark = schedule.bistRemark(notional ?? 1_000_000);
  return bistCost(bist, query);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the broker's
 * commission with its BSMV.
 */
export function trUsCost(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const folder = schedule.folder;
  const broker = schedule.broker;
  const us = schedule.us;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "TRY",
    url: schedule.url,
    remark: "",
  };
  const { parsed, rows } = catalogueOf(folder);
  if (!parsed) {
    return { ...answer, why: `le catalogue ${broker} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }
  const m = matches[0];
  const mic = m.venue?.mic ?? m.row.mic ?? null;
  if (mic === "XIST" || code(m.row.currency) === "TRY") return bistLine(schedule, query);

  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
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
    mic: book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const mics = new Set(us.mics);
  if (!(mics.has(listing.mic) && listing.currency === "USD")) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème ${broker} (Borsa İstanbul en lires, actions américaines en dollars)` };
  }
  const types = new Set(us.types || ["STOCK", "ETF", "ETN"]);
  if (!types.has(listing.type)) {
    return { ...answer, listing, why: `le barème américain ${broker} ne couvre pas les lignes ${listing.type || "?"}` };
  }
  const cash = listingCash(listing.currency);
  if (!depositHas(folder, null, cash)) {
    return { ...answer, listing, why: `${cash} n'est pas une devise du compte ${broker} et le change n'est pas publié` };
  }

  const tape = US_TAPE.has(listing.mic);
  const dealer = us.dealer || folder;
  const marketPerShare =
    perShare ??
    (tape ? usBookPerShare({ broker: dealer, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null }) : book.leaf?.perShare ?? null);
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: tape && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const n = Number(shares);
  const p = Number(price);
  const extra = n > 0 && p > 0 && us.remark ? us.remark(n, p) : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: cash,
    remark: [fxRemark(schedule.fxPct || "", listing.currency), extra].filter(Boolean).join(" "),
    basis: us.basis,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leg = us.commission(n, p);
  const trip = us.tripCommission ? us.tripCommission(leg, n, p) : leg * 2;
  const bsmvRate = us.bsmv ? BSMV : 0;
  const reg = usRegulatory(us.regulatory, notional, n);
  const regRate = us.bsmvOnRegulatory ? BSMV : 0;
  const commissionUsd = dollars(trip * (1 + bsmvRate), listing.currency);
  const regUsd = dollars(reg.total * (1 + regRate), listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(regUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    `courtage ${fr(leg)} $ par sens${trip !== leg * 2 ? `, ${fr(trip)} $ payés sur l'aller-retour` : ""}${bsmvRate ? ", BSMV 5 % en sus" : ""}`,
    reg.total > 0
      ? `SEC ${fr(reg.sec)} $, TAF ${fr(reg.taf)} $, CAT ${fr(reg.cat)} $${regRate ? ", BSMV en sus" : ""}`
      : "SEC, TAF et CAT non imprimés : 0",
    ...(us.notes || []),
    tape
      ? us.dealer
        ? `carnet 605 × Q 606 de ${us.dealerName || us.dealer}`
        : `${broker} ne nomme pas son intermédiaire américain : NBBO coté, pas de Q 606`
      : "ligne OTC hors bande 605 : carnet OTC Markets de spreadLeaf",
    "caisse en dollars (dépôt USD) : le change lire-dollar, non chiffré, reste en remarque",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} USD la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || (tape ? "pas de 605 pour ce ticker" : "pas de feuille de carnet")}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { perLeg: leg, trip, bsmv: bsmvRate, currency: "USD", regulatory: us.regulatory || {}, bsmvOnRegulatory: Boolean(us.bsmvOnRegulatory) },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    regulatory: { sec: finite(reg.sec, 6), taf: finite(reg.taf, 6), cat: finite(reg.cat, 6) },
    confidence,
  };
}

// The command line of a broker file: `printCli(roundTrip, SCHEDULE, import.meta.url)`.
export function printCli(roundTrip, schedule, moduleUrl) {
  let direct = false;
  try {
    direct = moduleUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    direct = false;
  }
  if (!direct) return;
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    const { us, ...rest } = schedule;
    const usOut = { ...us, commission: String(us.commission), tripCommission: us.tripCommission ? String(us.tripCommission) : undefined, remark: us.remark ? String(us.remark) : undefined };
    console.log(JSON.stringify({ ...rest, us: usOut, market: { borsaPayi: BORSA_PAYI, takas: TAKAS, bsmv: BSMV, sources: BIST_SOURCES } }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error(`usage : node brokers/${schedule.folder}/${schedule.folder}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
