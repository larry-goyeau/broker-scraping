// Shared round-trip engine for the Swiss banks whose one place is
// "Switzerland" and whose catalogue is the SIX Swiss Exchange book
// (sixBook.mjs): migros, banquecantonalen, appenzellerkanto,
// urnerkantonalban, banquecantonaled, glarnerregionalb, clientissparundl,
// acrevis, hypothekarbankle, aek1826, bancapopolaredis, ersparniskassesc,
// zimmerberg, sparkasseschwyz, eki, sparundleihkasse, clientisoberaarg,
// clientisthur, clientisentlebuc, clientisimthal, gantrisch, slm,
// sparundleihkassech, eek. Each broker's `<folder>_cost.mjs` gives its own
// courtage (a `commission` function, per plan if it has plans), its FX
// markup and deposit currencies; this file does the rest the way
// yuh_cost.mjs does: catalogue lookup, the SIX book, the Swiss stamp, the
// SIX exchange fee, taxMap, a forced conversion, the answer in dollars.
//
// Every tariff in the group prints its courtage in CHF and says the
// exchange's fees and the federal stamp come on top ("Börsengebühren,
// Umsatzabgaben und übrige Steuern ... werden separat verrechnet", Bank
// Zimmerberg; "Anfallende Börsengebühren, sowie staatliche Gebühren und
// Abgaben, werden weiterverrechnet", Migros Bank). None prints the
// exchange's rate, so the exchange's own list is used:
//
// SIX Swiss Exchange, List of Charges under the Trading Rules, dated
// 8 April 2026, in force 1 July 2026, read on 2026-10-26:
//   https://www.ser-ag.com/dam/downloads/regulation/trading/directives/loc-tr-en.pdf
// Each execution pays a transaction fee plus an ad valorem fee
// (max(floor, scale x amount), capped where a cap is printed), clause 7.
// A retail order ("1.3 Fees for trades with Retail orders" in each annex),
// per execution, in CHF:
//   Annex A Blue Chip (SLI)        CHF 1.00 + max(0.50, 0.65 bp)
//   Annex B Mid-/Small-Cap         CHF 1.00 + max(0.50, 0.55 bp)
//   Annex C Sparks                 CHF 1.00 + max(0.50, 0.55 bp)
//   Annex D GDRs                   CHF 1.00 + max(0.50, 0.55 bp)
//   Annex E Secondary listings     CHF 1.00 + max(0.50, 0.65 bp)
//   Annex F Sponsored foreign      CHF 1.00 + max(1.00, 1.00 bp)
//   Annex J Investment funds       CHF 1.50 + max(0.50, 1.50 bp), cap 150
//   Annex K ETF and ETP            CHF 1.50 + max(0.50, 1.50 bp), cap 150
//   Annex L Sponsored funds        CHF 1.50 + max(1.50, 7.00 bp), cap 250
// Promotions in force (all transaction and ad valorem fees waived):
//   "Time-limited trading fee promotion for Retail Flow in Blue Chip &
//   Small/Mid-Caps" (03.06.2026): aggressive retail orders in continuous
//   trading, Blue Chip and Mid-/Small-Cap segments, 1 July 2026 to
//   30 June 2027.
//   https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/fee-promotion-retail-flow-en.pdf
//   "Time-limited Trading Fee Promotion for Retail Order Flow in Sponsored
//   Foreign Shares" (31.10.2025): 1 December 2025 to 30 November 2026.
//   https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/sponsored-foreign-shares-retail-flow-fee-promotion-en.pdf
// A round trip here is two market orders, each one execution: aggressive
// retail flow. After a promotion ends the annex rate applies; for Swiss
// shares then the Blue Chip 0.65 bp (the higher of A and B, as the
// catalogue does not say which segment a share trades in).
//
// Segment of a catalogue row (sixBook keeps the SIX listing standard in
// `raw`): ETF/ETN/ETC -> Annex K; STOCK in the "SIX Sponsored Segment" ->
// F; "Standard Sparks" -> C; "Standard for Depository Receipts" -> D; a CH
// or LI ISIN -> A/B; a foreign ISIN listed primarily on SIX (PRIMARY_ABROAD
// below, read from SIX's EQ/FS reference lines on 2026-10-26) -> A/B; any
// other foreign share -> E (secondary listing). FUND rows (none in the
// catalogue today): real estate -> J, others -> L.
//
// Swiss federal transfer stamp (Umsatzabgabe), StG art. 13, 16 and 19:
// 1.5 per mille on Swiss documents and 3 per mille on foreign ones; the
// bank, a securities dealer, owes half for each party that is not a
// dealer, so the client pays 0.075 % (CH or LI ISIN, StG art. 13 para. 2
// and the customs treaty) or 0.15 % (other ISIN) on the buy and on the
// sale, as in yuh_cost.mjs and swissquote_cost.mjs.
//   https://www.fedlex.admin.ch/eli/cc/1974/11_11_11/de
// Other transaction taxes (French FTT on a French share bought on SIX,
// UK stamp, ...) come from taxMap.mjs by ISIN; a share of a taxing country
// with no tax line is N/A (taxGap). Courtage is VAT-exempt (MWSTG art. 21
// para. 2 no. 19 lit. e), so a tariff's "zzgl. MWST" does not reach it.
//
// FX: a listing in a currency the account holds (deposits.mjs; when the
// folder has no entry yet, the broker file's `deposits` list) stays
// unconverted and the markup is a remark; any other currency converts both
// ways at the broker's `fx` rate, and an unpublished rate (`fx: null`)
// makes the total N/A.
//
// Every amount is worked in CHF (the tariffs' bands, minimums and the SIX
// fees are CHF; a USD/EUR/GBP line is taken at the fx.mjs rate) and turned
// into dollars at the end.
//
//   node brokers/migros/sixCost.mjs          (self-test on a dummy tariff)
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

