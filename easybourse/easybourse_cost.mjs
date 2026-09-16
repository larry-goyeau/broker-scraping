// What one round trip costs at EasyBourse (La Banque Postale): buy n shares
// at price p, sell them back at once, online, in dollars.
//
// The affine triple hid the ticket. Premium is 2 € up to 500 € then 0.45 %
// of the amount — not max(2 €, 0.45 %) — and `c` was left at 0 with the
// floor in a remark the page had no column for. Every Euronext trip under
// 500 € was missing 4 €. Intense's 50 € cap between 10 k and 100 k, PTM
// £1.50 above 10 000 £ and FINRA's 9.79 $ TAF cap sat in unused fields.
// `roundTrip` is given the size and charges what is charged.
//
// Brochure of 1 June 2026 (TTC), re-read 2026-09-15 — unchanged since the
// 8th. Default is EasyPremium. Start is the same card for ages 18–30.
// Découverte matches Premium on Euronext / Equiduct / LOX and is sell-only
// by phone, without the +11 €, on every other tape. Telephone (+11 € on
// Euronext) is not this trip.
//
//   Euronext Paris / Brussels / Amsterdam, Equiduct, LOX
//     Découverte / Premium / Start   2 € up to 500 €, then 0.45 %
//     Expert                         9 € up to 5 000 €, then 0.20 %
//     Intense                        10 € up to 10 000 €; 10 k–100 k at
//                                    0.10 % capped 50 €; then 0.10 %
//   Other venues (same card for Premium / Start / Expert / Intense):
//     NYSE / Nasdaq                  6 € up to 6 000 €, then 0.12 %
//     Xetra                          11 € up to 4 000 €, then 0.25 %
//     other EU (LSE, Madrid, Lisbon, Zurich, Milan, Frankfurt floor)
//                                    35 € up to 10 000 €, then 0.35 %
//     other                          55 € up to 10 000 €, then 0.55 %
//
// What is in the number: the commission each way at its floor, its rate
// and Intense's cap; AutoFX 0.12 % each way on a non-euro tape (J+1 16:00
// fixing); Irish stamp 1 % and UK stamp 0.50 % on a share purchase (taxMap
// when it has the ISIN, else the rates the card says are extra); French /
// Italian / Spanish FTT from the same map, never invented; PTM £1.50 each
// way on a UK share above 10 000 £; current SEC and TAF on an American
// sale, TAF capped at 9.79 $; the market spread, once.
//
// Inactivity (3 € / 5 € / 5 € per missing Intense order), the Découverte
// first-year free order, PEA 0.50 % online on EEA unless `--pea`, custody
// 0 € and outgoing internet transfers (free) stay in the remark or off
// the trip. No list of promo-zero products is in this repo, so ordinary
// ETFs keep the card. No spot crypto. Catalogue 8 217 lines (7 126 stocks,
// 1 091 ETFs) on Euronext, Nasdaq, NYSE and Xetra.
//
// One live trip on 2026-09-08, one share of TTE, market both ways, routed
// to Equiduct. Buy 77.80, sell 77.74. PRU after the buy was 79.80 — the
// 2 € ticket on the fill — and the sell recap quoted the same 2.00 €.
// TTF was on the ticket (Oui) but not in the PRU; it stays from the tax
// map. Expert / Intense / US / Xetra were not traded.
//
//   https://documents.easybourse.com/formulaires_clients/brochure-tarifaire-bourse_01062026.pdf
//
//   node easybourse/easybourse_cost.mjs TTE EURONEXT EUR --shares=1 --price=77.8
//   node easybourse/easybourse_cost.mjs MC EURONEXT EUR --shares=1 --price=700
//   node easybourse/easybourse_cost.mjs MC EURONEXT EUR --shares=1 --price=700 --plan=expert
//   node easybourse/easybourse_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node easybourse/easybourse_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("easybourse-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://documents.easybourse.com/formulaires_clients/brochure-tarifaire-bourse_01062026.pdf",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-08",
  revised: "2026-06-01",
  entity: "EasyBourse (La Banque Postale)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const FX_EACH_WAY = 0.0012;
const PEA_CAP = 0.005;
const IE_STAMP = 0.01;
const UK_STAMP = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const UK_ISSUERS = /^(GB|JE|GG|IM)$/;

