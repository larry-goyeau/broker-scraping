// What one round trip costs at VFEX Direct, the Victoria Falls Stock
// Exchange's own app: buy n shares, sell them back, in dollars. Online
// order on a VFEX line, in US dollars.
//
// https://ds88jcmqc11je.cloudfront.net/api/notices/19/download
// read on 2026-10-21. "A guide to investing on the Victoria Falls Stock
// Exchange", posted on 20 March 2026. Section 9 prints two tables.
// https://www.policyvault.africa/wp-content/uploads/policy/ZWE135.pdf
// read on 2026-10-21. Statutory Instrument 246 of 2020, the levies, fees
// and charges of the VFEX. It prints the same equity table.
// https://vfexdirect.vfex.exchange/terms-and-conditions
// read on 2026-10-21. Clause 8.10.
//   Shares, ETFs, REITs   each side: dealer commission 0.60%, VAT 14.5% of
//                         it (0.087%), CSD levy 0.04%, VFEX levy 0.15%,
//                         SECZ levy 0.05%, investor protection fund 0.01%.
//                         Stamp duty 0.25% on the buy only. Buy 1.187%,
//                         sell 0.937%. The guide has no separate ETF or
//                         REIT table, so they take the equity one.
//   Depository receipts   each side: dealer commission 0.10%, VAT 0.0145%,
//   (Caledonia, Invictus, SECZ 0.05%, VFEX levy 0.15%, CSD levy 0.04%.
//   Nedbank)              Stamp duty 0.25% on the buy only. Buy 0.6045%,
//                         sell 0.3545%.
//   Sale proceeds         2% administrative fee on the gross sale proceeds,
//                         paid into the VFEX Direct wallet (terms 8.10).
//   Capital gains         no withholding tax on VFEX (guide, section 8).
//   Victoria Falls        no book is published here
// In the total: the book, and every line above. brokerFees is what the
// platform bills: the commission with its VAT and the 2% administrative
// fee. The CSD, VFEX, SECZ and protection-fund levies and the stamp duty
// are in the total but not in brokerFees. No remark: the account holds US
// dollars only and every VFEX line trades in US dollars, so there is no FX.
//
//   node brokers/vfexdirect/vfexdirect_cost.mjs INN.VX VFEX USD --shares=100 --price=0.30
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("vfexdirect-parsed.json", import.meta.url);
const PAGE = "https://ds88jcmqc11je.cloudfront.net/api/notices/19/download";
const READ_ON = "2026-10-21";
const VAT = 0.145;
const ADMIN = 0.02;
// Equities, ETFs and REITs: the guide's table a) and S.I. 246 of 2020.
const SHARE = {
  brokerage: 0.006,
  csd: 0.0004,
  stamp: 0.0025,
  vfex: 0.0015,
  secz: 0.0005,
  protection: 0.0001,
};
// Depository receipts: the guide's table b).
const RECEIPT = {
  brokerage: 0.001,
  csd: 0.0004,
  stamp: 0.0025,
  vfex: 0.0015,
  secz: 0.0005,
  protection: 0,
};
// What the platform bills on one side (commission and its VAT), the
// statutory levies on one side, and the stamp duty on the buy.
const sides = (t) => ({
  commission: t.brokerage * (1 + VAT),
  levies: t.csd + t.vfex + t.secz + t.protection,
  stamp: t.stamp,
});
const SHARE_RATES = sides(SHARE);
const RECEIPT_RATES = sides(RECEIPT);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
// VFEX depository receipts carry a ZWVX301DR ISIN and say so in their name.
const isReceipt = (row) => /^ZWVX\d{3}DR/.test(code(row.isin)) || /DEPOSITORY RECEIPT/.test(code(row.name));

function findListing({ etf, place, currency }) {
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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue VFEX Direct n'existe pas encore : lancer `node brokers/vfexdirect/vfexdirect_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue VFEX Direct` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez VFEX Direct`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "vfexdirect",
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
  const receipt = isReceipt(m.row);
  const rates = receipt ? RECEIPT_RATES : SHARE_RATES;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    basis:
      `ordre en ligne, guide VFEX de l'investisseur relu le ${READ_ON} (publié le 20 mars 2026) et S.I. 246 de 2020. ` +
      (receipt
        ? `Certificat de dépôt : achat 0,6045 % (commission 0,10 %, TVA 0,0145 %, SECZ 0,05 %, prélèvement VFEX 0,15 %, CSD 0,04 %, droit de timbre 0,25 %), vente 0,3545 % (les mêmes sans le droit de timbre). `
        : `Achat 1,187 % (commission 0,60 %, TVA 0,087 %, CSD 0,04 %, droit de timbre 0,25 %, prélèvement VFEX 0,15 %, SECZ 0,05 %, fonds de protection 0,01 %), vente 0,937 % (les mêmes sans le droit de timbre). `) +
      `Plus 2 % de frais administratifs sur le produit brut de la vente (conditions VFEX Direct 8.10). Les frais de la plateforme sont la commission, sa TVA et ces 2 % ; les prélèvements CSD, VFEX, SECZ, le fonds de protection et le droit de timbre sont dans le total seulement. Pas de retenue sur la plus-value à la VFEX.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commissionEach = notional * rates.commission;
  const admin = notional * ADMIN;
  const leviesEach = notional * rates.levies;
  const stamp = notional * rates.stamp;
  const brokerFees = dollars(commissionEach * 2 + admin, listing.currency);
  const levies = dollars(leviesEach * 2, listing.currency);
  const tax = dollars(stamp, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies, tax);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: rates.commission + rates.levies + rates.stamp,
      sell: rates.commission + rates.levies + ADMIN,
      currency: listing.currency,
    },
    market: { levies: leviesEach, stamp, admin, eachWay: true, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levies, 6),
      taxe: finite(tax, 6),
    },
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
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

printCli();
