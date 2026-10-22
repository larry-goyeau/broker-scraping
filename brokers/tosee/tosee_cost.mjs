// What one round trip costs at Tose'e Farda Brokerage (Kargozari Tose'e
// Farda): buy n shares on Iran Fara Bourse or the Tehran Stock Exchange
// and sell them straight back, in dollars. Orders go online through the
// broker's own platforms (Exir, Online Plus, Hamrah Trader). Every line
// is in rials and the account holds rials (deposits.mjs), so nothing is
// converted.
//
// https://fardabroker.ir/questions read on 2026-10-21. The broker prints
// no fee table of its own, only an estimate: about half a percent to buy,
// about one percent to sell with the tax, close to 1.25 % for a buy and a
// sell. Iranian trading fees are capped by the Securities and Exchange
// Organization (SEO) and each exchange prints the resulting table.
// seo.ir, cmr.seo.ir, tse.ir and ifb.ir do not answer from outside Iran.
//
// https://web.archive.org/web/20220618172416/https://en.ifb.ir/Files/IFB%20Commission%20Rates2.pdf
// read on 2026-10-21: Iran Fara Bourse's own table "rates and caps of
// fees on every kind of trade on Iran Fara Bourse", the last copy that
// can be read (same file as the 2021 copies). Shares and rights of the
// first, second, third, base and SME markets, secondary trade, of the
// value of each trade, with a cap in rials on each part:
//                       buy        sell       cap buy / sell (million IRR)
//   Broker              0.304 %    0.304 %    300 / 300
//   Iran Fara Bourse    0.0256 %   0.0256 %   300 / 300
//   Central depository  0.0096 %   0.0144 %   160 / 240
//   TSE technology      0.008 %    0.012 %    120 / 180
//   SEO supervision     0.016 %    0.024 %     80 / 120
//   Sale tax            -          0.5 %      no cap (printed in the same table)
//   Total               0.3632 %   0.88 %
// 0.3632 % + 0.88 % is the broker's "close to 1.25 %".
//
// Tehran Stock Exchange shares: the exchange's own table cannot be read,
// so they stay unknown (N/A).
// Funds (every IRT line: ETFs and the real-estate funds the catalogue
// writes as shares):
// https://asemanamc.com/increase-investment-fund-transaction-fees/ read
// on 2026-10-21 (posted 2025-11-05): the SEO amended clause 5-2 of its
// 1399 resolution, so trades in ETF units now pay up to 50 % of the
// normal fee instead of 25 %. The 2022 fund lines of the IFB table are
// void and the new table cannot be read. They stay unknown (N/A).
//
// In the total: the book crossed, the five fees each side and the 0.5 %
// sale tax, on Iran Fara Bourse shares. Remark: none. No book is stored
// for either exchange and fx.mjs has no rial rate, so the total stays
// unknown until both are.
//
//   node brokers/tosee/tosee_cost.mjs IRO3ABCZ0001 "Iran Fara Bourse" IRR --shares=1000 --price=25000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("tosee-parsed.json", import.meta.url);
const PAGE = "https://fardabroker.ir/questions";
const IFB_TABLE = "https://web.archive.org/web/20220618172416/https://en.ifb.ir/Files/IFB%20Commission%20Rates2.pdf";
const READ_ON = "2026-10-21";
const BASE = "IRR";
const REMARK = "";
const MILLION = 1_000_000;
// Iran Fara Bourse shares, secondary trade: [buy rate, sell rate, buy cap, sell cap].
const IFB_SHARE = [
  ["courtier", 0.00304, 0.00304, 300 * MILLION, 300 * MILLION],
  ["Fara Bourse", 0.000256, 0.000256, 300 * MILLION, 300 * MILLION],
  ["dépositaire central", 0.000096, 0.000144, 160 * MILLION, 240 * MILLION],
  ["technologie TSE", 0.00008, 0.00012, 120 * MILLION, 180 * MILLION],
  ["SEO", 0.00016, 0.00024, 80 * MILLION, 120 * MILLION],
];
const SALE_TAX = 0.005;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Persian symbols have no Latin letter, so they are compared as written.
const plain = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = asked
    ? rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked)
    : rows.filter((r) => plain(r.ticker) === plain(etf) || plain(r.query) === plain(etf));
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

