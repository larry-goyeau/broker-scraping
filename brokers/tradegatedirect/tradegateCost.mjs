// One round trip on Tradegate BSX (XGAT) for the brokers whose only place is
// Tradegate (tradegate.direct, the Sparkassen S-Neo depots, Mintos): buy n
// shares and sell them straight back, online, in dollars. Each broker file
// passes its own order price (one function a side, or one per plan); this
// module adds the book, the taxes, the minimum order and the forced FX.
// The contract is the one of brokers/1822direkt/germanyCost.mjs (same
// `commission(ctx)`, same answer shape, same `printCli`), so a broker on
// both catalogues reads the same way; that module's Tradegate leg is the
// group "sparkasse"/"other" one, nothing per trade.
//
// The place, read 2026-10-26:
//   No exchange fee and no specialist courtage. "Für ihre Tätigkeit erhalten
//   die Marktspezialisten keine Courtage (oder sonstige Entgelte). Zudem
//   erhebt die Tradegate BSX für ihre Dienstleistungen keine
//   Transaktionsentgelte."
//     https://www.tradegatebsx.com/docs/Tradegate_BSX-Intelligent_Handeln.pdf
//   The Gebührenordnung (Stand 29.06.2026) bills members admission and
//   yearly participation only, nothing per trade:
//     https://www.tradegatebsx.com/docs/Tradegate_BSX-Gebuehrenordnung.pdf
//   Berlin's exchange supervisor: "Börsenplatzabhängige Entgelte wie z.B.
//   eine Makler-Courtage fallen nicht an." Tradegate Exchange and Börse
//   Berlin merged on 1 January 2026 into Tradegate BSX; the ~21,100 lines
//   trade in its Freiverkehr.
//     https://www.berlin.de/sen/wirtschaft/wirtschaftsrecht/boersenaufsicht/artikel.84365.php
//   Every line trades in euro ("Kurse in EUR"), whole units, 07:30-22:00
//   Berlin, no lot size. Settlement Clearstream Banking Frankfurt (CBF).
//
// Book: spreads/spread.json, leaf XGAT/EUR, `bp` = (ask - bid) / mid from
//   Tradegate's delayed MiFID pre-trade tape (spreads/spread.mjs,
//   loadTradegate), so a round trip is the book once. 10,987 of the 11,151
//   catalogue lines have a leaf on 2026-10-26; the rest are N/A.
//
// Taxes, on the buy only, from taxMap.mjs by ISIN:
//   kept: French FTT 0.40 % (BOFiP list), Italian FTT 0.20 % (L. 199/2025),
//     Spanish FTT 0.20 % (AEAT list). They follow the issuer wherever the
//     share trades. N26 measured the French one on an Upvest/Tradegate ex
//     ante sheet (brokers/N26/N26_cost.mjs, MEASURED). taxGap → unknown.
//   dropped: UK stamp duty / SDRT (0.5 %), Irish stamp (1 %), the Gibraltar
//     line and the PTM levy. They reach a trade on the home book only
//     (taxMap.mjs STAMP_BOOKS: XLON, AQXE, XMSM); a Tradegate trade settles
//     inside CBF, not CREST. Measured too: N26's ex ante sheet on 100 € of
//     Keller Group (GB) at Tradegate shows two tickets and no stamp.
//   No German transaction tax. No US place, so no 606, SEC or TAF.
//
// FX: every line is EUR. When EUR is not one of the broker's deposit
// currencies (`cash`), the trip needs a published `fx.pct` or it is N/A;
// when it is, nothing is converted and there is no FX remark (the line is
// already in the cash currency).
//
// Schedule (one per broker file):
//   {
//     broker, folder, catalogueUrl, url, readOn, entity,
//     cash: ["EUR"],                              // deposit currencies
//     fx: null | { pct: 0.005, note: "…" },       // one-way, only if cash ≠ EUR
//     onlineBuy: true,
//     basis: "…" (French),                        // what was read
//     commission(ctx) → { eur, note } | { eur: null, why },
//     minBuy: null | (ctx) → euros (smallest buy accepted) | null,
//     remark: "" | (ctx) => "",
//     // or, for a broker with plans that price differently:
//     plans: { id: { label, commission, remark, basis, onlineBuy, minBuy } },
//     defaultPlan: "id",
//   }
//   ctx = { side: "buy" | "sell", notionalEur, shares, listing, plan,
//           etp: true for ETF/ETC/ETN/ETP, venue: { mic: "XGAT", label } }
//   commission returns the broker's own charges for one side, in euro.
//
// Usage in a broker file:
//   import { tradegateRoundTrip, pctFee, printCli } from "../tradegatedirect/tradegateCost.mjs";
//   const SCHEDULE = { ..., commission: () => ({ eur: 0.95, note: "0,95 € par ordre" }) };
//   export function roundTrip(query) { return tradegateRoundTrip(SCHEDULE, query); }
//   printCli(import.meta.url, roundTrip);
//
//   node brokers/tradegatedirect/tradegateCost.mjs --test

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { pctFee, bandFee, euro, frPct, printCli } from "../1822direkt/germanyCost.mjs";

