// What one round trip costs at BFA CM Broker, the web trading platform of
// BFA Capital Markets (the securities house of Banco de Fomento Angola): buy
// n shares on BODIVA, the Luanda exchange, and sell them straight back, in
// dollars. Every catalogue line is a kwanza (AOA) line and the account is
// held in kwanzas, so nothing is converted.
//
// https://www.bfa.ao/media/8123/precario-sdvm-bfa-cm.pdf read on 2026-10-26,
// "Preçário ... Entrada em vigor: 16/01/2026", column "Comissões BFACM":
//   "1.3.2. Negociação em Mercado Secundário ... Acções 0,4950%", tax
//   "14% (IVA)" on each commission. No minimum for shares (the BODIVA
//   minimums of notes 1-3 are for debt, fund units and fractions). No side
//   printed: charged on each trade, so on the buy and on the sell.
//   "Manutenção de conta - Clientes Não Institucionais (semestral) Kz 4 200"
//   plus IVA: in the remark, not in the total.
// The 0.4950 % is all-in. The previous tariff, in force from 21/05/2024
// (https://bfa.ao/media/6007/precario.pdf, same lines in
// https://www.bfa.ao/media/5792/precario-bfa-cm.pdf), split the same line
// into four columns: BFACM 0,25 % + BFA 0,05 % + BODIVA 0,15 % + CEVAMA
// 0,045 % = 0,495 %, each with 14 % IVA; its account fee was Kz 400 + 100 +
// 200 a month = Kz 4 200 a half-year, the figure the 2026 tariff prints. So
// the exchange and central-depository commissions are inside the 0.4950 %
// and are not added again.
// Stamp duty: "Estão sujeitos a IS, à taxa de 1%, os títulos negociáveis
// vendidos, excepto quando transmitidos em mercado regulamentado" (same
// tariff): a BODIVA trade is on the regulated market, so no IS.
// Left out: the BODIVA book is not stored (usd stays null until it is), the
// 2.8 % commission on dividends, capital-gains tax and transfers.
//
//   node brokers/bfacm/bfacm_cost.mjs BFAAAAAA BODIVA AOA --shares=9 --price=98000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("bfacm-parsed.json", import.meta.url);
const PAGE = "https://www.bfa.ao/media/8123/precario-sdvm-bfa-cm.pdf";
const SPLIT_PAGE = "https://bfa.ao/media/6007/precario.pdf";
const READ_ON = "2026-10-26";
const BROKER = "BFA CM Broker";
// All-in: BFACM + BFA + BODIVA + CEVAMA, each side.
const COMMISSION = 0.00495;
// IVA on the commission, each side.
const COMMISSION_TAX = 0.14;
const CASH = "AOA";
const REMARK = "Account fee Kz 4,200 + 14% VAT a half-year.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const joinRemark = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/bfacm/bfacm_scraping.mjs\`` };
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
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bfacm",
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
  const shared = {
    ...answer,
    remark: joinRemark(m.row.remark, REMARK),
    listing,
    basis:
      `preçário ${BROKER} en vigueur depuis le 16/01/2026, relu le ${READ_ON} : actions, marché secondaire, ` +
      `0,4950 % du montant à chaque sens, sans minimum, plus 14 % d'IVA sur la commission. Ce taux inclut les ` +
      `commissions BODIVA (0,15 %) et CEVAMA (0,045 %) que le préçario du 21/05/2024 détaillait ; rien d'autre n'est ajouté. ` +
      `Pas d'impôt du timbre sur une vente en marché réglementé.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, split: SPLIT_PAGE },
  };
  if (listing.currency !== CASH || listing.mic !== "XBDV") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la BODIVA en kwanzas ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * COMMISSION;
  const taxEach = each * COMMISSION_TAX;
  const brokerFees = dollars(each * 2, listing.currency);
  const tax = dollars(taxEach * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, tax);
  const why = [
    notionalUsd == null ? `pas de cours ${listing.currency}/USD dans fx.mjs` : null,
    bookUsd == null && notionalUsd != null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: COMMISSION, allIn: true, each, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { tax: taxEach, eachWay: true, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: 0,
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
