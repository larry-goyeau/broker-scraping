// What one round trip costs at Zaman (ZAO «Заман», Bishkek): buy n shares
// on the Kyrgyz Stock Exchange (KSE) or the FBK-BTS exchange through
// Zaman's web application and sell them straight back, in dollars.
//
// "Тарифы за услуги ЗАО «Заман» по совершению сделок с финансовыми
// инструментами на фондовых биржах" (Annex 2, approved 11 September 2026),
// read on 2026-10-23. Trading operations, % of the transaction amount, each
// trade (so each side), with a floor per band:
//   up to KGS 500,000                  1.5 %   not less than KGS 200
//   KGS 500,001 - 1,000,000            1.4 %   (no floor printed)
//   KGS 1 million - 10 million         0.9 %   not less than KGS 14,000
//   KGS 10 million - 50 million        0.5 %   not less than KGS 90,000
//   over KGS 50 million                negotiable, not less than KGS 250,000
// Note 1: the fees "include the services of the broker, the FBK-BTS CJSC
// stock exchange, the depository, and the registrar", so an FBK-BTS trade
// pays the band and nothing else. Note 2: on the Kyrgyz Stock Exchange "the
// fees of Kyrgyz Stock Exchange CJSC and Central Depository CJSC shall be
// added", and neither is printed, so a KSE total is N/A (the commission is
// still given). Orders go "Voice / paper instruction / web application":
// the web application is online.
// Currency: every line is in som; the account holds som and dollars
// (deposits.mjs), and "Currency conversion (USD/KGS) 0.1%" is in the remark.
// Custody: KGS 100 a quarter plus the depository's fee, not this trip.
//   https://zamaninvest.kg/assets/docs/pravovaya/tarify-i-komissii.pdf
//
// Neither exchange has a public book (spreads/venues.mjs), and fx.mjs
// carries no som rate, so the dollar total is N/A for now; the som amounts
// are in `parts`.
//
//   node brokers/zaman/zaman_cost.mjs ABUKI "FBK-BTS Stock Exchange" KGS --shares=1 --price=445200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("zaman-parsed.json", import.meta.url);
const PAGE = "https://zamaninvest.kg/assets/docs/pravovaya/tarify-i-komissii.pdf";
const READ_ON = "2026-10-23";
// Bands on the transaction amount, KGS, upper bound inclusive. Above the
// last one the rate is negotiable.
const BANDS = [
  { upTo: 500_000, rate: 0.015, min: 200 },
  { upTo: 1_000_000, rate: 0.014, min: 0 },
  { upTo: 10_000_000, rate: 0.009, min: 14_000 },
  { upTo: 50_000_000, rate: 0.005, min: 90_000 },
];
const CONVERSION = 0.001;
const CASH = "KGS";
const REMARK = fxRemark((100 * CONVERSION).toFixed(2), CASH);
const KSE = "XKSE";

// One side, in som; null above the printed bands.
export function side(notional) {
  const band = BANDS.find((b) => notional <= b.upTo);
  return band ? Math.max(band.min, notional * band.rate) : null;
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  // FBK-BTS has no MIC and no venue: it is matched on the exchange name.
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

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Zaman n'existe pas encore : lancer `node brokers/zaman/zaman_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Zaman` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Zaman`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "zaman",
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
  const kse = listing.mic === KSE || code(m.row.mic) === KSE;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    basis:
      `tarifs Zaman (annexe 2, 11 septembre 2026) relus le ${READ_ON} : 1,5 % par opération jusqu'à 500 000 KGS, minimum 200 KGS, ` +
      `puis 1,4 %, 0,9 %, 0,5 % par tranche de montant, chaque sens ; ` +
      (kse ? "Bourse kirghize : frais de la bourse et du dépositaire central en sus, non imprimés" : "FBK-BTS : bourse, dépositaire et registraire compris"),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Zaman ne publie un barème que pour des lignes en som ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = side(notional);
  const commissionKgs = one == null ? null : one * 2;
  const brokerFees = commissionKgs == null ? null : dollars(commissionKgs, listing.currency);
  // KSE adds the exchange's and the Central Depository's fees, not printed.
  const levies = kse ? null : 0;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);
  const why =
    usd != null
      ? null
      : commissionKgs == null
        ? `au-delà de 50 millions de som la commission est négociée`
        : notionalUsd == null
          ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
          : kse
            ? "Bourse kirghize : les frais de la bourse et du dépositaire central s'ajoutent sans être imprimés"
            : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { bands: BANDS, side: one, currency: CASH, eachWay: true, exchangeFeesIncluded: !kse },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
      courtageKgs: finite(commissionKgs, 6),
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
