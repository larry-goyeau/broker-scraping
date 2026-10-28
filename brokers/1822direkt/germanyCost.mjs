// One round trip on the German place for the German banks whose catalogue is
// germanyBook()'s "Germany" (Volksbanken and the other cooperative banks on
// the DZ BANK / Atruvia brokerage, the Sparkassen, 1822direkt): buy n shares
// on Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Each broker file passes its own order price (one
// function a side, or one per plan); this module adds what the venue bills
// on top, the book, the taxes and the forced FX.
//
// Every one of these price lists prints only the bank's own order price and
// says the venue's charges come on top without printing them, e.g. Edekabank
// PLV Stand 15.01.2026, 9.1.1: "Zusätzlich wird die Bank die ihr bei der
// Auftragsausführung und -abwicklung von Dritten berechneten Auslagen und
// fremden Kosten in Rechnung stellen"; Kreissparkasse Ostalb PLV (Fassung
// Feb. 2026): "Fremdkosten in- und ausländischer Börsen und sonstiger
// Handelsplätze". So the venue charges are priced here from each venue's own
// list, read 2026-10-26, an amount a side:
//
//   Xetra (XETR): Transaktionsentgelt, standard order (a retail order is not
//     a "Lean Order"), 0.72 bp, at least 0.90 € in the Basic Volume model.
//     Deutsche Börse price list T7, Stand 01.07.2026, §2.1 Tabelle 4 and
//     §2.2.1.1/2/4 (High 0.48 bp min 0.60 €, Medium 0.504 bp min 0.63 €,
//     Low 0.552 bp min 0.69 €, Basic 0.72 bp min 0.90 €; the same for DAX,
//     ETF/ETP and other instruments). For an ETF/ETP the fee base stops at
//     1,000,000 €. A non-euro line is valued in euro at the ECB rate of the
//     day before (price list, "Transaktionen in Fremdwährung").
//     https://www.cashmarket.deutsche-boerse.com/resource/blob/2689120/b36a095ff6636e83ca1e3bd00ce5688f/data/2026_07_27_dbag_preisv_t7_xontro.pdf
//     Which model DZ BANK (the Volksbanks' exchange member) or the Sparkassen's
//     member is on is not published, and no current statement shows a Xetra
//     fee small enough to tell (GLS Bank, DZ group, 17.02.2021: 0.71 € on
//     5,047.65 € under the 2021 list), so the dearest model, Basic, is the
//     default, as in brokers/targobankde/targobankde_cost.mjs. A broker file
//     may pass `xetraModel: "high"` when its own statement proves it.
//   Frankfurt floor (XFRA): Transaktionsentgelt, shares and other securities
//     quoted per unit (ETFs/ETPs included), 1.44 bp, at least 0.90 € (Basic;
//     High 0.96 bp min 0.60 €), base capped at 750,000 €, §2.3.1.1 Tabelle
//     14; plus Handelsentgelt 5.04 bp, at least 2.52 €, no cap, §2.3.2.1
//     Tabelle 17. Both are passed on: GENO Broker (DZ BANK group) buy of
//     30.06.2023 on Frankfurt prints "Transaktionsentgelt Börse" and
//     "Handelsentgelt 2,52 EUR"; the 1822direkt Frankfurt sale prints both
//     lines too (Portfolio Performance test files genobroker/Kauf01.txt,
//     direkt1822bank/Verkauf01.txt):
//     https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio.tests/src/name/abuchen/portfolio/datatransfer/pdf
//   Tradegate (XGAT, Tradegate Berlin Stock Exchange since 2026): no exchange
//     fee and no specialist courtage. "Für ihre Tätigkeit erhalten die
//     Marktspezialisten keine Courtage (oder sonstige Entgelte). Zudem erhebt
//     die Tradegate BSX für ihre Dienstleistungen keine Transaktionsentgelte."
//     https://www.tradegatebsx.com/docs/Tradegate_BSX-Intelligent_Handeln.pdf
//     The exchange's Gebührenordnung (Stand 29.06.2026) bills members only
//     admission and yearly participation fees, nothing per trade:
//     https://www.tradegatebsx.com/docs/Tradegate_BSX-Gebuehrenordnung.pdf
//   DZ BANK group banks (group "dz"): every Tradegate statement of the group
//     prints "Übertragungs-/Liefergebühr 0,10 EUR" a side (GLS Bank 2019 to
//     2021, dzbankgruppe/Kauf02, Kauf04-07, Verkauf01-04; GENO Broker
//     19.07.2023 to 11.12.2025, genobroker/Kauf02, Kauf05, Verkauf01-02), so
//     0.10 € is added a side on Tradegate. On Xetra the group printed 0.07 €
//     in 2021 and the 2023 Frankfurt statement none: not added there.
//     Sparkassen and 1822direkt statements (S Broker 2023, 1822direkt) show
//     no such line on Tradegate: nothing added for group "sparkasse".
//   Not added: Clearstream/Eurex Clearing costs (not printed), the
//     Sparkassen "Umlagegebühr" (only when the sale is in another depository
//     than the holding).
//
// Taxes: no German transaction tax or stamp; the French, Italian and Spanish
// FTT on the buy come from taxMap.mjs by ISIN (taxGap → unknown).
// FX: the account is in euro unless the broker file says otherwise
// (`cash`). A non-euro Xetra line (USD, GBP, CHF, SEK, JPY, AUD) settles in
// its own currency and the bank converts at its own rate: with no `fx` in
// the schedule that is a forced, unpublished FX and the total is N/A; with
// `fx: { pct, note }` (one way) it is added on the buy and on the sell. When
// the line's currency is a deposit currency, nothing is converted and the
// remark gives "FX x% when cash ≠ CCY." if `fx` is known.
// No US place on this catalogue: no 606.
//
// Schedule (one per broker file):
//   {
//     broker, folder, catalogueUrl, url, readOn, entity,
//     group: "dz" | "sparkasse" | "other",       // Tradegate delivery fee
//     xetraModel: "basic" | "low" | "medium" | "high",   // default "basic"
//     frankfurtModel: same, default = xetraModel
//     cash: ["EUR"],                             // deposit currencies
//     fx: null | { pct: 0.005, note: "…" },      // one-way conversion cost
//     onlineBuy: true,
//     basis: "…" (French),                       // what was read
//     commission(ctx) → { eur, note } | { eur: null, why },
//     remark: "" | (ctx) => "",
//     // or, for a broker with plans that price differently:
//     plans: { id: { label, commission, remark, basis, onlineBuy } },
//     defaultPlan: "id",
//   }
//   ctx = { side: "buy" | "sell", notionalEur, shares, venue: { mic, label },
//           listing, plan }
//   commission returns the bank's own charges for one side in euro (order
//   price, its own Börsenplatz-/Handelsplatzentgelt, Spesen), not the venue's.
//
// Usage in a broker file:
//   import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";
//   const SCHEDULE = { ..., commission: ({ notionalEur }) => pctFee(notionalEur, { base: 4.9, rate: 0.0025, min: 9.9, max: 39 }) };
//   export function roundTrip(query) { return germanyRoundTrip(SCHEDULE, query); }
//   printCli(import.meta.url, roundTrip);
//
//   node brokers/1822direkt/germanyCost.mjs --test     checks the venue sums

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