const CHECK = {
  isin: "FR0000120271",
  ticker: "TTE",
  venue: "EQUIDUCT",
  n: 1,
  buy: 77.8,
  sell: 77.74,
  book: 0.06,
  bp: 7.71,
  commissionEach: 2,
  pruAfterBuy: 79.8,
  sellQuoted: 2,
  on: "2026-09-08",
};

const DEFAULT_PLAN = "premium";

const PLANS = {
  decouverte: { id: "decouverte", label: "EasyDécouverte", aliasOf: null, inactivity: 3 },
  premium: { id: "premium", label: "EasyPremium", aliasOf: null, inactivity: 3 },
  start: { id: "start", label: "EasyStart", aliasOf: "premium", inactivity: 3 },
  expert: { id: "expert", label: "EasyExpert", aliasOf: null, inactivity: 5 },
  intense: { id: "intense", label: "EasyIntense", aliasOf: null, inactivity: 5, intenseGap: 5 },
};

const EURONEXT_RULE = {
  decouverte: { min: 2, upTo: 500, rate: 0.0045 },
  premium: { min: 2, upTo: 500, rate: 0.0045 },
  expert: { min: 9, upTo: 5000, rate: 0.002 },
  intense: { min: 10, upTo: 10000, rate: 0.001, cap: 50, capUntil: 100000 },
};

const OTHER_RULE = {
  us: { min: 6, upTo: 6000, rate: 0.0012 },
  xetra: { min: 11, upTo: 4000, rate: 0.0025 },
  other_eu: { min: 35, upTo: 10000, rate: 0.0035 },
  other: { min: 55, upTo: 10000, rate: 0.0055 },
};

const US_MKT = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS"]);
const OTHER_EU = new Set([
  "LSE",
  "AQUIS",
  "BME",
  "SIX",
  "BX",
  "MIL",
  "VIE",
  "OSL",
  "OMXSTO",
  "OMXHEX",
  "FWB",
  "SWB",
  "DUS",
  "MUN",
  "HAM",
  "HAN",
  "BER",
]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const issuerCc = (isin) => String(isin || "").slice(0, 2).toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
  eur: usdPer("EUR"),
});

const PLAN_ALIAS = {
  decouverte: "decouverte",
  découverte: "decouverte",
  decouv: "decouverte",
  premium: "premium",
  start: "start",
  easystart: "start",
  expert: "expert",
  intense: "intense",
};

export function planOf(name = DEFAULT_PLAN) {
  const raw = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^easy/i, "")
    .trim();
  const key = PLAN_ALIAS[loose(raw).toLowerCase()] || PLAN_ALIAS[raw.toLowerCase()];
  const hit = key ? PLANS[key] : null;
  if (!hit) return null;
  return {
    id: hit.id,
    label: hit.label,
    brokerageOf: hit.aliasOf || hit.id,
    inactivity: hit.inactivity,
    intenseGap: hit.intenseGap ?? null,
  };
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || US_MKT.has(code)) return "us";
  if (code === "XETR" || m === "XETR") return "xetra";
  if (m === "XLIS" || code === "XLIS") return "other_eu";
  if (/^(XPAR|XAMS|XBRU|EURONEXT)$/.test(code) || ["XPAR", "XAMS", "XBRU"].includes(m)) {
    return "euronext";
  }
  if (code === "LSE" || code === "AQUIS" || m === "XLON") return "other_eu";
  if (OTHER_EU.has(code) || ["XMAD", "XSWX", "XMIL", "XWBO", "XOSL", "XLIS"].includes(m)) {
    return "other_eu";
  }
  if (m === "XMSM" || /DUBLIN|XMSM/.test(code)) return "other_eu";
  return "other";
}

export function ruleOf(plan, market) {
  const p = planOf(plan);
  if (!p) return null;
  if (market === "euronext") return EURONEXT_RULE[p.brokerageOf];
  return OTHER_RULE[market] || OTHER_RULE.other;
}

/**
 * One side, in euro of notional. Below `upTo` the printed ticket is a floor,
 * not a minimum of the percentage. Intense caps 0.10 % at 50 € between
 * 10 000 € and 100 000 €.
 */
