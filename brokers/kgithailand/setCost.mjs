// One round trip on the Stock Exchange of Thailand (SET / mai, MIC XBKK) for
// the brokers whose only place is the Thai exchange and whose tariff is the
// usual Thai daily-value scale: KGI Securities Thailand (../kgithailand),
// Land and Houses Securities (../landhouses) and I V Global Securities
// (../ivglobal). Each broker file hands it its own scale, minimum and page;
// this file finds the line, reads the SET book and adds the parts up, with
// the contract of brokers/webullth/webullth_cost.mjs (its SET leg).
//
// The scale. Thai brokers charge a commission by the value traded in a day
// on the account ("มูลค่าการซื้อขายต่อวัน"), stepped ("ขั้นบันได"): each band
// of the day's value pays its own rate. A round trip here is one buy day and
// one sell day, so each side's day value is the order's value. A daily
// minimum, when the broker prints one, is a floor on that day's commission.
// The pass-through fees are the same at every Thai broker: SET trading
// 0.005 %, TSD clearing 0.001 %, SEC regulatory 0.001 % of the value, both
// sides. VAT 7 % on the commission and on those fees (the brokers' notes
// say VAT is charged on all of them, as Webull Thailand's page stars them).
//
// Money. Every SET line is in baht, and these brokers settle in baht only
// (ATS debit from a Thai bank account, or cash placed in a Cash Balance
// account), so no line pays FX.
//
// The book: XBKK's own leaf (spreads/set-touch.mjs). Thai transaction tax
// from taxMap by ISIN (none on SET-traded shares; taxGap flags an ISIN with
// no line).
//
//   import { makeSetCost, printSetCli } from "../kgithailand/setCost.mjs";
//   export const roundTrip = makeSetCost({ folder, name, catalogue, schedule, scale, min });
//   printSetCli(roundTrip, import.meta.url);

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxGap, taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

export const VAT = 0.07;
export const SET_LEVIES = [
  { name: "SET trading", rate: 0.00005 },
  { name: "TSD clearing", rate: 0.00001 },
  { name: "SEC regulatory", rate: 0.00001 },
];
const LEVY_RATE = SET_LEVIES.reduce((sum, l) => sum + l.rate, 0);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const pct = (rate) => `${+(rate * 100).toPrecision(4)} %`.replace(".", ",");
const fr = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/**
 * Commission on one day's value `x` (baht), before VAT: each band of the
 * scale at its rate, then the daily floor. `scale` is [{ upTo, rate }], the
 * last band with upTo Infinity.
 */
export function dayCommission(x, scale, min = 0) {
  if (!(x > 0)) return 0;
  let left = x;
  let from = 0;
  let fee = 0;
  for (const band of scale) {
    const width = Math.min(left, band.upTo - from);
    if (width > 0) {
      fee += width * band.rate;
      left -= width;
    }
    from = band.upTo;
    if (left <= 0) break;
  }
  return Math.max(fee, min);
}

