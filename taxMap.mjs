// Which stamp / FTT an ISIN pays. The reading is Trading212's ex-ante
// disclosure; the fact is about the instrument, so every `*_cost.mjs`
// reads this rather than the T212 catalogue.
//
//   taxes.json  →  byIsin[ISIN]
//
// `taxes.mjs` writes `byIsin` next to `byCode` on every save. Rebuild the
// index without a sweep:
//
//   node taxMap.mjs --rebuild

import fs from "node:fs";

const TAXES = new URL("taxes.json", import.meta.url);
const CATALOGUE = new URL("brokers/trading212/trading212-parsed.json", import.meta.url);

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

// Lines Trading212 does not carry, so its disclosure is silent on them, taken
// from the rule itself. HMRC charges 0.5 % SDRT on a purchase of existing
// shares in a UK-incorporated company; the only market exemption is a
// recognised growth market such as AIM (gov.uk/tax-buy-shares,
// gov.uk/guidance/stamp-duty-reserve-tax-reliefs-and-exemptions). Each line
// below is a UK plc on the LSE Main Market, as the LSE's own instrument data
// says (market MAINMARKET, country GB), read 2026-10-18. The sweep's entry
// wins whenever it has one.
const UK_STAMP = { achat: { STAMP_DUTY: { ofValue: 0.005 } }, vente: {} };
const SUPPLEMENT = {
  GB00BLDYK618: UK_STAMP, // SMT  Scottish Mortgage Investment Trust plc, SET1
  GB00BS88V647: UK_STAMP, // FCIT F&C Investment Trust plc, SET1
  GB00BNG2M159: UK_STAMP, // ATT  Allianz Technology Trust plc, STMM
  GB00BJ0LT190: UK_STAMP, // HGT  HgCapital Trust plc, STMM
  GB00BNKDVV71: UK_STAMP, // LTI  Lindsell Train Investment Trust plc, SSMM
};

export function taxEntry(isin) {
  const id = String(isin || "").toUpperCase();
  if (!id) return null;
  return byIsin?.[id] ?? SUPPLEMENT[id] ?? null;
}

// A share whose issuer country has a transaction tax (UK and Irish stamp,
// French, Italian and Spanish FTT) and that neither the sweep nor the
// supplement covers: whether it pays, and how much, is unknown, and an
// unknown leg makes the trip unknown (na.mjs). ETFs are outside all five.
// French, Italian and Spanish FTT follow the issuer wherever the share
// trades. UK and Irish stamp reach a trade on the home book only: a UK or
// Irish share bought on a foreign exchange settles in that market's
// clearing system, which pays the entry charge once, so that trade pays
// none. With no MIC the place is unknown and so is the stamp.
// Returns why, or null when the tax is known (including known to be nil).
const TAXING_COUNTRIES = new Set(["GB", "IE", "FR", "IT", "ES"]);
const STAMP_BOOKS = {
  GB: new Set(["XLON", "AQXE", "XMSM"]),
  IE: new Set(["XMSM", "XLON", "AQXE"]),
};
export function taxGap(isin, type, mic = null) {
  const id = String(isin || "").toUpperCase();
  if (String(type || "").toUpperCase() !== "STOCK") return null;
  const country = id.slice(0, 2);
  if (!TAXING_COUNTRIES.has(country)) return null;
  if (STAMP_BOOKS[country] && mic && !STAMP_BOOKS[country].has(String(mic).toUpperCase())) return null;
  if (taxEntry(id)) return null;
  return `taxe de transaction inconnue pour ${id} (${id.slice(0, 2)}) : pas de ligne fiscale`;
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
    console.error("taxes.json absent : lancer node taxes.mjs");
    process.exit(1);
  }
  taxFile.byIsin = rebuildByIsin(taxFile);
  fs.writeFileSync(TAXES, JSON.stringify(taxFile, null, 2));
  console.log(`${Object.keys(taxFile.byIsin).length} ISIN dans taxes.json → byIsin`);
}