export const SIX_CHARGES = "https://www.ser-ag.com/dam/downloads/regulation/trading/directives/loc-tr-en.pdf";
export const SIX_PROMO_SHARES =
  "https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/fee-promotion-retail-flow-en.pdf";
export const SIX_PROMO_SPONSORED =
  "https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/sponsored-foreign-shares-retail-flow-fee-promotion-en.pdf";
export const STAMP_LAW = "https://www.fedlex.admin.ch/eli/cc/1974/11_11_11/de";
export const STAMP_CH = 0.00075;
export const STAMP_FOREIGN = 0.0015;
export const MIC = "XSWX";

// Retail-order rates per execution (CHF), List of Charges 1 July 2026.
export const SIX_FEES = {
  swiss: { annex: "A/B", label: "actions suisses (Blue Chip, Mid-/Small-Cap)", fix: 1.0, floor: 0.5, bp: 0.65, cap: null, freeUntil: "2027-06-30", promo: SIX_PROMO_SHARES },
  sparks: { annex: "C", label: "Sparks", fix: 1.0, floor: 0.5, bp: 0.55, cap: null },
  gdr: { annex: "D", label: "GDR", fix: 1.0, floor: 0.5, bp: 0.55, cap: null },
  secondary: { annex: "E", label: "cotation secondaire", fix: 1.0, floor: 0.5, bp: 0.65, cap: null },
  sponsored: { annex: "F", label: "Sponsored Foreign Shares", fix: 1.0, floor: 1.0, bp: 1.0, cap: null, freeUntil: "2026-11-30", promo: SIX_PROMO_SPONSORED },
  fund: { annex: "J", label: "fonds de placement cotés", fix: 1.5, floor: 0.5, bp: 1.5, cap: 150 },
  etp: { annex: "K", label: "ETF et ETP", fix: 1.5, floor: 0.5, bp: 1.5, cap: 150 },
  sponsoredFund: { annex: "L", label: "Sponsored Funds", fix: 1.5, floor: 1.5, bp: 7.0, cap: 250 },
};

