// What one round trip costs at Trade Republic: buy n shares at price p, sell
// them back at once, in dollars. A coin is bought by the dollar instead.
//
// The affine triple hid nothing on the ticket — it is a flat euro — but it
// hid the FX margins, which are an add-on to the EUR pair and not a percent
// of the amount. `roundTrip` is given the size and charges what is charged.
//
// Trade Republic Bank GmbH, re-read 2026-09-17. One euro cash account.
// Default is Bestpreis (`--plan=best`): no venue chosen, 1 € a side, TIB
// in euro. The book is the live TIB touch (`traderepublic-touches.json`),
// not a published tape. `--plan=direct` is Direktpreis: the named place,
// 1 € settlement + 1 € venue = 2 € a side. Crypto has no Direct.
// Order commission is 0. Savings plans (10–10 000 €) are 0 and are not
// this trip. Partial fills still pay the fee once a day; one fill is
// assumed.
//
// Cash is euro. A EUR listing has no FX. Any other listing currency is
// converted on the way in and out: interbank mid plus the published pip
// (USD 0.0014, …) each way. That markup is theirs, so it is brokerFees.
// Debit-card FX is free and is not the trade. Card deposits after the
// first (1 %) are funding.
//
// The 1 € is the lump sum for third-party costs. SEC / TAF / CAT / PTM
// are not added on top. Stamp / FTT from taxMap by ISIN. ADR / GDR
// pass-through is named without a rate, so it stays in the remark.
// Tickets already in the number stay out of the remark.
//
//   https://assets.traderepublic.com/documents/DE/FURTHER_INFORMATION_PRICE_LIST_20251125091224.pdf
//   https://support.traderepublic.com/de-de/3372dc64-59cb-4521-a424-1ee812f264a4
//   https://support.traderepublic.com/de-de/835f9deb-b864-4587-b428-7facfc55296c
//   https://support.traderepublic.com/de-de/88-Wie-funktioniert-die-
//
//   node traderepublic/traderepublic_cost.mjs VWCE --shares=10 --price=140
//   node traderepublic/traderepublic_cost.mjs AAPL --shares=10 --price=200
//   node traderepublic/traderepublic_cost.mjs AAPL --plan=direct --shares=10 --price=200
//   node traderepublic/traderepublic_cost.mjs BTC --amount=1000
//   node traderepublic/traderepublic_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("traderepublic-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TOUCHES = new URL("traderepublic-touches.json", import.meta.url);

const SCHEDULE = {
  priceList: "https://assets.traderepublic.com/documents/DE/FURTHER_INFORMATION_PRICE_LIST_20251125091224.pdf",
  best: "https://support.traderepublic.com/de-de/3372dc64-59cb-4521-a424-1ee812f264a4",
  direct: "https://support.traderepublic.com/de-de/835f9deb-b864-4587-b428-7facfc55296c",
  fx: "https://support.traderepublic.com/de-de/88-Wie-funktioniert-die-",
  readOn: "2026-09-17",
  priceListAsOf: "2025-11",
  entity: "Trade Republic Bank GmbH",
};

const DEFAULT_PLAN = "best";
const CASH = "EUR";
const SETTLEMENT = 1;
const VENUE_DIRECT = 1;
const SAVINGS_MIN = 10;
const SAVINGS_MAX = 10000;
const CARD_DEPOSIT = 0.01;
const TRANSFER_OUT = 25;
const ADR_NAMED = /\b(ADR|GDR|ADS)\b/i;

// Official add-on to the EUR/xxx interbank mid, one way. Support article
// of 2026-09-17. 0 means they convert at mid.
const FX_PIP = {
  AED: 0.0065,
  AUD: 0.0018,
  BGN: 0.0023,
  BRL: 0,
  CAD: 0.0018,
  CHF: 0.0014,
  CNH: 0.0093,
  CNY: 0.0093,
  CZK: 0.0306,
  DKK: 0.0089,
  GBP: 0.0011,
  GBX: 0.0011,
  HKD: 0.0112,
  HRK: 0.0089,
  HUF: 0.3717,
  IDR: 24,
  ILS: 0.0049,
  INR: 0,
  JPY: 0.1536,
  MXN: 0.0277,
  MYR: 0.0076,
  NOK: 0.0112,
  NZD: 0.0019,
  PEN: 0.0046,
  PHP: 0.09,
  PLN: 0.005,
  QAR: 0.0052,
  RON: 0.0055,
  RUB: 0.0818,
  SAR: 0.0053,
  SEK: 0.0114,
  SGD: 0.0019,
  THB: 0.0585,
  TRY: 0.0054,
  TWD: 0,
  USD: 0.0014,
  ZAR: 0.0178,
};

