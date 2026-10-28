// One round trip at an Argentine broker whose catalogue holds two places:
// BYMA (Buenos Aires shares and CEDEARs, peso, MEP and cable lines, from
// ../bancogalicia/bymaBook.mjs) and the US exchange book
// (../wellstrade/usBook.mjs: NYSE, Nasdaq, NYSE Arca, ... in dollars).
// Shared by ../argentinavalores, ../bullmarket, ../cafsecurities, ../ieb,
// ../lbo, ../lescinq, ../optionsecurities, ../pgavalores, ../psec, ../rava,
// ../sailing and ../veta. It adds nothing of its own to a price: a BYMA
// line goes to ../bancogalicia/bymaCost.mjs (commission + IVA, BYMA market
// rights + IVA, the MEP / CCL half spread as the FX remark), a US line to
// ../wellstrade/usCost.mjs (book 605 × Q of the named US dealer, or the
// quoted NBBO; SEC, TAF and CAT stay 0 unless the broker prints them).
//
// Dispatch: the place the front passes (the row's exchange) decides. BCBA,
// XBUE, BYMA ... is Buenos Aires, anything else the US tape. With no place,
// the first catalogue row for the ticker / ISIN (and currency) decides.
//
// US lines: `us` is the broker's printed US tariff, a side:
//   { rate, minUsd?, minArs?, fixedUsd?, vat: true }   ->  max(rate × notional
//   + fixedUsd, min) × (1 + IVA), in dollars (a peso minimum is converted
//   with fx.mjs). `us: null` means the broker prints no US price: the total
//   is N/A with `usWhy`, the book is still shown.
// Cash: a US line is in dollars and every one of these brokers holds
// dollars (deposits.mjs), so no FX enters the number; the remark is the CCL
// quote's half spread, the price of pesos into dollars abroad.
//
// Use:
//   import { arUsCostFile } from "../bullmarket/arUsCost.mjs";
//   const file = arUsCostFile({
//     folder, name, catalogue: new URL("<folder>-parsed.json", import.meta.url),
//     byma: { schedule, cash, commission, basis, remark, market, ... },  // bymaCostFile config
//     us: { rate: 0.005, vat: true, url, readOn, basis, remark, rule606, notes } | null,
//     usWhy: "…",                                                        // when us is null
//   });
//   export const { roundTrip, SCHEDULE } = file;
//   file.printCli(import.meta.url);
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { bymaCostFile, BUENOS_AIRES, IVA, CCL, halfSpread } from "../bancogalicia/bymaCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import { toUsd } from "../../fx.mjs";

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const pct = (x) => `${Number((x * 100).toFixed(4)).toString().replace(".", ",")} %`;

/** One US side in dollars from { rate, minUsd, minArs, fixedUsd, vat }, with a French note. */
export function usSide(spec, notionalUsd) {
  if (!(notionalUsd > 0)) return null;
  const minArsUsd = spec.minArs != null ? toUsd(spec.minArs, "ARS") : null;
  if (spec.minArs != null && minArsUsd == null) return null;
  const floor = Math.max(spec.minUsd ?? 0, minArsUsd ?? 0);
  const raw = notionalUsd * (spec.rate ?? 0) + (spec.fixedUsd ?? 0);
  const before = Math.max(raw, floor);
  const fee = before * (spec.vat === false ? 1 : 1 + IVA);
  const parts = [`${pct(spec.rate ?? 0)} × ${Number(notionalUsd.toFixed(2))} $`];
  if (spec.fixedUsd) parts.push(`+ ${spec.fixedUsd} $`);
  const floorNote = floor > 0 ? `, minimum ${spec.minUsd != null ? `${spec.minUsd} $` : `${spec.minArs} pesos (${Number(floor.toFixed(4))} $)`}${floor > raw ? " appliqué" : ""}` : "";
  return { fee, note: `${parts.join(" ")}${floorNote}${spec.vat === false ? "" : " + IVA"} = ${Number(fee.toFixed(4))} $ par sens` };
}

