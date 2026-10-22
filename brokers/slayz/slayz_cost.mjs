// What one round trip costs at Slayz, the app of Dinamik Menkul Değerler
// A.Ş. (Istanbul): buy n shares at price p, sell them back, in dollars.
// Borsa İstanbul shares and exchange-traded funds (BYF) in lira, and US
// shares and ETFs in dollars, all ordered in the app.
//
// Read on 2026-10-21:
//   https://slayz.app/ucretler                 (fee table, Borsa İstanbul and
//                                               Amerikan Borsaları tabs, and
//                                               the footnote under it)
//   https://slayz.app/urunler/borsa-istanbul
//   https://slayz.app/urunler/abd-borsalari
//   https://slayz.app/sss/abd-borsalari
//   https://slayz.app/sss/doviz-al-sat
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//                                              (updated 28.03.2025)
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   Borsa İstanbul commission   0% ("İşlem Ücreti %0"; the product page:
//                  "Borsa İstanbul hisselerinde komisyon oranı %0'dır").
//   Exchange and clearing fees  the fee footnote sends the client to the
//                  current BIST, Takasbank and MKK tariffs. Each side:
//                    BIST borsa payı   0.25 bps of the amount, shares and
//                                      BYF alike (lines A and Ç)
//                    Takasbank         "Milyonda 4" on shares (BYF
//                                      excluded), "Milyonda 1" on BYF
//   BSMV           "Tüm komisyon ve ücretlere ilave olarak %5 oranında BSMV":
//                  5% on every commission and fee, the two levies above and
//                  the US commission below.
//   US commission  $1 an order, whatever the amount or the number of shares
//                  ("her alım-satım işlemi için yalnızca 1$ komisyon"), so
//                  $1.05 a side with BSMV.
//   US SEC fee, FINRA TAF, CAT  not printed, so 0 as in the other files.
//   FX             US shares are bought from the dollar balance only; lira
//                  is changed to dollars inside the app at a spread Slayz
//                  does not print ("anlık piyasa fiyatlarına yakın"). USD is
//                  a deposit currency (deposits.mjs), so the FX stays a
//                  remark without a rate.
//   Custody, account fee, live data, portfolio transfer  free on both tabs.
//                  MKK's own custody line (0.0085% a year in Dinamik's
//                  tariff) is negligible and stays out.
//
// In the total: the book, the commission, the BIST and Takasbank levies,
// BSMV, and any tax taxMap.mjs names. In the remark: FX on US lines.
// Book: Borsa İstanbul through spreads/book.mjs (a name with no leaf is
// N/A); a US exchange listing (Texas included: one NBBO market) uses the
// Rule 606 Q of Slayz's US dealer, but Slayz names none, so the quoted
// NBBO (rule606.mjs falls back by itself). OTC lines have no US 605 tape;
// their book comes from spreadLeaf or stays N/A.
//
//   node brokers/slayz/slayz_cost.mjs THYAO XIST TRY --shares=10 --price=300
//   node brokers/slayz/slayz_cost.mjs GLDTR XIST TRY --shares=1000 --price=40
//   node brokers/slayz/slayz_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/slayz/slayz_cost.mjs SPY ARCX USD --shares=0.5 --price=650
//   node brokers/slayz/slayz_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("slayz-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://slayz.app/ucretler",
  bist: "https://slayz.app/urunler/borsa-istanbul",
  us: "https://slayz.app/urunler/abd-borsalari",
  faq: "https://slayz.app/sss/abd-borsalari",
  fx: "https://slayz.app/sss/doviz-al-sat",
  borsaPayi: "https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf",
  takas: "https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf",
  readOn: "2026-10-21",
  entity: "Dinamik Menkul Değerler A.Ş.",
};