export const PRICE_LIST = {
  deutscheBoerse:
    "https://www.cashmarket.deutsche-boerse.com/resource/blob/2689120/b36a095ff6636e83ca1e3bd00ce5688f/data/2026_07_27_dbag_preisv_t7_xontro.pdf",
  tradegate: "https://www.tradegatebsx.com/docs/Tradegate_BSX-Intelligent_Handeln.pdf",
  tradegateFees: "https://www.tradegatebsx.com/docs/Tradegate_BSX-Gebuehrenordnung.pdf",
  readOn: "2026-10-26",
};

// Basis points and floor in euro, standard orders, by fee model.
export const XETRA_MODELS = {
  high: { bp: 0.48, min: 0.6 },
  medium: { bp: 0.504, min: 0.63 },
  low: { bp: 0.552, min: 0.69 },
  basic: { bp: 0.72, min: 0.9 },
};
export const FRANKFURT_MODELS = {
  high: { bp: 0.96, min: 0.6 },
  medium: { bp: 1.008, min: 0.63 },
  low: { bp: 1.104, min: 0.69 },
  basic: { bp: 1.44, min: 0.9 },
};
export const FRANKFURT_TRADING = { bp: 5.04, min: 2.52 };
const XETRA_ETP_CAP = 1_000_000;
const FRANKFURT_CAP = 750_000;
// Übertragungs-/Liefergebühr on DZ BANK group statements, a side.
export const DZ_TRADEGATE_DELIVERY = 0.1;

