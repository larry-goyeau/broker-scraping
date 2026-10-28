// What one round trip costs at Freedom Broker Uzbekistan (IP OOO "Freedom
// Finance", ffin.uz): buy n shares on the Republican Stock Exchange
// "Tashkent" (UZSE) through its trading platform and sell them straight
// back, in dollars. Every line is in sums and the account is funded in sums
// (bank, Uzum Bank, Payme), so nothing is converted.
//
// https://ffin.uz/file/2026/09/16/tarify_fiz_lits__2__docx.docx
// (tariff for individuals, Приложение № 3), read on 2026-10-26:
//   "Организованный биржевой рынок, а также организованный внебиржевой
//   рынок АО РФБ «Тошкент»", shares: "От 1 сум до 1млрд. UZS – 1,00 % от
//   суммы сделки", "Свыше 1 млрд. UZS – по договоренности сторон".
//   Note *: the share commission "включает в себя расходы обслуживающих
//   торги организаций" (exchange and depository inside the 1 %).
//   Note ***: on the exchange "продавец уплачивает сбор в Государственный
//   бюджет ... 0,01 процента от суммы сделки"; note ****: on the organised
//   off-exchange market "0,3 процента от суммы сделки".
// The same two rates are those of law ЗРУ-1057 of 17.04.2025: "сделки на
// биржевых торгах по эмиссионным ценным бумагам – 0,01%", "сделки на
// организованных внебиржевых торгах ценными бумагами – 0,3%"
// (https://buxgalter.uz/ru/publish/doc/text207766_chto_izmenilos_v_nalogooblojenii_sdelok_s_cennymi_bumagami).
// https://ffin.uz/brokerskoe-obsludgivanie: orders "через торговую
// платформу, по телефону или письмом на e-mail", account opening and
// keeping free.
//
//   Each side   1.00 % of the amount (no minimum printed).
//   Sell side   + 0.01 % state fee (quotation-list line, STK)
//               + 0.30 % state fee instead (off-exchange board ВТП line).
//
// The catalogue (./uzseBook.mjs) ends the raw text of every off-exchange
// line with "off-exchange board (ВТП)". Left out: the "по договоренности"
// rate above 1 billion sums (a trade of ~1,000 USD is ~12.6 million), the
// 2.0 % IPO/SPO rate (subscriptions, not a round trip), bonds. Account and
// custody are free. Capital gain is nil on a same-price round trip (and
// untaxed for individuals). UZSE has no book in spreads/ and fx.mjs has no
// UZS rate, so the total stays unknown until both exist; the sums in UZS
// are in parts.
//
//   node brokers/freedomuzbekista/freedomuzbekista_cost.mjs HMKB XSTE UZS --shares=200000 --price=63
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const BROKER = "Freedom Broker Uzbekistan";
const FOLDER = "freedomuzbekista";
const CATALOGUE = new URL("freedomuzbekista-parsed.json", import.meta.url);
const TARIFF = "https://ffin.uz/file/2026/09/16/tarify_fiz_lits__2__docx.docx";
const LAW = "https://buxgalter.uz/ru/publish/doc/text207766_chto_izmenilos_v_nalogooblojenii_sdelok_s_cennymi_bumagami";
const READ_ON = "2026-10-26";
const CASH = "UZS";

const RATE = 0.01;
const NEGOTIATED_ABOVE = 1e9; // sums per trade
export const SELL_FEE = Object.freeze({ exchange: 0.0001, otc: 0.003 });

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const frPct = (rate) => `${String(Math.round(rate * 100 * 100000) / 100000).replace(".", ",")} %`;

// uzseBook.mjs ends the raw text of every off-exchange line with this.
export function isOtc(row) {
  return /off-exchange board \(ВТП\)\s*$/.test(String(row?.raw || ""));
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

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

const BASIS =
  `tarif des particuliers de Freedom Broker Uzbekistan (Приложение № 3, fichier du 16.09.2026) relu le ${READ_ON} : ` +
  "actions sur le marché boursier et le marché hors cote organisé de la bourse « Tachkent », 1,00 % du montant jusqu'à 1 milliard de sums, " +
  "frais de bourse et de dépositaire compris (note *)";

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
    url: TARIFF,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const otc = isOtc(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
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
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
    board: otc ? "ВТП" : "STK",
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxMapTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis: BASIS,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour Tachkent en sums ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  if (notional > NEGOTIATED_ABOVE) {
    return { ...shared, why: "au-delà de 1 milliard de sums par opération, la commission est « по договоренности сторон » : non publiée" };
  }
  const notionalUsd = dollars(notional, listing.currency);
  const perOrder = notional * RATE;
  const commissionUzs = perOrder * 2;
  const sellRate = otc ? SELL_FEE.otc : SELL_FEE.exchange;
  const stateFeeUzs = notional * sellRate;
  const taxMapUzs = notional * taxMapTotal;
  const brokerFees = dollars(commissionUzs, listing.currency);
  const taxUsd = dollars(stateFeeUzs + taxMapUzs, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    BASIS,
    `commission ${frPct(RATE)} chaque sens, aucun minimum publié`,
    otc
      ? `ligne du marché hors cote organisé (ВТП) : redevance d'État de ${frPct(SELL_FEE.otc)} à la vente (note **** du tarif, loi ЗРУ-1057)`
      : `ligne de la cote (STK) : redevance d'État de ${frPct(SELL_FEE.exchange)} à la vente (note *** du tarif, loi ЗРУ-1057)`,
    "ouverture et tenue de compte gratuites ; tarif IPO/SPO (2,0 %) hors aller-retour",
    "ligne UZS, compte en sums : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} UZS par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(perOrder, 8),
      sell: finite(perOrder, 8),
      rate: RATE,
      minimum: 0,
      sellFee: sellRate,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      courtageUzs: finite(commissionUzs, 6),
      taxesUzs: finite(stateFeeUzs + taxMapUzs, 6),
      redevanceEtatUzs: finite(stateFeeUzs, 6),
    },
    sources: { fees: TARIFF, stateFee: LAW, orders: "https://ffin.uz/brokerskoe-obsludgivanie" },
    confidence,
  };
}

export function printCli(callerUrl, fn) {
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
  console.log(JSON.stringify(fn({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli(import.meta.url, roundTrip);
