// What one round trip costs at Aktia Bank (Aktia Pankki Oyj, Finland): buy
// n shares at price p in the netbank (verkkopankki) or the mobile bank,
// sell them straight back, in dollars. The account is a euro bank account
// with a book-entry account (arvo-osuustili). Orders taken at a branch or
// by an employee (1 %, min 25 €) are another ticket and are not this one.
//
// Price list "Hinnasto Arvopaperipalvelut", 1.9.2024, read on 2026-10-26:
//   https://misc.aktia.fi/data-service/documents/investment/Hinnastot/Arvopaperipalvelut/Hinnasto_Arvopaperipalvelut.pdf
// - "Verkkopankin toimeksiantotoiminnot / Helsingin Pörssissä noteeratut
//   osakkeet ja merkintä-oikeudet": "palkkio kauppahinnasta, per
//   toteutunut toimeksianto 0,25 %", "sekä tapahtumamaksu 10,00 €",
//   "Minimipalkkio per toimeksianto: ei minimipalkkiota".
// - Custody, domestic securities: "Arvo-osuustili/kk 3,00 €" (the
//   remark; the trip itself carries no custody).
// The catalogue's one ETF (Seligson OMX Helsinki 25) trades on the same
// Helsinki order book and takes the same netbank line; the price list has
// no other line for exchange-traded units.
//
// Formula, each way: 0.25 % × amount + 10 €. Round trip = 2 × that, plus
// the Helsinki book (spreads/book.mjs, venue XHEL).
//
// FX: every catalogue line trades in EUR, the account currency (deposits:
// EUR only), so nothing converts. A non-EUR line would have no published
// conversion rate and is N/A.
// Taxes: Finland charges no transfer tax on exchange trades in listed
// shares (taxMap.mjs answers for the ISIN). The price list prints its
// prices with any VAT included, so the fee is taken as printed.
// Left out: the branch tariff, the 30 € registration fee for a sale from
// an account pledged to a third party, the 165 € handling fee for a late
// payment or a failed delivery, and the 0.15 % custody of foreign
// securities (no foreign line in the catalogue).
//
//   node brokers/aktia/aktia_cost.mjs NOKIA XHEL EUR --shares=200 --price=4.6
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "aktia";
const LABEL = "Aktia";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE = "https://misc.aktia.fi/data-service/documents/investment/Hinnastot/Arvopaperipalvelut/Hinnasto_Arvopaperipalvelut.pdf";
const READ_ON = "2026-10-26";
const CASH = "EUR";
// Until deposits.mjs has an entry for this folder.
const DEPOSITS = ["EUR"];
const RATE = 0.0025;
const TICKET = 10;
const REMARK = "Custody is 3 € a month.";

const SCHEDULE = {
  XHEL: { name: "Helsingin Pörssi (verkkopankki)", ccy: "EUR", rate: RATE, ticket: TICKET },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const held = (currency) => {
  const ccy = listingCash(currency);
  return DEPOSITS.includes(ccy) || depositHas(FOLDER, null, ccy);
};

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
    return { ...answer, why: `le catalogue ${LABEL} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${LABEL}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${LABEL}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? code(m.row.mic) ?? null;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
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
  const market = SCHEDULE[code(mic)];
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    cashCurrency: held(listing.currency) ? listingCash(listing.currency) : CASH,
    listing,
    basis: `${LABEL}, Hinnasto Arvopaperipalvelut 1.9.2024 relu le ${READ_ON}. Verkkopankki : 0,25 % + 10 € par ordre exécuté, sans minimum, ${market?.name || "marché inconnu"}.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!market) return { ...shared, why: `pas de courtage publié pour ${listing.exchange}` };
  if (!held(listing.currency) || code(listing.currency) !== market.ccy) {
    return { ...shared, why: `pas de taux de change publié par ${LABEL} pour ${listing.currency}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * market.rate + market.ticket;
  const commissionUsd = dollars(each * 2, market.ccy);
  const brokerFees = commissionUsd;

  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    notionalUsd == null || commissionUsd == null ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs` : null,
    bookUsd == null && notionalUsd != null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      each: finite(each, 6),
      eachWay: true,
      currency: market.ccy,
      rate: market.rate,
      ticket: market.ticket,
      min: null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      "pas de change : la ligne cote en euros, la monnaie du compte",
      taxPct ? `taxe à l'achat ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
    ].join(" ; "),
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