export const VENUES = {
  XETR: { mic: "XETR", label: "Xetra" },
  XFRA: { mic: "XFRA", label: "Frankfurt" },
  XGAT: { mic: "XGAT", label: "Tradegate" },
};

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const clamp = (v, min, max) => Math.min(max ?? Infinity, Math.max(min ?? 0, v));

// French money and percent: "2,52", "0,25 %".
export const euro = (x) => (x == null ? "?" : x.toFixed(2).replace(".", ","));
export function frPct(rate) {
  const v = Math.round(rate * 100 * 10000) / 10000;
  return `${String(v).replace(".", ",")} %`;
}
const frBp = (bp) => `${String(bp).replace(".", ",")} pb`;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};
export function eurOf(amount, currency) {
  const ccy = code(currency);
  if (!(amount >= 0) || !ccy) return null;
  if (ccy === "EUR") return amount;
  const usd = toUsd(amount, ccy);
  const per = usdPer("EUR");
  return usd == null || !(per > 0) ? null : usd / per;
}

/** The German venue of a catalogue row, by MIC then by name. */
export function venueOf(row) {
  const mic = code(row?.mic);
  if (VENUES[mic]) return VENUES[mic];
  const name = loose(row?.exchange);
  if (name.includes("XETRA")) return VENUES.XETR;
  if (name.includes("TRADEGATE")) return VENUES.XGAT;
  if (name.includes("FRANKFURT")) return VENUES.XFRA;
  return null;
}

const isEtp = (type) => ["ETF", "ETC", "ETN", "ETP"].includes(code(type));

/**
 * What the venue (and, for group "dz", the settlement) bills for one side,
 * in euro, on top of the bank's own price.
 * → { eur, lines: [{ label, eur }], note }
 */
export function venueFeeEur({ mic, notionalEur, type, model = "basic", frankfurtModel = null, group = "other" }) {
  const v = Number(notionalEur);
  if (!(v >= 0)) return { eur: null, lines: [], why: "valeur de l'ordre inconnue" };
  const lines = [];
  if (mic === "XETR") {
    const m = XETRA_MODELS[model];
    if (!m) throw new Error(`modèle Xetra inconnu : ${model}`);
    const base = isEtp(type) ? Math.min(v, XETRA_ETP_CAP) : v;
    lines.push({
      label: `Transaktionsentgelt Xetra (${frBp(m.bp)}, min ${euro(m.min)} €, ${model} volume)`,
      eur: Math.max(m.min, (base * m.bp) / 10000),
    });
  } else if (mic === "XFRA") {
    const fm = frankfurtModel || model;
    const m = FRANKFURT_MODELS[fm];
    if (!m) throw new Error(`modèle Francfort inconnu : ${fm}`);
    lines.push({
      label: `Transaktionsentgelt Francfort (${frBp(m.bp)}, min ${euro(m.min)} €, ${fm} volume)`,
      eur: Math.max(m.min, (Math.min(v, FRANKFURT_CAP) * m.bp) / 10000),
    });
    lines.push({
      label: `Handelsentgelt Francfort (${frBp(FRANKFURT_TRADING.bp)}, min ${euro(FRANKFURT_TRADING.min)} €)`,
      eur: Math.max(FRANKFURT_TRADING.min, (v * FRANKFURT_TRADING.bp) / 10000),
    });
  } else if (mic === "XGAT") {
    if (group === "dz") lines.push({ label: "Übertragungs-/Liefergebühr (relevés du groupe DZ BANK)", eur: DZ_TRADEGATE_DELIVERY });
  } else {
    return { eur: null, lines: [], why: `${mic || "?"} n'est pas une place du catalogue Germany` };
  }
  const eur = lines.reduce((s, l) => s + l.eur, 0);
  const note =
    mic === "XGAT"
      ? `Tradegate : ni Transaktionsentgelt ni courtage` + (lines.length ? ` ; ${lines.map((l) => `${l.label} ${euro(l.eur)} €`).join(" + ")}` : "")
      : lines.map((l) => `${l.label} ${euro(l.eur)} €`).join(" + ");
  return { eur, lines, note };
}