export { pctFee, bandFee, euro, frPct, printCli };

export const TRADEGATE = {
  mic: "XGAT",
  label: "Tradegate",
  currency: "EUR",
  readOn: "2026-10-26",
  sources: {
    brochure: "https://www.tradegatebsx.com/docs/Tradegate_BSX-Intelligent_Handeln.pdf",
    fees: "https://www.tradegatebsx.com/docs/Tradegate_BSX-Gebuehrenordnung.pdf",
    supervisor: "https://www.berlin.de/sen/wirtschaft/wirtschaftsrecht/boersenaufsicht/artikel.84365.php",
  },
};
const VENUE = { mic: TRADEGATE.mic, label: TRADEGATE.label };

// Lines of taxMap.mjs that do not reach a Tradegate trade (see header).
export const DROPPED_TAXES = ["STAMP_DUTY", "PTM_LEVY"];

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};
export const isEtp = (type) => ["ETF", "ETC", "ETN", "ETP"].includes(code(type));

/** True when the catalogue row is a Tradegate line. */
export function isTradegate(row) {
  return code(row?.mic) === "XGAT" || loose(row?.exchange).includes("TRADEGATE");
}

/** The taxes a Tradegate buy pays: taxMap.mjs minus the home-book stamps. */
export function tradegateTaxes(isin, type) {
  const tax = taxesOf(isin);
  const all = taxRates(tax);
  const rates = {};
  const dropped = [];
  for (const [name, rate] of Object.entries(all)) {
    if (DROPPED_TAXES.includes(name)) {
      if (rate > 0) dropped.push(name);
    } else rates[name] = rate;
  }
  for (const name of Object.keys(tax?.buy ?? {})) {
    if (/PTM/i.test(name) && !dropped.includes("PTM_LEVY")) dropped.push("PTM_LEVY");
  }
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  // taxGap already knows a UK / IE share off its home book owes no stamp.
  const gap = taxGap(isin, type, TRADEGATE.mic);
  return { tax, rates, dropped, taxPct, gap };
}

const loaded = new Map();
export function loadRows(catalogueUrl) {
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

export function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantPlace.includes("TRADEGATE") || ["XGAT", "TGAT", "TDG", "XGRM"].includes(wantPlace)) return isTradegate(m.row);
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

