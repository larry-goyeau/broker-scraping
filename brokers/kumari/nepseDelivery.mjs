// Cash round trip on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS): buy n shares, sell them straight back, in
// dollars. Shared by the brokers on the Siprabi site template (Kumari,
// Premier, Malla & Malla, Arya Tara); each broker file passes the equity
// tab of its own "Charges" table. Same sums as brokers/siprabi/siprabi_cost.mjs.
//
// The band is read on the whole value of each transaction (each buy, each
// sell), which then pays that one rate. No minimum is printed for equity
// (the Rs 10 floor on the page is for bonds and funds only). The SEBON fee
// and the flat DP charge are paid on each side: the table prints them under
// the brokerage fee of every transaction, and the broker's own Buy/Sell
// calculator adds "DP Charge (Flat Rate) 25" to both the buy and the sell.
// Capital gains tax is on the gain, not the trade, and is not counted.
// Every NEPSE line is quoted in rupees and the account settles in rupees,
// so nothing is converted.
//
// brokerFees is brokerage plus the DP charge on both sides, the SEBON fee
// is in taxes, as in siprabi. The book is read from spreads/; a missing
// book stays missing.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CASH = "NPR";

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// French percent, "0,36 %".
export function frPct(rate) {
  const v = Math.round(rate * 100 * 10000) / 10000;
  return `${String(v).replace(".", ",")} %`;
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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
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

// schedule: { broker, folder, catalogueUrl, url, readOn, bands: [{ upTo,
// rate }] (inclusive upper bound in rupees, last one Infinity), sebon, dp,
// remark }.
export function nepseRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: schedule.url,
    remark: schedule.remark || "",
  };
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
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const steps = schedule.bands
    .map((b) => (b.upTo === Infinity ? `${frPct(b.rate)} au-delà` : `${frPct(b.rate)} jusqu'à ${b.upTo.toLocaleString("fr-FR")} NPR`))
    .join(", ");
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `ordre en ligne par TMS, barème actions ${schedule.broker} relu le ${schedule.readOn}. ` +
      `Courtage ${steps}, chaque sens ; frais SEBON ${frPct(schedule.sebon)} et frais DP ${schedule.dp} NPR, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${schedule.broker} ne publie un barème que pour la bourse du Népal en roupies ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const band = schedule.bands.find((b) => notional <= b.upTo);
  const commissionNpr = notional * band.rate * 2;
  const dpNpr = schedule.dp * 2;
  const sebonNpr = notional * schedule.sebon * 2;
  const brokerFees = dollars(commissionNpr + dpNpr, listing.currency);
  const sebon = dollars(sebonNpr, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, sebon);
  const why = [
    notionalUsd == null ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs` : null,
    parts.a == null || parts.b == null
      ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
  ]
    .filter(Boolean)
    .join(" ; ");
  const confidence = [
    shared.basis,
    `tranche ${frPct(band.rate)} pour ${Math.round(notional)} NPR, appliquée au montant entier (bornes supérieures incluses)`,
    "aucun minimum publié pour les actions (le plancher de 10 NPR de la page vaut pour les obligations et les fonds)",
    "impôt sur la plus-value non compté : aller-retour au même prix, aucun gain",
    "ligne NPR, compte en roupies : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} NPR par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(notional * band.rate, 8),
      sell: finite(notional * band.rate, 8),
      rate: band.rate,
      sebon: schedule.sebon,
      dpPerSide: schedule.dp,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(sebon, 6),
      courtageNpr: finite(commissionNpr + dpNpr, 6),
      taxesNpr: finite(sebonNpr, 6),
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}