/** base + rate × value, then floor and cap (all in euro). */
export function pctFee(value, { base = 0, rate = 0, min = 0, max = Infinity, label = null } = {}) {
  const eur = clamp(base + rate * value, min, max);
  const parts = [];
  if (base) parts.push(`${euro(base)} €`);
  if (rate) parts.push(frPct(rate));
  let note = parts.join(" + ") || "0 €";
  if (min) note += `, min ${euro(min)} €`;
  if (Number.isFinite(max)) note += `, max ${euro(max)} €`;
  return { eur, note: `${label ? `${label} : ` : ""}${note} → ${euro(eur)} €` };
}

/** Value bands: [{ upTo, base, rate, min, max }], upTo inclusive, last Infinity. */
export function bandFee(value, bands, label = null) {
  const hit = bands.find((b) => value <= b.upTo) || bands[bands.length - 1];
  const out = pctFee(value, { ...hit, label });
  return { ...out, note: `${out.note} (tranche jusqu'à ${Number.isFinite(hit.upTo) ? `${euro(hit.upTo)} €` : "∞"})` };
}

const loaded = new Map();
function loadRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (!loaded.has(key)) {
    let rows = null;
    if (fs.existsSync(catalogueUrl)) {
      const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
      rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rows.length) warmListingIndex(rows);
    }
    loaded.set(key, rows);
  }
  return loaded.get(key);
}

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantVenue = place ? venueOf({ mic: place, exchange: place }) : null;
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue) return venueOf(m.row)?.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || code(m.row.mic) === code(place);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function tariffOf(schedule, plan) {
  if (!schedule.plans) return { id: null, tariff: schedule };
  const id = String(plan || schedule.defaultPlan || Object.keys(schedule.plans)[0]).toLowerCase();
  const tariff = schedule.plans[id];
  return tariff ? { id, tariff: { ...schedule, ...tariff } } : { id, tariff: null };
}