export function arUsCostFile(config) {
  const { folder, name, catalogue: catalogueUrl, byma, us = null, usWhy = "" } = config;
  const bymaFile = bymaCostFile({ folder, name, catalogue: catalogueUrl, ...byma });

  const catalogue = catalogueUrl && fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);

  const cclLabel = halfSpread(CCL);
  const usSchedule = {
    broker: name,
    folder,
    catalogueUrl,
    url: us?.url ?? byma.schedule?.url,
    readOn: us?.readOn ?? byma.schedule?.readOn,
    entity: byma.schedule?.entity ?? name,
    rule606: us?.rule606 ?? config.rule606 ?? null,
    cash: "USD",
    deposits: byma.cash ?? ["ARS", "USD"],
    feeCurrency: "USD",
    fx: { rate: Number(cclLabel) / 100, label: cclLabel },
    levies: { sec: false, taf: false, cat: false },
    onlineBuy: us?.onlineBuy ?? true,
    ticket: (ctx) => {
      if (!us) return null;
      const side = usSide(us, ctx.notionalUsd);
      return side ? { buy: side.fee, sell: side.fee, note: side.note } : null;
    },
    remark: us?.remark ?? config.usRemark ?? "",
    basis: us?.basis ?? config.usBasis ?? `pas de tarif publié par ${name} pour les actions américaines`,
    notes: us?.notes ?? config.usNotes ?? [],
  };

  // A US row, by the place asked or, with none, by the first row named.
  function isUsAsk({ etf, place, currency }) {
    const p = loose(place);
    if (p) return !BUENOS_AIRES.has(p);
    const asked = loose(etf);
    const want = code(currency);
    const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked).filter(
      (r) => !want || code(r.currency) === want
    );
    return named.length > 0 && code(named[0].mic) !== "XBUE" && code(named[0].exchange) !== "BCBA";
  }

  function roundTrip(query = {}) {
    if (isUsAsk(query)) {
      const out = usRoundTrip(usSchedule, query);
      if (!us && out.listing) {
        return { ...out, usd: null, brokerFees: null, why: usWhy || `${name} ne publie aucun tarif pour les actions américaines` };
      }
      return out;
    }
    // One ISIN carries the peso, MEP and cable lines of a title; the front
    // also passes the line's ticker (GGALD vs GGALC), which names one row
    // when no US row shares it in that currency.
    const t = code(query.ticker);
    const want = code(query.currency);
    const sameTicker = t ? rows.filter((r) => code(r.ticker) === t && (!want || code(r.currency) === want)) : [];
    const byTicker = sameTicker.length > 0 && sameTicker.every((r) => code(r.exchange) === "BCBA");
    const out = bymaFile.roundTrip({ ...query, etf: byTicker ? t : query.etf, place: query.place || "BCBA" });
    if (byTicker) out.etf = query.etf;
    // BUENOS_AIRES lets every row through in bymaCost; a US row is not this place.
    if (out.listing && code(out.listing.brokerExchange) !== "BCBA") {
      return {
        usd: null,
        brokerFees: null,
        ccy: out.ccy,
        etf: query.etf,
        place: query.place,
        currency: query.currency,
        onlineBuy: out.onlineBuy,
        cashCurrency: "",
        url: out.url,
        remark: "",
        why: `${query.etf} n'est pas coté sur cette place dans cette devise chez ${name}`,
      };
    }
    return out;
  }

  const SCHEDULE = { ...bymaFile.SCHEDULE, us: us ? { ...us } : null, usWhy: us ? undefined : usWhy, rule606: usSchedule.rule606, ccl: CCL };

  function printCli(metaUrl) {
    let called = false;
    try {
      called = metaUrl === pathToFileURL(process.argv[1]).href;
    } catch {
      called = false;
    }
    if (!called) return;
    const flag = (k) => {
      const hit = process.argv.find((arg) => arg.startsWith(`--${k}=`));
      return hit ? hit.split("=").slice(1).join("=") : null;
    };
    if (process.argv.includes("--schedule")) {
      console.log(JSON.stringify({ ...SCHEDULE, catalogue: String(catalogueUrl) }, null, 2));
      return;
    }
    const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
    if (!etf) {
      console.error(`usage : node brokers/${folder}/${folder}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
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
    console.log(JSON.stringify(out, null, 2));
  }

  return { roundTrip, printCli, SCHEDULE, usSchedule };
}
