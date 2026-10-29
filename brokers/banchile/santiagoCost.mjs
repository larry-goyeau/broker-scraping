// Cash round trip on the Bolsa de Comercio de Santiago (BCS, XSGO) at a
// Chilean corredora: buy n shares at price p, sell them back on another
// day, in dollars. Shared by the corredoras whose catalogue is
// ./santiagoBook.mjs (Banchile, BancoEstado, Bci, MBI, Santander, Vector).
// ../ccbolsa/ccbolsa_cost.mjs keeps its own copy of the same sums.
//
// What a Santiago trip is made of (each broker prints its own mix):
//   commission    the broker's rate on the order, with a floor at some
//   per day       a fixed charge for each day with executed operations
//                 (BancoEstado $2.500, Bci $7.000). The buy and the sale
//                 fall on two days, so the trip pays it twice; selling the
//                 same day pays it once, which is the remark.
//   IVA           19% on all of the above (Ley 825, art. 14).
//   Chile has no stamp or transaction tax on shares. The exchange's
//   "derechos de bolsa" are counted in the commission, as the brokers that
//   name them say (CCBolsa "incluye el derecho de bolsa", BancoEstado and
//   Bci "no se cobran"); none of the others prints a separate rate.
//
// A dollar line of the exchange's foreign-securities market pays the same
// rates on its peso value. When the broker holds pesos only (deposits.mjs)
// the order is converted at a rate no broker prints, so the total stays
// unknown; the fees are still given.
//
// US lines (MBI, Vector): neither prints a US tariff. The owner's stand-in
// (2026-10-29, as for the Argentine brokers with no US tariff): the
// broker's own Santiago rate + IVA on the peso value of each order, plus
// the US regulators' fees its US partner passes on (`us` in the schedule).
// The sums are ../wellstrade/usCost.mjs's.
//
// The Bolsa de Santiago has no book leaf yet, so the total stays unknown
// until one exists.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";

export const IVA = 0.19;
// Unidad de fomento on the fx.mjs date (2026-09-07), in pesos.
//   https://mindicador.cl/api/uf/07-09-2026
export const UF_CLP = 40883;
export const UF_AS_OF = "2026-09-07";

const SANTIAGO = new Set(["BCS", "XSGO", "SANTIAGO", "BOLSADESANTIAGO", "SANTIAGOSTOCKEXCHANGE"]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const pesos = (n) => `${Math.round(n).toLocaleString("es-CL")} pesos`;

// "23%" from 23.4, "4.5%" from 4.53.
export function pctLabel(x) {
  return `${x >= 10 ? Math.round(x) : Number(x.toFixed(1))}%`;
}

// The cut a same-day sale gets: one daily charge instead of two.
export function sameDayRemark({ side, perDay }) {
  if (!perDay) return "";
  return `Same day sell fees are ${pctLabel((perDay * 100) / (2 * side + 2 * perDay))} lower.`;
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
  const wantVenue = place && !SANTIAGO.has(wantPlace) ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (SANTIAGO.has(wantPlace)) return SANTIAGO.has(loose(m.row.exchange)) || m.venue?.mic === "XSGO";
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// schedule: {
//   broker, folder, catalogueUrl, url, readOn,
//   side(clp)        pesos for one order of `clp`, before IVA
//   perDay?          pesos before IVA for each day with operations
//   basis            French: channel and figures, "ordre en ligne, 0,6 % ..."
//   remark?          (ctx) => string, ctx { side, perDay, clp } in pesos
//                    with IVA; the FX sentence is added here
//   usWhy?           French reason a US line has no fees
//   us?              US-line stand-in: { rule606, levies (usCost.mjs),
//                    basis (French), notes? }
// }
export function santiagoRoundTrip(s, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "CLP",
    url: s.url,
    remark: "",
  };
  const rows = loadRows(s.catalogueUrl);
  if (!rows) {
    return { ...answer, why: `le catalogue ${s.broker} n'existe pas encore : lancer \`node brokers/${s.folder}/${s.folder}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${s.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${s.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: s.folder,
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
  const santiago = SANTIAGO.has(loose(m.row.exchange)) || listing.mic === "XSGO";
  const held = depositHas(s.folder, null, listing.currency);
  // Two cash currencies: "FX when cash ≠ CCY." on every line it can hold.
  const multi = depositHas(s.folder, null, "USD") && depositHas(s.folder, null, "CLP");
  const fxNote = multi && held ? fxRemark("", listing.currency) : "";
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    basis: `${s.basis}, barème relu le ${s.readOn}`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
    remark: fxNote,
  };
  if (!santiago) {
    if (s.us) return usRoundTrip(usSchedule(s, fxNote), query);
    return { ...shared, why: s.usWhy || `${s.broker} ne publie aucun tarif pour ${listing.exchange}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const clp = listing.currency === "CLP" ? notional : notionalUsd / usdPer("CLP");
  const side = s.side(clp) * (1 + IVA);
  const perDay = (s.perDay || 0) * (1 + IVA);
  const ticketClp = 2 * side + 2 * perDay;
  const brokerFees = dollars(ticketClp, "CLP");
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const forced = !held;
  const usd = forced ? null : plus(bookUsd, brokerFees);
  const remark = [typeof s.remark === "function" ? s.remark({ side, perDay, clp }) : s.remark || "", fxNote]
    .filter(Boolean)
    .join("\n");
  const why = forced
    ? `${s.broker} ne tient que des pesos : la ligne en ${listing.currency} est convertie à un cours non publié`
    : bookUsd == null
      ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null;

  return {
    ...shared,
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { side: Math.round(side), perDay: Math.round(perDay), iva: IVA, currency: "CLP" },
    confidence: [
      shared.basis,
      `${pesos(side)} par ordre${perDay ? ` + ${pesos(perDay)} par jour, deux jours` : ""}, IVA compris, sur ${pesos(clp)}`,
    ].join(" ; "),
  };
}

// The usCost.mjs schedule of a US line: each order pays the Santiago rate
// + IVA on its peso value.
function usSchedule(s, fxNote) {
  const u = s.us;
  return {
    broker: s.broker,
    folder: s.folder,
    catalogueUrl: s.catalogueUrl,
    url: s.url,
    readOn: s.readOn,
    rule606: u.rule606,
    cash: "USD",
    levies: u.levies,
    ticket: ({ notionalUsd }) => {
      const clp = notionalUsd / usdPer("CLP");
      const side = toUsd(s.side(clp) * (1 + IVA), "CLP");
      return { buy: side, sell: side, note: `${pesos(s.side(clp) * (1 + IVA))} par ordre, IVA compris, sur ${pesos(clp)}` };
    },
    remark: ({ notionalUsd }) => {
      const clp = notionalUsd == null ? null : notionalUsd / usdPer("CLP");
      const own = typeof s.remark === "function" ? s.remark({ side: clp == null ? null : s.side(clp) * (1 + IVA), perDay: 0, clp }) : s.remark || "";
      return [own, fxNote].filter(Boolean).join("\n");
    },
    basis: `${u.basis}, barème relu le ${s.readOn}`,
    notes: u.notes,
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}