const PLANS = {
  best: { id: "best", label: "Best", ticket: SETTLEMENT },
  direct: { id: "direct", label: "Direct", ticket: SETTLEMENT + VENUE_DIRECT },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};
const touches = fs.existsSync(TOUCHES) ? JSON.parse(fs.readFileSync(TOUCHES, "utf8")) : null;

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isAdr = (row) => ADR_NAMED.test(String(row?.name || ""));
const cryptoBase = (ticker) => {
  const text = code(ticker);
  const cut = text.indexOf("/");
  return cut >= 0 ? text.slice(0, cut) : text.replace(/USD$|EUR$/, "");
};

const settleCcy = (currency) => {
  const ccy = code(currency);
  if (ccy === "GBX") return "GBP";
  if (ccy === "CNH") return "CNY";
  return ccy;
};

const dollars = (amount, currency) => {
  const v = toUsd(amount, settleCcy(currency) || currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(settleCcy(currency) || currency),
});

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  if (key === "best" || key === "bestpreis" || key === "bestprice") return PLANS.best;
  if (key === "direct" || key === "direkt" || key === "direktpreis" || key === "directprice") return PLANS.direct;
  return null;
}

// Pip over the EUR/xxx mid, as a fraction of the amount, one way.
export function fxEach(currency) {
  const listed = code(currency) === "GBX" ? "GBP" : code(currency);
  if (!listed || listed === CASH) return 0;
  if (!(listed in FX_PIP)) return null;
  const midCcy = settleCcy(listed);
  const pip = FX_PIP[listed];
  const foreignPerEur = usdPer(CASH) / usdPer(midCcy);
  if (!(foreignPerEur > 0)) return null;
  return pip / foreignPerEur;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rows.filter((r) => {
    if (isCrypto(r) && (loose(cryptoBase(r.ticker)) === asked || loose(r.ticker) === asked)) return true;
    return loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(String(place)))) {
    return { named, matches: crypto.map((r) => ({ row: r, venue: null, unsourced: { match: "crypto" } })) };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const tib = named.filter((r) => !isCrypto(r) && loose(r.exchange) === "TIB");
  const pool = exactCode.length ? exactCode : tib.length ? tib : named.filter((r) => !isCrypto(r));
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (loose(m.row.exchange) === "TIB") return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => {
      if (!wantCurrency) return true;
      if (code(m.row.currency) === wantCurrency) return true;
      return code(m.row.currency) === CASH && loose(m.row.exchange) === "TIB";
    });

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = isCrypto(r)
      ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(r.ticker)), mic: null, currency: "USD" })
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
        });
    const slot = (out[type] ||= { n: 0, withBook: 0 });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

function remarkOf({ adr }) {
  return adr ? "ADR fees passed through." : "";
}

function ticketOf(plan, crypto) {
  if (crypto) return SETTLEMENT;
  return plan.ticket;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is the settlement
 * ticket and, when the listing is not euro, the published FX markup.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount = null,
  plan: planName = DEFAULT_PLAN,
  bp = null,
  perShare = null,
}) {
  const plan = planOf(planName);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: plan?.id ?? planName,
    onlineBuy: true,
    cashCurrency: CASH,
  };

  if (!plan) return { ...answer, why: `formule inconnue : ${planName} (best|direct)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Trade Republic n'existe pas encore : lancer `node traderepublic/traderepublic_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Trade Republic` };

  // Bestpreis does not pick a venue. The catalogue may only carry Direktpreis
  // places; any hit is enough to name the instrument, then execution is TIB.
  const any = matches[0]?.row || named.find((r) => !isCrypto(r)) || named[0];
  const crypto = isCrypto(any);
  const best = plan.id === "best" && !crypto;
  const m = best
    ? { row: { ...any, exchange: "TIB", currency: CASH }, ...listingKey({ exchange: "TIB", currency: CASH, isin: any.isin }) }
    : matches[0];
  if (!m) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Trade Republic`,
      alternatives: listAlternatives(named),
    };
  }
  const book = crypto
    ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(m.row.ticker)), mic: null, currency: "USD" })
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
      });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto
      ? "Trade Republic"
      : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || (crypto ? "USD" : CASH),
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };

  const leaf = book.leaf;
  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = crypto && cash > 0 ? cash : n > 0 && p > 0 ? n * p : null;
  const touch = best ? touches?.byIsin?.[listing.isin] : null;
  const touchUsd = touch?.perShare > 0 ? dollars(touch.perShare, CASH) : null;
  const marketBp = bp ?? (touch?.bp > 0 ? touch.bp : null) ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? touchUsd ?? leaf?.perShare ?? null;
  const tax = crypto ? { rates: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const ticket = ticketOf(plan, crypto);
  const fxPct = crypto || listing.currency === CASH ? 0 : fxEach(listing.currency);

  const shared = {
    ...answer,
    listing,
    feeMarket: crypto ? "crypto" : "listed",
    cashCurrency: CASH,
    venueAuthoritative: best,
    remark: remarkOf({ adr: listing.adr }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (plan.id === "direct" && !crypto ? SCHEDULE.direct : SCHEDULE.best),
    basis: `barème Trade Republic ${crypto ? "crypto" : plan.label}, relu le ${SCHEDULE.readOn} (PLV ${SCHEDULE.priceListAsOf})`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
  };

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant pour cette ligne crypto"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        plan,
        crypto,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        ticket,
        fxPct,
        touch,
      }),
    };
  }

  const notionalUsd = crypto && cash > 0 ? cash : dollars(notional, listing.currency);
  const bookUsd =
    best && touch?.perShare > 0 && n > 0
      ? dollars(touch.perShare * n, CASH)
      : marketPerShare != null
        ? marketPerShare * n
        : marketBp != null && notionalUsd != null
          ? (notionalUsd * marketBp) / 1e4
          : null;
  const taxUsd = notionalUsd == null ? 0 : notionalUsd * taxPct;
  const ticketUsd = dollars(ticket * 2, CASH);
  const fxUsd =
    fxPct == null || notionalUsd == null ? null : listing.currency === CASH || crypto ? 0 : notionalUsd * fxPct * 2;
  const brokerFees = plus(ticketUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: crypto ? null : n,
      price: crypto ? null : p,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto ? QUOTE : listing.currency,
    },
    commission: { each: ticket, currency: CASH, eachWay: true, plan: plan.id },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    fxCharged: finite(fxUsd, 6),
    confidence: confidenceOf({
      plan,
      crypto,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      ticket,
      fxPct,
      n,
      notional,
      touch,
    }),
  };
}