/** How many catalogue lines have a Tradegate book, by type. */
export function coverage(catalogueUrl) {
  const rows = loadRows(catalogueUrl) || [];
  const out = {};
  for (const r of rows) {
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, { isin: r.isin, mic: venue?.mic ?? null, currency: r.currency, unsourced, ticker: r.ticker });
    const slot = (out[r.type || "?"] ||= { n: 0, withBook: 0 });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

export function tradegateRoundTrip(schedule, query) {
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const { tax, rates, dropped, taxPct, gap } = tradegateTaxes(listing.isin, listing.type);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `${tariff.basis || `barème ${schedule.broker} relu le ${schedule.readOn}`} ; ` +
      `Tradegate BSX sans Transaktionsentgelt ni courtage (relu le ${TRADEGATE.readOn})`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };
  if (!isTradegate(m.row)) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas Tradegate` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const eurPer = usdPer("EUR");
  const notionalEur = listing.currency === "EUR" ? notional : notionalUsd != null && eurPer > 0 ? notionalUsd / eurPer : null;
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (notionalEur == null) return { ...shared, trade, why: `aucun cours ${listing.currency} dans fx.mjs` };

  // Forced FX: the line's currency (EUR) is not a deposit currency.
  const held = cash.includes(listing.currency);
  const fxPct = schedule.fx?.pct ?? null;
  if (!held && fxPct == null) {
    return {
      ...shared,
      trade,
      why:
        `la ligne se règle en ${listing.currency} et ${schedule.broker} convertit depuis ${cash[0]} à son propre cours, ` +
        `sans marge publiée : change forcé inconnu`,
    };
  }
  const fxEach = held ? 0 : notionalEur * fxPct;

  const ctxOf = (side) => ({ side, notionalEur, shares: n, venue: VENUE, listing, plan: planId, etp: isEtp(listing.type) });
  const minBuy = typeof tariff.minBuy === "function" ? tariff.minBuy(ctxOf("buy")) : null;
  if (minBuy != null && notionalEur < minBuy) {
    return {
      ...shared,
      trade,
      why: `ordre d'achat de ${euro(notionalEur)} € sous le minimum de ${euro(minBuy)} € chez ${schedule.broker}`,
    };
  }
  const buy = tariff.commission(ctxOf("buy"));
  const sell = tariff.commission(ctxOf("sell"));
  const priced = buy.eur != null && sell.eur != null;
  const bankEur = priced ? buy.eur + sell.eur : null;
  const courtageUsd = priced ? dollars(bankEur, "EUR") : null;
  const fxUsd = dollars(fxEach * 2, "EUR");
  const brokerFees = priced ? plus(courtageUsd, fxUsd) : null;
  const bookUsd = parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const remarks = [];
  const own = typeof tariff.remark === "function" ? tariff.remark(ctxOf("buy")) : tariff.remark;
  if (own) remarks.push(own);

  const confidence = [
    shared.basis,
    buy.note ? `achat : ${buy.note}` : null,
    sell.note && sell.note !== buy.note ? `vente : ${sell.note}` : sell.note ? "vente : idem" : null,
    !held ? `change ${frPct(fxPct)} à l'achat et à la vente${schedule.fx?.note ? ` (${schedule.fx.note})` : ""}` : null,
    taxPct > 0 ? `${Object.keys(rates).join(", ")} ${(100 * taxPct).toFixed(2).replace(".", ",")} % à l'achat (taxMap)` : null,
    dropped.length
      ? `${dropped.join(", ")} écarté : le timbre britannique / irlandais ne frappe que le carnet d'origine, ` +
        `un achat à Tradegate se règle chez Clearstream (taxMap.mjs STAMP_BOOKS ; mesuré par N26 sur Keller Group)`
      : null,
    gap ? `${gap} : total inconnu` : null,
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet Tradegate ${marketBp} pb, aller-retour`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  const why = [
    buy.why || null,
    sell.why && sell.why !== buy.why ? sell.why : null,
    gap || null,
    bookUsd == null ? `aucun carnet Tradegate pour ${listing.isin} : ${m.unsourced?.why || "pas de feuille dans spread.json"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: remarks.join(" "),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    commission: {
      venue: VENUE.label,
      buyEach: buy.eur ?? null,
      sellEach: sell.eur ?? null,
      venueEach: 0,
      fxEach,
      currency: "EUR",
      eachWay: true,
    },
    trade,
    buy: { commission: buy.eur ?? null, taxes: finite(taxUsd, 6), taxRates: Object.keys(rates).length ? rates : null, droppedTaxes: dropped.length ? dropped : null },
    sell: { commission: sell.eur ?? null },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(courtageUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

// Self-check on real catalogue rows (tradegatedirect-parsed.json).
function selfTest() {
  const CAT = new URL("tradegatedirect-parsed.json", import.meta.url);
  const near = (a, b) => a != null && Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  const eur = usdPer("EUR");
  const flat = (x) => ({ broker: "test", folder: "tradegatedirect", catalogueUrl: CAT, url: "", readOn: "2026-10-26", commission: () => ({ eur: x, note: `${x} €` }) });
  const leafBp = (isin) => spreads[isin]?.XGAT?.EUR?.bp;
  let bad = 0;
  const check = (label, got, want) => {
    const ok = near(got, want);
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got} (want ${want})`);
  };
  // iShares Core MSCI World, 10 × 100 € at 0 €: book only.
  let r = tradegateRoundTrip(flat(0), { etf: "IE00B4L5Y983", place: "Tradegate", currency: "EUR", shares: 10, price: 100 });
  check("IE00B4L5Y983 0 €", r.usd, (1000 * eur * leafBp("IE00B4L5Y983")) / 1e4);
  // Apple, 4 × 215 € at 0.95 € a side.
  r = tradegateRoundTrip(flat(0.95), { etf: "US0378331005", place: "XGAT", currency: "EUR", shares: 4, price: 215 });
  check("AAPL 0,95 €", r.usd, (860 * eur * leafBp("US0378331005")) / 1e4 + 1.9 * eur);
  check("AAPL brokerFees", r.brokerFees, 1.9 * eur);
  // LVMH, 2 × 500 €, 2 € a side: book + 2 tickets + French FTT 0.40 %.
  r = tradegateRoundTrip(flat(2), { etf: "FR0000121014", place: "Tradegate", currency: "EUR", shares: 2, price: 500 });
  check("LVMH FTT", r.usd, (1000 * eur * leafBp("FR0000121014")) / 1e4 + 4 * eur + 1000 * eur * 0.004);
  // 3i Group (GB): UK stamp dropped.
  r = tradegateRoundTrip(flat(0), { etf: "GB00B1YW4409", place: "Tradegate", currency: "EUR", shares: 20, price: 45 });
  check("3i no stamp", r.parts?.taxes, 0);
  if (!r.buy?.droppedTaxes?.includes("STAMP_DUTY")) { bad++; console.log("FAIL 3i droppedTaxes"); }
  // Minimum buy 500 € on a share.
  r = tradegateRoundTrip({ ...flat(0), minBuy: (c) => (c.etp ? 100 : 500) }, { etf: "US0378331005", shares: 2, price: 215 });
  check("min buy → N/A", r.usd ?? -1, -1);
  // EUR not a deposit currency, no FX published → N/A.
  r = tradegateRoundTrip({ ...flat(0), cash: ["USD"] }, { etf: "US0378331005", shares: 4, price: 215 });
  check("forced FX → N/A", r.usd ?? -1, -1);
  console.log(JSON.stringify(coverage(CAT)));
  process.exit(bad ? 1 : 0);
}

try {
  if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes("--test")) selfTest();
} catch {
  // imported
}