const BIST_RATE = 0;
const BORSA_PAYI = 0.000025;
const TAKAS = { STOCK: 0.000004, ETF: 0.000001 };
const BSMV = 0.05;
const US_TICKET = 1;
const HOME = "TRY";
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM", "TXSE"]);
const US_TAPE = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"]);

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is Slayz's commission
 * with its BSMV.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: HOME,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Slayz n'existe pas encore : lancer `node brokers/slayz/slayz_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Slayz` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Slayz`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "slayz",
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
  const bist = listing.mic === "XIST" && listing.currency === HOME;
  const american = US_MICS.has(listing.mic) && listing.currency === "USD";
  if (!bist && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème Slayz (Borsa İstanbul en lires, actions américaines en dollars)` };
  }

  const cash = listingCash(listing.currency);
  const held = depositHas("slayz", null, cash);
  if (!held) {
    // deposits.mjs holds TRY and USD; another cash would be a forced and
    // unpublished conversion.
    return { ...answer, listing, why: `${cash} n'est pas une devise du compte Slayz et le change n'est pas publié` };
  }

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const etfLine = listing.type === "ETF";
  const takas = etfLine ? TAKAS.ETF : TAKAS.STOCK;

  const marketPerShare =
    perShare ??
    (american && US_TAPE.has(listing.mic)
      ? usBookPerShare({ broker: "slayz", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
      : book.leaf?.perShare ?? null);
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && US_TAPE.has(listing.mic) && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });

  const shared = {
    ...answer,
    listing,
    cashCurrency: cash,
    remark: american ? fxRemark("", listing.currency) : "",
    basis: bist
      ? `barème Slayz relu le ${SCHEDULE.readOn} : Borsa İstanbul 0 % de commission ; borsa payı BIST 0,25 bps et takas payı Takasbank ${etfLine ? "1" : "4"} par million chaque sens, renvoyés aux tarifs BIST et Takasbank par la note du barème ; BSMV 5 % sur toute commission et tout frais`
      : `barème Slayz relu le ${SCHEDULE.readOn} : 1 $ par ordre aux États-Unis quel que soit le montant, BSMV 5 % en sus, soit 1,05 $ chaque sens ; SEC, TAF et CAT non imprimés : 0`,
    tax,
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
  let commission;
  let levies;
  if (bist) {
    commission = notional * BIST_RATE * 2;
    levies = notional * (BORSA_PAYI + takas) * 2;
  } else {
    commission = US_TICKET * 2;
    levies = 0;
  }
  const bsmv = (commission + levies) * BSMV;
  const commissionUsd = dollars(commission * (1 + BSMV), listing.currency);
  const leviesUsd = dollars(levies * (1 + BSMV), listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(leviesUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    bist
      ? "la note du barème renvoie aux tarifs BIST, Takasbank et MKK sans les chiffrer : taux officiels de ces tarifs"
      : US_TAPE.has(listing.mic)
        ? "Slayz ne nomme pas son intermédiaire américain : NBBO coté, pas de Q 606"
        : "ligne OTC hors bande 605 : carnet de spreadLeaf",
    american ? "caisse en dollars (dépôt USD) : le change lire-dollar, non chiffré, reste en remarque" : "caisse en lires : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} ${american ? "USD" : HOME} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || (US_TAPE.has(listing.mic) ? "pas de 605 pour ce ticker" : "pas de feuille de carnet")}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: bist
      ? { rate: BIST_RATE, borsaPayi: BORSA_PAYI, takas, bsmv: BSMV, currency: HOME, eachWay: true }
      : { perOrder: US_TICKET, bsmv: BSMV, currency: "USD", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    bsmv: finite(dollars(bsmv, listing.currency), 6),
    confidence,
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, bistRate: BIST_RATE, borsaPayi: BORSA_PAYI, takas: TAKAS, bsmv: BSMV, usTicket: US_TICKET }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/slayz/slayz_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, value] of Object.entries(out.parts || {})) {
    if (value != null) console.log(`  ${name.padEnd(15)}: ${value} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