// options:
//   folder, name, catalogue (URL)
//   schedule    { url, readOn, entity, account, ... } printed by --schedule
//   scale       [{ upTo, rate }] internet rate of the priced account, baht
//   min         daily commission floor before VAT (0 when none)
//   deposits    cash currencies kept when deposits.mjs has no entry yet
//   basis       French sentence on the tariff used
//   remark      English cost remark, or ""
export function makeSetCost({ folder, name, catalogue: catalogueUrl, schedule, scale, min = 0, deposits = ["THB"], basis = "", remark = "" }) {
  const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);

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
        if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
        if (/^(SET|MAI|XBKK)$/.test(wantPlace) && code(m.row.mic) === "XBKK") return true;
        return Boolean(wantVenue && m.venue && m.venue.mic === wantVenue.mic);
      })
      .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
    return { named, matches };
  }

  function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: true,
      cashCurrency: "THB",
      url: schedule.url,
      remark,
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${name} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing({ etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${name}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${name}`,
        alternatives: named.slice(0, 12).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
      mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
      exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
      currency: code(m.row.currency),
      brokerExchange: m.row.exchange || null,
    };
    if (code(m.row.mic) !== "XBKK" && code(listing.mic) !== "XBKK") {
      return { ...answer, listing, why: `${listing.exchange} n'a pas de barème chez ${name}` };
    }

    const tax = taxesOf(listing.isin);
    const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
    const gap = taxGap(listing.isin, listing.type, listing.mic);
    const cash = listingCash(listing.currency);
    const held = depositHas(folder, null, cash) || deposits.includes(cash);
    const marketBp = bp ?? (perShare != null ? null : book.leaf?.bp ?? null);
    const marketPerShare = perShare ?? book.leaf?.perShare ?? null;

    const shared = {
      ...answer,
      listing,
      cashCurrency: held ? cash : deposits[0],
      bp: marketBp,
      perShare: marketPerShare,
      sources: [schedule.url],
      basis,
      tax,
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
      fxIfConverted: null,
      commission: { scale, min, vat: VAT, currency: "THB", eachWay: true, daily: true },
    };
    if (gap) return { ...shared, why: gap };

    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0 && p > 0)) {
      return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
    }

    const notional = n * p;
    const notionalUsd = dollars(notional, listing.currency);
    const baht = notionalUsd != null && usdPer("THB") ? notionalUsd / usdPer("THB") : null;
    const side = baht == null ? null : dayCommission(baht, scale, min) * (1 + VAT);
    const levySide = baht == null ? null : baht * LEVY_RATE * (1 + VAT);
    const commissionUsd = side == null ? null : dollars(2 * side, "THB");
    const regulatoryUsd = levySide == null ? null : dollars(2 * levySide, "THB");
    const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
    const bookUsd =
      marketPerShare != null
        ? dollars(marketPerShare * n, listing.currency)
        : marketBp != null && notionalUsd != null
          ? (notionalUsd * marketBp) / 1e4
          : null;
    const fxUsd = held ? 0 : null;
    const usd = plus(bookUsd, commissionUsd, regulatoryUsd, taxUsd, fxUsd);
    const brokerFees = plus(commissionUsd, fxUsd);
    const floored = baht != null && min > 0 && dayCommission(baht, scale, 0) < min;

    const said = [
      basis,
      side == null
        ? "montant en bahts inconnu"
        : `courtage ${fr(side)} THB par jambe TVA comprise${floored ? ` (minimum journalier ${min} THB + TVA)` : ""}`,
      `frais de place ${SET_LEVIES.map((l) => `${l.name} ${pct(l.rate)}`).join(", ")}, TVA ${Math.round(VAT * 100)} % en sus, les deux jambes`,
    ];
    if (taxTotal) said.push(`taxe ${(100 * taxTotal).toFixed(3)} % du montant, depuis taxMap.mjs`);
    said.push(held ? "compte en bahts, aucun change" : `${cash} n'est pas une devise de dépôt : change non publié`);
    if (marketPerShare != null) said.push(`carnet ${marketPerShare} ${listing.currency} la part`);
    else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} pb`);
    else said.push(`pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`);

    const why = !held
      ? `change forcé non publié : ${cash} n'est pas une devise de dépôt chez ${name} (bahts seulement)`
      : bookUsd == null
        ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
        : null;

    return {
      ...shared,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(why ? { why } : {}),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      parts: {
        marché: finite(bookUsd, 6),
        courtage: finite(commissionUsd, 6),
        réglementaire: finite(regulatoryUsd, 6),
        taxes: finite(taxUsd, 6),
        change: finite(fxUsd, 6),
      },
      confidence: said.filter(Boolean).join(" ; "),
    };
  }
  roundTrip.schedule = { ...schedule, scale, min, vat: VAT, levies: SET_LEVIES };
  return roundTrip;
}

// node <file> TICKER [place] [devise] --shares= --price= [--bp=] [--per-share=] | --schedule
export function printSetCli(roundTrip, metaUrl) {
  let called = false;
  try {
    called = metaUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify(roundTrip.schedule, (k, v) => (v === Infinity ? "∞" : v), 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node <fichier> <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    return;
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` + (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") + "\n");
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence.split(" ; ").join("\n")}`);
}