function confidenceOf({
  plan,
  crypto,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  ticket,
  fxPct,
  n,
  notional,
  touch,
}) {
  const said = [];
  said.push(
    `barème ${SCHEDULE.entity}, ${crypto ? "crypto" : plan.label}, relu le ${SCHEDULE.readOn} ` +
      `(PLV ${SCHEDULE.priceListAsOf})`
  );
  said.push(
    `Abwicklungskostenpauschale ${ticket} € par sens` +
      (crypto || plan.id === "best" ? "" : ` (1 € + 1 € de place)`)
  );
  if (crypto) said.push(`Direktpreis n'existe pas sur la crypto, le ticket reste 1 €`);
  if (listing.currency === CASH || crypto) said.push(`compte en euro, ligne déjà en ${listing.currency}, pas de change`);
  else if (fxPct != null) {
    said.push(
      `change imposé ${listing.currency}→EUR, marge ${FX_PIP[code(listing.currency) === "GBX" ? "GBP" : code(listing.currency)]} ` +
        `sur le mid EUR, soit ${Number((100 * fxPct).toPrecision(3))} % par sens`
    );
  } else {
    said.push(`devise ${listing.currency} absente de la table de marges, change non chiffré`);
  }
  if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
  if (touch?.perShare > 0) {
    said.push(
      `carnet Bestpreis live TIB, ${touch.bid} / ${touch.ask} ${touch.currency}, ` +
        `${touch.perShare} € la part (${Number(touch.bp.toPrecision(4))} bp)` +
        (touches?.asOf ? `, ${touches.asOf}` : "")
    );
  } else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf && !(touch?.perShare > 0)) said.push(`carnet absent pour cette ligne`);
  said.push(
    `hors trajet : virement sortant de titres ${TRANSFER_OUT} €, carte après le premier ${100 * CARD_DEPOSIT} %. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  if (n && notional) said.push(`${n} parts, ${Number(notional).toFixed(2)} ${listing.currency}`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          cash: CASH,
          best: SETTLEMENT,
          direct: SETTLEMENT + VENUE_DIRECT,
          savings: { min: SAVINGS_MIN, max: SAVINGS_MAX },
          fxPips: FX_PIP,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node traderepublic/traderepublic_cost.mjs <ticker|ISIN> [place] [devise] [--plan=best|direct] [--shares=n] [--price=p]\n" +
        "        node traderepublic/traderepublic_cost.mjs --schedule\n" +
        "  ex.   node traderepublic/traderepublic_cost.mjs VWCE --shares=10 --price=140\n" +
        "        node traderepublic/traderepublic_cost.mjs AAPL NASDAQ USD --plan=direct --shares=10 --price=230"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    plan: flag("plan") || DEFAULT_PLAN,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Trade Republic propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.plan}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      (t.shares
        ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}`
        : `${t.notional.toFixed(2)} ${t.currency}`) +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