// Foreign ISINs in SIX's EQ/FS lines whose primary listing is SIX (they
// trade in the Mid-/Small-Cap segment, not as secondary listings):
// ams-OSRAM, Bajaj Mobility, EPH, SHL Telemedicine, Newron, lastminute.com,
// Cosmo, WISeKey. Abbott, Saint-Gobain, Scor, NIBE, Lilly, PepsiCo, Philip
// Morris, 3M, Zimmer Biomet and Goodyear are secondary listings (Annex E).
export const PRIMARY_ABROAD = new Set([
  "AT0000A3EPA4", "AT0000KTMI02", "CY0109992111", "IL0010855885", "IT0004147952",
  "NL0010733960", "NL0011832936", "VGG9724F1053",
]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
export const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
export const joinRemarks = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
/** 0.0075 -> "0,75" (French basis text). */
export const pctFr = (rate) => `${Number((rate * 100).toFixed(4))}`.replace(".", ",");
/** 0.0075 -> "0.75%" (English remarks). */
export const pct = (rate) => `${Number((rate * 100).toFixed(4))}%`;

/** `amount` of `from` in `to`, through the fx.mjs dollar rates. */
export function convert(amount, from, to = "CHF") {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

/** Swiss stamp rate a side for an ISIN. */
export function stampOf(isin) {
  return /^(CH|LI)/.test(code(isin)) ? STAMP_CH : STAMP_FOREIGN;
}

/** SIX fee segment of a catalogue row (see the header). */
export function sixSegment(row) {
  const type = code(row?.type);
  const raw = String(row?.raw || "");
  const isin = code(row?.isin);
  if (type === "ETF" || type === "ETN" || type === "ETC") return "etp";
  if (type === "FUND") return /real estate|immobili/i.test(raw) ? "fund" : "sponsoredFund";
  if (/SIX Sponsored Segment|Sponsored Foreign Shares/i.test(raw)) return "sponsored";
  if (/Standard Sparks/i.test(raw)) return "sparks";
  if (/Depository Receipts/i.test(raw)) return "gdr";
  if (/^(CH|LI)/.test(isin) || PRIMARY_ABROAD.has(isin)) return "swiss";
  return "secondary";
}

/**
 * SIX fee for one execution of `amountChf`, retail market order.
 * { chf, segment, annex, free, text }
 */
export function sixFeeChf(row, amountChf, { on = new Date() } = {}) {
  const segment = sixSegment(row);
  const f = SIX_FEES[segment];
  const day = (on instanceof Date ? on : new Date(on)).toISOString().slice(0, 10);
  if (f.freeUntil && day <= f.freeUntil) {
    return { chf: 0, segment, annex: f.annex, free: true, text: `frais SIX offerts (${f.label}, promotion «retail flow» jusqu'au ${f.freeUntil})` };
  }
  if (!(amountChf > 0)) return { chf: null, segment, annex: f.annex, free: false, text: "" };
  let adValorem = Math.max(f.floor, (amountChf * f.bp) / 1e4);
  if (f.cap != null) adValorem = Math.min(adValorem, f.cap);
  const chf = f.fix + adValorem;
  const text =
    `frais SIX annexe ${f.annex} (${f.label}) : CHF ${pctFr(f.fix / 100)} + max(CHF ${pctFr(f.floor / 100)} ; ${pctFr(f.bp / 100)} pb)` +
    (f.cap != null ? `, plafond CHF ${f.cap}` : "") +
    ` = CHF ${Number(chf.toFixed(2))} par sens`;
  return { chf, segment, annex: f.annex, free: false, text };
}

// ---- tariff shapes the bank files use -------------------------------

/** Flat fee of the band the amount falls in. bands: [{ upTo, chf }] (upTo inclusive). */
export function bandFlat(bands, amountChf) {
  const band = bands.find((b) => amountChf <= b.upTo);
  return band ? band.chf : null;
}

/** Rate of the band the amount falls in, on the whole amount, with a floor. bands: [{ upTo, rate }]. */
export function bandRate(bands, amountChf, min = 0) {
  const band = bands.find((b) => amountChf <= b.upTo);
  return band ? Math.max(min, amountChf * band.rate) : null;
}

/**
 * Progressive slices ("für die nächsten CHF ...", "kumuliert"): each rate on
 * its slice only. bands: [{ upTo, rate }] with increasing upTo, last Infinity.
 */
export function sliced(bands, amountChf, min = 0) {
  let fee = 0;
  let from = 0;
  for (const band of bands) {
    if (amountChf <= from) break;
    fee += (Math.min(amountChf, band.upTo) - from) * band.rate;
    from = band.upTo;
  }
  return Math.max(min, fee);
}

// ---- engine ---------------------------------------------------------

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * cfg = {
 *   folder, brand, catalogue (URL), page, readOn,
 *   deposits: ["CHF", ...]   used only while deposits.mjs has no entry for the folder,
 *   fx: { rate: 0.0075 | (amountChf) => rate, basis: "…", label?: "0.75" } | null (unpublished),
 *   exchangeFees: true       false when the tariff says its prices include the exchange fees,
 *   onlineBuy: true, remark: "", sources: {},
 *   commission(ctx) => { chf, basis, confidence?, remark?, rate?, min? }   (one side, CHF; chf null = unknown)
 *   plans?: { id: { id, name, remark, commission, fx?, deposits? } }, defaultPlan?,
 * }
 * ctx = { side: "buy"|"sell", amountChf, notional, n, price, row, listing, segment, plan }
 */
export function makeRoundTrip(cfg) {
  const catalogue = fs.existsSync(cfg.catalogue) ? JSON.parse(fs.readFileSync(cfg.catalogue, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);
  const plans = cfg.plans || { default: { id: null, name: "", remark: "", commission: cfg.commission } };
  const defaultPlan = cfg.plans ? cfg.defaultPlan : "default";

  return function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null, on = new Date() }) {
    const chosen = plans[String(plan || defaultPlan)] || plans[defaultPlan];
    const fx = chosen.fx !== undefined ? chosen.fx : cfg.fx ?? null;
    const fallback = chosen.deposits || cfg.deposits || ["CHF"];
    const listed = ["CHF", "EUR", "USD", "GBP"].some((c) => depositHas(cfg.folder, chosen.id, c));
    const held = (ccy) => (listed ? depositHas(cfg.folder, chosen.id, ccy) : fallback.includes(ccy));
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: cfg.onlineBuy ?? true,
      cashCurrency: "",
      url: cfg.page,
      remark: "",
      ...(chosen.id ? { plan: chosen.id } : {}),
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${cfg.brand} n'existe pas encore : lancer \`node brokers/${cfg.folder}/${cfg.folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing(rows, { etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${cfg.brand}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${cfg.brand}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
      };
    }

    const m = matches[0];
    const mic = m.venue?.mic ?? (code(m.row.mic) || null);
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: cfg.folder,
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
    const ccy = listing.currency;
    const cash = listingCash(ccy);
    const kept = held(cash);
    const stamp = stampOf(listing.isin);
    const segment = sixSegment(m.row);
    const marketBp = bp ?? book.leaf?.bp ?? null;
    const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
    const shared = {
      ...answer,
      listing,
      cashCurrency: kept ? cash : "CHF",
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(ccy) },
      fxIfConverted: fx && typeof fx.rate === "number" ? fx.rate * 2 : null,
      bp: marketBp,
      perShare: marketPerShare,
    };
    if (listing.mic !== MIC) return { ...shared, why: `${listing.exchange} n'est pas une place tarifée chez ${cfg.brand}` };

    const n = Number(shares);
    const p = Number(price);
    const baseRemark = joinRemarks(m.row.remark, cfg.remark, chosen.remark);
    if (!(n > 0)) return { ...shared, remark: baseRemark, why: "aucun nombre de parts" };
    if (!(p > 0)) return { ...shared, remark: baseRemark, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

    const notional = n * p;
    const notionalUsd = dollars(notional, ccy);
    const amountChf = convert(notional, ccy, "CHF");
    const ctx = { amountChf, notional, n, price: p, row: m.row, listing, segment, plan: chosen };
    const buy = amountChf == null ? null : chosen.commission({ ...ctx, side: "buy" });
    const sell = amountChf == null ? null : chosen.commission({ ...ctx, side: "sell" });
    const commissionChf = buy?.chf == null || sell?.chf == null ? null : buy.chf + sell.chf;

    const fxRate = fx ? (typeof fx.rate === "function" ? (amountChf == null ? null : fx.rate(amountChf)) : fx.rate) : null;
    const fxChf = kept ? 0 : fxRate == null || amountChf == null ? null : amountChf * fxRate * 2;

    const six = cfg.exchangeFees === false ? { chf: 0, free: false, text: "frais de bourse compris dans le tarif" } : sixFeeChf(m.row, amountChf, { on });
    const sixChf = six.chf == null ? null : six.chf * 2;

    const commissionUsd = commissionChf == null ? null : dollars(commissionChf, "CHF");
    const fxUsd = fxChf == null ? null : dollars(fxChf, "CHF");
    const brokerFees = plus(commissionUsd, fxUsd);
    const sixUsd = sixChf == null ? null : dollars(sixChf, "CHF");
    const stampUsd = notionalUsd == null ? null : notionalUsd * stamp * 2;
    const tax = listing.isin ? taxesOf(listing.isin) : null;
    const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
    const gap = taxGap(listing.isin, listing.type, listing.mic);
    const mapTaxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;
    const taxUsd = plus(stampUsd, sixUsd, mapTaxUsd);

    const parts = bookParts({
      bp: marketBp,
      perShare: marketPerShare,
      venue: m.venue,
      unsourced: m.unsourced,
      toUsd: (amount) => dollars(amount, ccy),
    });
    const bookUsd = parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
    const usd = plus(bookUsd, brokerFees, taxUsd);
    const unknown = [
      notionalUsd == null || amountChf == null ? `aucun cours en dollars pour ${ccy} ou CHF dans fx.mjs` : null,
      bookUsd == null && notionalUsd != null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
      amountChf != null && commissionChf == null ? `courtage ${cfg.brand} inconnu pour ce montant` : null,
      !kept && fxRate == null ? `${cash} n'est pas une devise de compte ${cfg.brand} et le change n'est pas publié` : null,
      gap,
    ].filter(Boolean);

    const remarks = [baseRemark, buy?.remark, sell?.remark !== buy?.remark ? sell?.remark : ""];
    if (kept && fx && cash !== "CHF") remarks.push(fxRemark(fx.label ?? (typeof fx.rate === "number" ? (100 * fx.rate).toFixed(2) : ""), ccy));

    return {
      ...shared,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
      remark: joinRemarks(...remarks),
      basis:
        `${cfg.brand}, tarif relu le ${cfg.readOn} : ${buy?.basis || ""}` +
        ` Droit de timbre fédéral ${pctFr(stamp)} % par sens (${stamp === STAMP_CH ? "titre suisse" : "titre étranger"}) ; ${six.text}.` +
        (!kept && fx ? ` Change ${fx.basis || ""}, dans les deux sens.` : ""),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: ccy, amountChf: finite(amountChf, 6) },
      commission: {
        ...(chosen.name ? { plan: chosen.name } : {}),
        buy: finite(buy?.chf, 6),
        sell: finite(sell?.chf, 6),
        currency: "CHF",
        rate: buy?.rate ?? null,
        min: buy?.min ?? null,
        stamp,
        sixSegment: segment,
        sixEach: finite(six.chf, 6),
      },
      parts: {
        marché: finite(bookUsd, 6),
        courtage: finite(commissionUsd, 6),
        change: finite(fxUsd, 6),
        taxes: finite(taxUsd, 6),
        timbre: finite(stampUsd, 6),
        fraisSix: finite(sixUsd, 6),
      },
      confidence: [
        buy?.confidence,
        kept ? `ligne en ${cash}, devise du compte : change en remarque` : fx ? `ligne en ${cash}, hors des devises du compte : change dans les deux sens` : null,
        six.free ? "frais SIX nuls pendant la promotion «retail flow» : ordre au marché d'un client privé" : "frais SIX de la liste officielle, répercutés tels quels (le tarif dit «Börsengebühren werden weiterverrechnet» sans taux)",
        taxPct ? `taxe à l'achat ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune autre taxe dans taxMap.mjs pour cet ISIN",
      ]
        .filter(Boolean)
        .join(" ; "),
      sources: { fees: cfg.page, six: SIX_CHARGES, ...(six.free ? { sixPromo: SIX_FEES[segment].promo } : {}), stamp: STAMP_LAW, ...(cfg.sources || {}) },
    };
  };
}

/** The CLI every cost file shares. */
export function cli(metaUrl, roundTrip) {
  let called = false;
  try {
    called = metaUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  const on = arg("on", null);
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        plan: arg("plan", null),
        ...(on ? { on: new Date(on) } : {}),
      }),
      null,
      2
    )
  );
}

// Self-test: the SIX fee table and the tariff shapes, then a dummy bank
// (CHF 40 flat, CHF and EUR held, FX 1 %) on three Migros rows.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const assert = (ok, what) => {
    if (!ok) throw new Error(`self-test failed: ${what}`);
  };
  const oct = new Date("2026-10-26");
  const dec = new Date("2026-12-15");
  const aug27 = new Date("2027-08-01");
  const nesn = { type: "STOCK", isin: "CH0038863350", raw: "SIX | NESN | NESTLE N | CHF | CH0038863350 | Registered Share | International Reporting Standard |  | last trade 20261023" };
  const abt = { type: "STOCK", isin: "US0028241000", raw: "SIX | ABT | ABBOTT | CHF | US0028241000 | Registered Share | International Reporting Standard" };
  const ams = { type: "STOCK", isin: "AT0000A3EPA4", raw: "SIX | AMS | AMS-OSRAM | CHF | AT0000A3EPA4 | Registered Share | International Reporting Standard" };
  const tsla = { type: "STOCK", isin: "US88160R1014", raw: "SIX | TSLA | Tesla | CHF | US88160R1014 | Sponsored Foreign Shares | SIX Sponsored Segment" };
  const alpn = { type: "STOCK", isin: "CH0019199550", raw: "SIX | ALPN | ALPINE SELECT | CHF | CH0019199550 | Registered Share | Standard Sparks" };
  const etf = { type: "ETF", isin: "IE00B5BMR087", raw: "SIX | CSSPX | ..." };
  assert(sixSegment(nesn) === "swiss" && sixSegment(abt) === "secondary" && sixSegment(ams) === "swiss", "segments");
  assert(sixSegment(tsla) === "sponsored" && sixSegment(alpn) === "sparks" && sixSegment(etf) === "etp", "segments 2");
  assert(sixFeeChf(nesn, 1000, { on: oct }).chf === 0, "NESN promo");
  assert(near(sixFeeChf(nesn, 1000, { on: aug27 }).chf, 1.5), "NESN after promo: 1 + max(0.5, 0.065)");
  assert(near(sixFeeChf(nesn, 100000, { on: aug27 }).chf, 1 + 6.5), "NESN 100k after promo");
  assert(near(sixFeeChf(abt, 1000, { on: oct }).chf, 1.5), "ABT secondary");
  assert(sixFeeChf(tsla, 1000, { on: oct }).chf === 0 && near(sixFeeChf(tsla, 1000, { on: dec }).chf, 2), "sponsored promo / after");
  assert(near(sixFeeChf(alpn, 20000, { on: oct }).chf, 1 + 1.1), "Sparks 20k");
  assert(near(sixFeeChf(etf, 1000, { on: oct }).chf, 2) && near(sixFeeChf(etf, 2e6, { on: oct }).chf, 1.5 + 150), "ETF floor / cap");
  assert(bandFlat([{ upTo: 5000, chf: 30 }, { upTo: Infinity, chf: 60 }], 5000) === 30, "bandFlat");
  assert(near(bandRate([{ upTo: 50000, rate: 0.011 }, { upTo: Infinity, rate: 0.009 }], 1000, 40), 40), "bandRate min");
  assert(near(sliced([{ upTo: 50000, rate: 0.011 }, { upTo: 100000, rate: 0.008 }, { upTo: Infinity, rate: 0.006 }], 120000), 550 + 400 + 120), "sliced");
  assert(stampOf("CH0038863350") === STAMP_CH && stampOf("LI0315487269") === STAMP_CH && stampOf("IE00B5BMR087") === STAMP_FOREIGN, "stamp");

  const dummy = makeRoundTrip({
    folder: "sixcost-selftest",
    brand: "Test",
    catalogue: new URL("migros-parsed.json", import.meta.url),
    page: "https://example.invalid/",
    readOn: "2026-10-26",
    deposits: ["CHF", "EUR"],
    fx: { rate: 0.01, basis: "1 % (test)" },
    commission: () => ({ chf: 40, basis: "CHF 40 par ordre (test)." }),
  });
  for (const [t, c, n, p] of [["NESN", "CHF", 12, 80], ["CSSPX", "USD", 2, 650], ["ABT", "CHF", 10, 100]]) {
    const r = dummy({ etf: t, place: "XSWX", currency: c, shares: n, price: p, on: oct });
    console.log(t, c, n, "x", p, "->", r.usd, "USD", JSON.stringify(r.parts), r.remark || "", r.why || "");
    assert(r.usd != null, `${t} total`);
  }
  console.log("sixCost self-test ok");
}