export function germanyRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null, plan = null } = query;
  const { id: planId, tariff } = tariffOf(schedule, plan);
  const cash = (schedule.cash || ["EUR"]).map(code);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: planId,
    onlineBuy: tariff?.onlineBuy ?? true,
    cashCurrency: cash[0],
    url: schedule.url,
    remark: "",
  };
  if (!tariff) {
    return { ...answer, why: `formule inconnue : ${plan} (${Object.keys(schedule.plans).join("|")})` };
  }
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: schedule.folder,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const venue = venueOf(m.row);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const model = schedule.xetraModel || "basic";
  const frankfurtModel = schedule.frankfurtModel || model;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `${tariff.basis || `barème ${schedule.broker} relu le ${schedule.readOn}`} ; ` +
      `frais de la place selon les grilles relues le ${PRICE_LIST.readOn} (Deutsche Börse T7 Stand 01.07.2026, modèle ${model} ; Tradegate BSX sans frais)`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };
  if (!venue) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas une place du catalogue Germany` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = eurOf(notional, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (notionalEur == null) return { ...shared, trade, why: `aucun cours ${listing.currency} dans fx.mjs` };

  // Forced FX: the line's currency is not a deposit currency.
  const held = cash.includes(listing.currency);
  const fxPct = schedule.fx?.pct ?? null;
  if (!held && fxPct == null) {
    return {
      ...shared,
      trade,
      why:
        `la ligne se règle en ${listing.currency} et ${schedule.broker} convertit depuis l'euro à son propre cours, ` +
        `sans marge publiée pour les titres : change forcé inconnu`,
    };
  }
  const fxEach = held ? 0 : notionalEur * fxPct;

  const ctxOf = (side) => ({ side, notionalEur, shares: n, venue, listing, plan: planId });
  const buy = tariff.commission(ctxOf("buy"));
  const sell = tariff.commission(ctxOf("sell"));
  const fee = venueFeeEur({ mic: venue.mic, notionalEur, type: listing.type, model, frankfurtModel, group: schedule.group });
  const priced = buy.eur != null && sell.eur != null && fee.eur != null;
  const bankEur = priced ? buy.eur + sell.eur : null;
  const venueEur = fee.eur == null ? null : fee.eur * 2;
  const courtageUsd = priced ? dollars(bankEur + venueEur, "EUR") : null;
  const fxUsd = dollars(fxEach * 2, "EUR");
  const brokerFees = priced ? plus(courtageUsd, fxUsd) : null;
  const bookUsd = parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const remarks = [];
  const own = typeof tariff.remark === "function" ? tariff.remark(ctxOf("buy")) : tariff.remark;
  if (own) remarks.push(own);
  if (held && listing.currency !== "EUR" && fxPct != null) {
    remarks.push(fxRemark(String(Math.round(fxPct * 10000) / 100), listing.currency, schedule.fx?.extra || ""));
  }

  const confidence = [
    shared.basis,
    buy.note ? `achat : ${buy.note}` : null,
    sell.note && sell.note !== buy.note ? `vente : ${sell.note}` : sell.note ? "vente : idem" : null,
    fee.note ? `${fee.note}, par ordre` : null,
    !held ? `change ${frPct(fxPct)} à l'achat et à la vente${schedule.fx?.note ? ` (${schedule.fx.note})` : ""}` : null,
    taxTotal > 0 ? `taxe ${(100 * taxTotal).toFixed(3)} % à l'achat (taxMap)` : null,
    gap ? `${gap} : total inconnu` : null,
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  const why = [
    buy.why || null,
    sell.why && sell.why !== buy.why ? sell.why : null,
    fee.why || null,
    gap || null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: remarks.join(" "),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    commission: {
      venue: venue.label,
      buyEach: buy.eur ?? null,
      sellEach: sell.eur ?? null,
      venueEach: fee.eur,
      venueLines: fee.lines,
      fxEach,
      currency: "EUR",
      eachWay: true,
    },
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(courtageUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

export function printCli(callerUrl, roundTrip) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node <cost file> <ticker|ISIN> [place] [currency] [--shares=n] [--price=p] [--plan=id]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    ...(flag("plan") ? { plan: flag("plan") } : {}),
  });
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}${out.plan ? `, plan ${out.plan}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
    if (out.parts) for (const [k, v] of Object.entries(out.parts)) console.log(`  ${k.padEnd(12)}: ${v == null ? "unknown" : `${v} $`}`);
  }
  if (out.why) console.log(`\n${out.why}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

// Self-check of the venue sums against the printed tables.
function selfTest() {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const cases = [
    // Xetra Basic: 1,000 € → 0.072 € < floor 0.90.
    [venueFeeEur({ mic: "XETR", notionalEur: 1000, type: "STOCK" }).eur, 0.9],
    // Xetra Basic: 20,000 € → 1.44 €.
    [venueFeeEur({ mic: "XETR", notionalEur: 20000, type: "STOCK" }).eur, 1.44],
    // Xetra High: 20,000 € → 0.96 €.
    [venueFeeEur({ mic: "XETR", notionalEur: 20000, type: "ETF", model: "high" }).eur, 0.96],
    // Xetra ETF base capped at 1,000,000 €: Basic → 72 €.
    [venueFeeEur({ mic: "XETR", notionalEur: 2_000_000, type: "ETF" }).eur, 72],
    // Frankfurt Basic 1,000 €: 0.90 + 2.52.
    [venueFeeEur({ mic: "XFRA", notionalEur: 1000, type: "STOCK" }).eur, 3.42],
    // Frankfurt Basic 10,000 €: max(0.90, 1.44) + max(2.52, 5.04).
    [venueFeeEur({ mic: "XFRA", notionalEur: 10000, type: "ETF" }).eur, 6.48],
    // Frankfurt transaction base capped at 750,000 €: 108 + 504.
    [venueFeeEur({ mic: "XFRA", notionalEur: 1_000_000, type: "STOCK" }).eur, 612],
    // Tradegate: nothing, 0.10 € for the DZ group.
    [venueFeeEur({ mic: "XGAT", notionalEur: 1000, type: "STOCK" }).eur, 0],
    [venueFeeEur({ mic: "XGAT", notionalEur: 1000, type: "STOCK", group: "dz" }).eur, 0.1],
    // Commission shapes.
    [pctFee(1000, { base: 4.9, rate: 0.0025, min: 9.9, max: 39 }).eur, 9.9],
    [pctFee(10000, { base: 4.9, rate: 0.0025, min: 9.9, max: 39 }).eur, 29.9],
    [pctFee(100000, { base: 4.9, rate: 0.0025, min: 9.9, max: 39 }).eur, 39],
    [bandFee(30000, [{ upTo: 25000, rate: 0.004 }, { upTo: 50000, rate: 0.0035 }, { upTo: Infinity, rate: 0.002, max: 59.95 }]).eur, 105],
  ];
  let bad = 0;
  cases.forEach(([got, want], i) => {
    const ok = near(got, want);
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} #${i + 1}: ${got} (want ${want})`);
  });
  process.exit(bad ? 1 : 0);
}

try {
  if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes("--test")) selfTest();
} catch {
  // imported
}