export function commissionEach(amount, rule) {
  if (!rule || amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (n <= rule.upTo) return rule.min;
  let fee = n * rule.rate;
  if (rule.cap != null && n <= (rule.capUntil ?? Infinity)) fee = Math.min(fee, rule.cap);
  return fee;
}

export function commissionSide({ amountEur, plan, market, pea = false }) {
  const rule = ruleOf(plan, market);
  if (!rule || amountEur == null || !Number.isFinite(Number(amountEur))) return null;
  const n = Number(amountEur);
  let charged = commissionEach(n, rule);
  if (charged == null) return null;
  const capped = pea && ["euronext", "xetra", "other_eu"].includes(market) ? Math.min(charged, n * PEA_CAP) : charged;
  return {
    charged: capped,
    raw: n * (rule.rate || 0),
    floored: n <= rule.upTo,
    peaCapped: capped < charged,
    currency: "EUR",
  };
}

function onlineBuy(plan, market) {
  const p = planOf(plan);
  if (!p) return false;
  if (p.brokerageOf === "decouverte" && market !== "euronext") return false;
  return true;
}

function remarkOf(plan, market) {
  const lines = [];
  if (plan.brokerageOf === "decouverte" && market !== "euronext") {
    lines.push("Sell-only by phone off Euronext.");
  }
  if (plan.intenseGap != null) lines.push(`€${plan.intenseGap} per missing order under 15/month.`);
  else if (plan.inactivity != null) lines.push(`€${plan.inactivity}/month if no trades.`);
  return lines.join("\n");
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  if (!isStock(listing)) return { tax, rates: {}, source: null };
  const cc = issuerCc(isin);
  if (cc === "IE") return { tax, rates: { stamp: IE_STAMP }, source: "easybourse" };
  if (cc === "GB") return { tax, rates: { stamp: UK_STAMP }, source: "easybourse" };
  return { tax, rates: {}, source: null };
}

function levyEach({ listing, notional, currency }) {
  if (!isStock(listing)) return { ptm: 0 };
  const cc = issuerCc(listing.isin);
  const mic = String(listing.mic || "").toUpperCase();
  const london = mic === "XLON" || /LSE|LONDON/i.test(listing.brokerExchange || listing.exchange || "");
  if (!london || !UK_ISSUERS.test(cc)) return { ptm: 0 };
  const gbp = toCcy(notional, currency, "GBP");
  if (gbp == null) return { ptm: null };
  return { ptm: gbp > PTM.above ? PTM.each : 0, ptmCcy: PTM.currency };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

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
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the EasyBourse ticket.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
  pea = false,
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    plan: picked?.id ?? plan,
  };

  if (!picked) {
    return { ...answer, why: `formule inconnue : ${plan} (decouverte|premium|start|expert|intense)` };
  }
  if (!catalogue) {
    return { ...answer, why: "le catalogue EasyBourse n'existe pas encore : lancer `node easybourse/easybourse_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EasyBourse` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EasyBourse`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = ruleOf(picked.id, market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic) || market === "us";
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const fxPct = listing.currency === "EUR" ? 0 : FX_EACH_WAY;
  const canBuy = onlineBuy(picked.id, market);

  const shared = {
    ...answer,
    onlineBuy: canBuy,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf(picked, market),
    pea: pea ? { cap: PEA_CAP } : null,
    check: listing.isin === CHECK.isin ? CHECK : null,
  };

  const basis =
    `barème ${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}` +
    (rule ? ` : ${rule.min} € jusqu'à ${rule.upTo} €, puis ${(rule.rate * 100).toFixed(2)} %` : "") +
    (rule?.cap != null ? `, plafond ${rule.cap} € jusqu'à ${rule.capUntil} €` : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        taxSource,
        fxPct,
        american,
        pea,
        online: canBuy,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const notionalEur = toCcy(notional, listing.currency, "EUR");
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amountEur: notionalEur, plan: picked.id, market, pea });
  const sell = commissionSide({ amountEur: notionalEur, plan: picked.id, market, pea });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const brokerFees = plus(buyUsd, sellUsd);

  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_CAP, TAF_PER_SHARE * n) : 0;
  const levy = levyEach({ listing, notional, currency: listing.currency });
  const ptmUsd = levy.ptm == null ? null : dollars((levy.ptm || 0) * 2, levy.ptmCcy || "GBP") ?? 0;

  const usd = plus(bookUsd, brokerFees, taxUsd, fxUsd, secUsd, tafUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
      fx: finite(fxUsd ? fxUsd / 2 : 0, 6),
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
      fx: finite(fxUsd ? fxUsd / 2 : 0, 6),
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, ptmUsd), 6),
    },
    levy: { ptm: levy.ptm },
    commission: {
      each: buy?.charged ?? null,
      min: rule?.min ?? null,
      rate: rule?.rate ?? null,
      cap: rule?.cap ?? null,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
      pea,
    },
    basis,
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
      fxPct,
      american,
      pea,
      online: canBuy,
      buy,
      n,
      tafUsd,
      levy,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  taxSource,
  fxPct,
  american,
  pea,
  online,
  buy,
  n,
  tafUsd,
  levy,
}) {
  const said = [];
  said.push(
    `${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead})`
  );
  if (!online) {
    said.push(`EasyDécouverte n'achète pas ce marché en ligne : vente seule, par téléphone, au tarif de la carte (sans les +11 €)`);
  }
  if (buy?.floored) {
    said.push(`le plancher mord : ${buy.charged} € facturés par sens (palier ≤ ${ruleOf(picked.id, market)?.upTo} €)`);
  } else if (buy) {
    said.push(
      `courtage ${(ruleOf(picked.id, market)?.rate * 100).toFixed(2)} % par sens, ${Number(buy.charged.toPrecision(4))} €` +
        (buy.peaCapped ? `, plafond PEA ${(PEA_CAP * 100).toFixed(1)} %` : "")
    );
  }
  if (fxPct) {
    said.push(`change J+1 16 h + ${(FX_EACH_WAY * 100).toFixed(2)} % par sens`);
  } else {
    said.push(`cotation EUR : pas de change`);
  }
  if (taxPct) {
    said.push(
      taxSource === "easybourse"
        ? `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant — timbre ${issuerCc(listing.isin)} que la carte dit répercuter (cet ISIN n'est pas dans taxMap.mjs)`
        : `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $)` +
        (tafUsd != null && n != null && TAF_PER_SHARE * n > TAF_CAP
          ? ` — le plafond mord : ${Number(tafUsd.toPrecision(4))} $`
          : "")
    );
  }
  if (levy?.ptm) said.push(`PTM ${PTM.each} £ par sens, le montant dépasse ${PTM.above} £`);
  if (pea) said.push(`plafond PEA 0,5 % appliqué à la commission en ligne, marchés EEE`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  if (market === "euronext" && ["decouverte", "premium", "start"].includes(picked.brokerageOf)) {
    said.push(
      `aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.venue}) : ` +
        `achat ${CHECK.buy} / vente ${CHECK.sell}, courtage ${CHECK.commissionEach} € par sens ` +
        `(PRU après achat ${CHECK.pruAfterBuy} = fill + ticket)`
    );
  } else {
    said.push(
      `courtage ${picked.label} / ${market} non recoupé sur un relevé — le seul aller-retour réel est ${CHECK.ticker} Equiduct à 2 € le ticket`
    );
  }
  said.push(
    `hors total : inactivité ${picked.intenseGap != null ? `${picked.intenseGap} € par ordre manquant sous 15 / mois` : `${picked.inactivity} € / mois`}, ` +
      `téléphone + 11 € sur Euronext, 1er ordre Découverte offert la 1re année. Virement internet sortant gratuit`
  );
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
          defaultPlan: DEFAULT_PLAN,
          fxEachWay: FX_EACH_WAY,
          peaCap: PEA_CAP,
          ptm: PTM,
          check: CHECK,
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [
              k,
              {
                ...v,
                euronext: EURONEXT_RULE[v.aliasOf || v.id],
                other: v.id === "decouverte" ? { note: "vente seule, téléphone" } : OTHER_RULE,
              },
            ])
          ),
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
      "usage : node easybourse_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=premium|decouverte|start|expert|intense] [--pea] [--json]\n" +
        "        node easybourse_cost.mjs --schedule\n" +
        "  ex.   node easybourse_cost.mjs TTE EURONEXT EUR --shares=1 --price=77.8\n" +
        "        node easybourse_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=premium"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
    pea: process.argv.includes("--pea"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce qu'EasyBourse propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  if (!out.onlineBuy) console.log(`  en ligne        : vente seule (Découverte, hors Euronext)`);
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