// One side of the IFB share table: each part at its rate, held to its cap.
function ifbSide(notional, side) {
  let fee = 0;
  for (const [, buy, sell, capBuy, capSell] of IFB_SHARE) {
    const rate = side === "buy" ? buy : sell;
    const cap = side === "buy" ? capBuy : capSell;
    fee += Math.min(notional * rate, cap);
  }
  return fee;
}

// Which table a line falls under, or why there is none.
function scheduleOf(listing) {
  const isin = listing.isin || "";
  if (isin.startsWith("IRT")) {
    return {
      why:
        "barème des fonds cotés inconnu : la SEO l'a porté en aban 1404 à 50 % du barème normal (au lieu de 25 %), " +
        "le nouveau tableau n'est pas lisible hors d'Iran et celui de Fara Bourse (juin 2022) est périmé pour les fonds",
    };
  }
  if (listing.mic === "IFBX" || loose(listing.brokerExchange) === "IRANFARABOURSE") return { table: "ifb" };
  return {
    why:
      "barème de la Bourse de Téhéran introuvable : tse.ir et seo.ir ne répondent pas hors d'Iran, " +
      "et la FAQ du courtier ne donne qu'environ 0,5 % à l'achat et 1 % à la vente",
  };
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
    cashCurrency: BASE,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Tose'e Farda n'existe pas encore : lancer `node brokers/tosee/tosee_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Tose'e Farda` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Tose'e Farda`,
      alternatives: named.slice(0, 8).map((r) => `${r.isin || r.ticker} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tosee",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const cash = depositHas("tosee", null, listing.currency) ? listing.currency : BASE;
  const schedule = scheduleOf(listing);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    cashCurrency: cash,
    remark: [REMARK, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      schedule.table === "ifb"
        ? `tableau des commissions de Fara Bourse (copie de juin 2022, relue le ${READ_ON}), actions, marché secondaire. ` +
          `Achat 0,3632 % (courtier 0,304 %, Fara Bourse 0,0256 %, dépositaire 0,0096 %, technologie 0,008 %, SEO 0,016 %), ` +
          `vente 0,38 % (0,304 %, 0,0256 %, 0,0144 %, 0,012 %, 0,024 %) plus 0,5 % d'impôt sur la cession ; chaque part plafonnée en rials.`
        : `FAQ Tose'e Farda relue le ${READ_ON} : environ 0,5 % à l'achat et 1 % à la vente, sans barème exact.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buyLocal = schedule.table === "ifb" ? ifbSide(notional, "buy") : null;
  const sellLocal = schedule.table === "ifb" ? ifbSide(notional, "sell") : null;
  const taxLocal = schedule.table === "ifb" ? notional * SALE_TAX : null;
  const ticketLocal = plus(buyLocal, sellLocal, taxLocal);
  const brokerFees = ticketLocal == null ? null : dollars(ticketLocal, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const why =
    usd != null
      ? null
      : schedule.why
        ? schedule.why
        : notionalUsd == null
          ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
          : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    shared.basis,
    schedule.table === "ifb"
      ? "copie la plus récente lisible du tableau officiel ; la FAQ du courtier (près de 1,25 % l'aller-retour) le confirme"
      : schedule.why,
    `ligne ${listing.currency}, payée en ${cash} : aucun change`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} ${listing.currency} par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    ...(schedule.table === "ifb"
      ? {
          commission: {
            buy: 0.003632,
            sell: 0.0038 + SALE_TAX,
            capBuy: 960 * MILLION,
            capSell: 1140 * MILLION,
            currency: listing.currency,
            table: IFB_TABLE,
          },
        }
      : {}),
    parts: {
      marché: finite(bookUsd, 6),
      courtage: brokerFees == null ? null : finite(dollars(buyLocal + sellLocal, listing.currency), 6),
      taxes: taxLocal == null ? null : finite(dollars(taxLocal, listing.currency), 6),
      courtageLocal: finite(buyLocal == null ? null : buyLocal + sellLocal, 6),
      taxesLocal: finite(taxLocal, 6),
    },
    confidence,
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
