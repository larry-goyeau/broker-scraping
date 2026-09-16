// Which stamp / FTT an ISIN pays. The reading is Trading212's ex-ante
// disclosure; the fact is about the instrument, so every `*_cost.mjs`
// reads this rather than the T212 catalogue.
//
//   parsed_json/taxes.json  →  byIsin[ISIN]
//
// `taxes.mjs` writes `byIsin` next to `byCode` on every save. Rebuild the
// index without a sweep:
//
//   node taxMap.mjs --rebuild

import fs from "node:fs";

const TAXES = new URL("parsed_json/taxes.json", import.meta.url);
const CATALOGUE = new URL("trading212/trading212-parsed.json", import.meta.url);

const STAMP_FTT = /STAMP|FRENCH_TRANSACTION|ITALIAN|SPANISH|BELGIAN|IRISH|FTT|TOB/i;

function score(entry) {
  let n = 0;
  for (const [name, line] of Object.entries(entry?.achat ?? {})) {
    if (line?.ofValue == null) continue;
    n += STAMP_FTT.test(name) ? 2 : 1;
  }
  for (const line of Object.values(entry?.vente ?? {})) {
    if (line?.ofValue != null || line?.amount) n += 0.25;
  }
  return n;
}

export function indexByIsin(byCode, catalogue) {
  const out = {};
  const scores = {};
  for (const r of Array.isArray(catalogue) ? catalogue : catalogue?.rows || []) {
    const isin = String(r.isin || "").toUpperCase();
    const entry = r.code ? byCode?.[r.code] : null;
    // A line present in `byCode` was priced, and a priced line that came back with no charge is
    // an answer, not a silence. The index used to drop those, so a venue swept in full and found
    // clean — Bolsa de Madrid, 139 Spanish issuers and not one transaction tax — looked exactly
    // like a venue nobody had ever asked about, and `taxesOf` called it `assumedZero`.
    if (!isin || !entry) continue;
    const next = score(entry);
    if (out[isin] && scores[isin] >= next) continue;
    out[isin] = {
      achat: entry.achat ?? {},
      vente: entry.vente ?? {},
    };
    scores[isin] = next;
  }
  return out;
}

export function rebuildByIsin(taxFile) {
  if (!taxFile?.byCode || !fs.existsSync(CATALOGUE)) return taxFile?.byIsin ?? {};
  const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  return indexByIsin(taxFile.byCode, catalogue);
}

const taxFile = fs.existsSync(TAXES) ? JSON.parse(fs.readFileSync(TAXES, "utf8")) : null;
const byIsin = taxFile?.byIsin && Object.keys(taxFile.byIsin).length
  ? taxFile.byIsin
  : rebuildByIsin(taxFile);

export function taxEntry(isin) {
  const id = String(isin || "").toUpperCase();
  return id && byIsin ? byIsin[id] ?? null : null;
}

export function taxesOf(isin) {
  if (!taxFile) return { known: false, why: "relevé fiscal absent : lancer node taxes.mjs" };
  const entry = taxEntry(isin);
  if (entry) return { known: true, buy: entry.achat ?? {}, sell: entry.vente ?? {} };
  return { known: false, assumedZero: true, why: "pas de ligne fiscale pour cet ISIN" };
}

// A levy charged per order rather than per euro. The sweep still prints an
// `ofValue` for it, because it divided the charge by whatever notional it
// happened to ask about — 1,50 £ over 69 898 £ reads as 0,00215 %. That
// fraction is true of that one order and of no other, so it is not a rate and
// does not belong among them: read as one it under-charges a small order and,
// on a large one, bills the levy many times over. Which order pays it, and how
// often, is a threshold each `*_cost.mjs` already knows and applies itself.
const PER_ORDER = /PTM/i;

export function taxRates(tax) {
  const rates = {};
  for (const [name, line] of Object.entries(tax?.buy ?? {})) {
    if (line.ofValue != null && !PER_ORDER.test(name)) rates[name] = line.ofValue;
  }
  return rates;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--rebuild")) {
  if (!taxFile) {
    console.error("parsed_json/taxes.json absent : lancer node taxes.mjs");
    process.exit(1);
  }
  taxFile.byIsin = rebuildByIsin(taxFile);
  fs.writeFileSync(TAXES, JSON.stringify(taxFile, null, 2));
  console.log(`${Object.keys(taxFile.byIsin).length} ISIN dans parsed_json/taxes.json → byIsin`);
}
