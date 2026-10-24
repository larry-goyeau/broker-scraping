// What one round trip costs at Sigma Capital (Sigma Securities Brokerage,
// Egypt): buy n shares (or EGX 30 ETF units) on the Egyptian Exchange,
// sell them back on a later session, in dollars. Main market, SME market
// and the EGX OTC board are priced alike.
//
// Tariff: "بيان العمولات والمصروفات والرسوم", page 8 (printed 7) of the
// consolidated account-opening form, PDF dated 2025-09-03, read on
// 2026-10-24:
//   https://www.sigma-cap.com/main/system_forms.download?file=Consolidated+Account+Opening+Form+AR.pdf&form_code_p=102
// The update form (form_code_p=103) prints the same page.
//   Trading commission     0.4 % per trade, minimum EGP 10. In the total.
//   Custody commission     0.05 % per trade, minimum EGP 2, charged by the
//                          custodians of Sigma Capital Holding. In the total.
//   Administrative fee     EGP 10 per invoice (one per executed order).
//                          In the total.
//   Coupon collection      1 %, min EGP 10, max EGP 1,000. Not a trade cost.
//   Holding fee            0.007 % a year on the 31 Dec close. Negligible,
//                          left out.
//   Live prices, direct execution and research: EGP 200 a month (delayed
//                          follow-up is free). Remark.
//   Account statement      EGP 10 each. Left out.
// The page adds that the client also bears the exchange, clearing, MCDR,
// stamp and other market charges. Those are the third-party card of
// ../rowad/egxdelivery.mjs (Thndr's card, re-read 2026-10-18):
//   EGX and MCDR 0.01 % each (cap EGP 5,000), FRA 0.005 % (min EGP 1,
//   max EGP 250), risk insurance 0.005 %, stamp T1/T2 0.05 %, each side.
// They are in the total. A trip sold on a later session pays the T1/T2
// stamp.
// Same-session trading (page 17, the "ذات الجلسة" contract) is 0.3 % a
// side instead of 0.4 %, and the stamp is 0.025 % instead of 0.05 %. The
// saving is the remark, computed at the trade's notional with the same
// EGP 10 minimum.
//
// The dollar lines (Nile Sat, SPHT, FAITA, ...) pay the same rates on the
// dollar amount; the EGP minimums, floors and caps are converted at
// fx.mjs (the Central Bank of Egypt mid, the rate the form names for
// cross-currency debits). The account holds EGP and USD (deposits.mjs),
// so no line has an FX leg in the total. The form converts between the
// client's accounts "على أساس سعر الصرف المعلن لدى البنك المركزي المصري"
// (at the Central Bank of Egypt's announced rate), which has a buy and a
// sell price (50.8606 / 50.9606 EGP a dollar on 2026-09-07, as in fx.mjs):
// one conversion costs half that gap over the mid, about 0.1 %. Remark:
// "FX 0.1% when cash ≠ CCY." A listing in any other currency is N/A, as
// Sigma prints no other conversion rate.
//   https://www.cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates
//
// The EGX book is read from spreads/ as in thndr; with no book stored,
// usd stays N/A and brokerFees still prints.
//
//   node brokers/sigmacap/sigmacap_cost.mjs COMI EGX EGP --shares=100 --price=81.2
//   node brokers/sigmacap/sigmacap_cost.mjs EGSA EGX USD --shares=100 --price=6.93 --bp=40
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import {
  MARKET_CARD,
  MARKET_READ_ON,
  EG_EXCHANGE,
  EG_EXCHANGE_CAP,
  EG_FRA,
  EG_FRA_MIN,
  EG_FRA_CAP,
  EG_RISK,
  EG_STAMP_T0,
  EG_STAMP_T1,
  egyptMarket,
} from "../rowad/egxdelivery.mjs";

const FOLDER = "sigmacap";
const CATALOGUE = new URL("sigmacap-parsed.json", import.meta.url);
const PAGE =
  "https://www.sigma-cap.com/main/system_forms.download?file=Consolidated+Account+Opening+Form+AR.pdf&form_code_p=102";
const READ_ON = "2026-10-24";
const RATE = 0.004;
const RATE_MIN = 10;
const SAME_SESSION_RATE = 0.003;
const CUSTODY = 0.0005;
const CUSTODY_MIN = 2;
const ADMIN = 10;
const LIVE_MONTHLY = 200;
const HOLDING = 0.00007;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const frPct = (rate) => `${String(Number((rate * 100).toPrecision(6))).replace(".", ",")} %`;
const pct = (x) => String(Number(x.toFixed(2)));
const boardOf = (row) => (String(row?.raw || "").match(/main market|SME market|OTC board/) || [null])[0];

// An EGP amount in the listing's currency.
function inListing(egp, currency) {
  if (currency === "EGP") return egp;
  const usd = toUsd(egp, "EGP");
  const per = usdPer(currency);
  return usd == null || !per ? null : usd / per;
}

// Sigma's own lines on one side, in the listing's currency.
export function sigmaSide(notional, currency = "EGP", rate = RATE) {
  if (!(Number(notional) > 0)) return null;
  const n = Number(notional);
  const min = inListing(RATE_MIN, currency);
  const custodyMin = inListing(CUSTODY_MIN, currency);
  const admin = inListing(ADMIN, currency);
  if (min == null || custodyMin == null || admin == null) return null;
  return {
    commission: Math.max(n * rate, min),
    custody: Math.max(n * CUSTODY, custodyMin),
    admin,
  };
}

function sameDayLower(notional, currency) {
  if (!(Number(notional) > 0)) return 2 * (RATE - SAME_SESSION_RATE + EG_STAMP_T1 - EG_STAMP_T0);
  const usual = sigmaSide(notional, currency);
  const same = sigmaSide(notional, currency, SAME_SESSION_RATE);
  if (!usual || !same) return null;
  return (2 * (usual.commission - same.commission) + 2 * (EG_STAMP_T1 - EG_STAMP_T0) * notional) / notional;
}

// Central Bank of Egypt buy / sell, EGP a dollar, the rate the account form
// names for converting between the client's accounts.
const CBE_USD = { buy: 50.8606, sell: 50.9606, on: "2026-09-07" };
const FX_PCT = (100 * (CBE_USD.sell - CBE_USD.buy)) / (CBE_USD.sell + CBE_USD.buy);

function remarkOf(notional, currency) {
  const lower = sameDayLower(notional, currency);
  return [
    lower != null && lower > 0 ? `Same day sell is ${pct(lower * 100)}% lower.` : "",
    `Live prices and online execution are EGP ${LIVE_MONTHLY} a month.`,
    fxRemark(FX_PCT, currency),
  ]
    .filter(Boolean)
    .join("\n");
}

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
    cashCurrency: "EGP",
    url: PAGE,
    remark: remarkOf(null, "EGP"),
  };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Sigma n'existe pas encore : lancer `node brokers/sigmacap/sigmacap_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sigma` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sigma`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
    board: boardOf(m.row),
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketText =
    `EGX et MCDR ${frPct(EG_EXCHANGE)} chacun (plafond ${EG_EXCHANGE_CAP} EGP), FRA ${frPct(EG_FRA)} ` +
    `(min ${EG_FRA_MIN} EGP, max ${EG_FRA_CAP} EGP), assurance ${frPct(EG_RISK)}, timbre T1/T2 ${frPct(EG_STAMP_T1)}, ` +
    `chaque sens, carte tiers Thndr relue le ${MARKET_READ_ON}`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: depositHas(FOLDER, "", listing.currency) ? listing.currency : "EGP",
    basis:
      `ordre en ligne, formulaire d'ouverture de compte Sigma (PDF du 3 septembre 2025, page 8) relu le ${READ_ON} : ` +
      `commission ${frPct(RATE)} (min ${RATE_MIN} EGP), garde ${frPct(CUSTODY)} par opération (min ${CUSTODY_MIN} EGP) ` +
      `et frais administratifs ${ADMIN} EGP par facture, chaque sens. ${marketText}.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, market: MARKET_CARD },
  };
  if (!/^(EGX|CASE)$/.test(code(listing.brokerExchange))) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème EGX de Sigma` };
  }
  if (!depositHas(FOLDER, "", listing.currency)) {
    return {
      ...shared,
      why: `change obligatoire : le compte Sigma garde des livres et des dollars, et Sigma ne publie pas son taux pour passer en ${listing.currency}`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = sigmaSide(notional, listing.currency);
  const egypt = egyptMarket(notional, listing.currency);
  const each = side == null ? null : side.commission + side.custody + side.admin;
  const thirdEach = egypt == null ? null : egypt.egx + egypt.mcdr + egypt.fra + egypt.risk;
  const brokerFees = each == null ? null : dollars(each * 2, listing.currency);
  const third = thirdEach == null ? null : dollars(thirdEach * 2, listing.currency);
  const stamp = egypt == null ? null : dollars(egypt.stamp * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, third, stamp);

  return {
    ...shared,
    remark: remarkOf(notional, listing.currency),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: RATE,
      each,
      buy: each,
      sell: each,
      lines: side,
      currency: listing.currency,
      eachWay: true,
    },
    egypt,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(third, 6),
      taxes: finite(stamp, 6),
    },
    confidence: confidenceOf({ listing, side, egypt, marketBp, marketPerShare, unsourced: m.unsourced }),
  };
}

function confidenceOf({ listing, side, egypt, marketBp, marketPerShare, unsourced }) {
  const ccy = listing.currency;
  const said = [
    `barème imprimé dans le formulaire d'ouverture de compte, pas de page tarifaire séparée ; l'ordre en ligne ` +
      `(Sigma GO, site) n'a pas de taux propre, le même barème s'applique`,
    `la « facture » (فاتورة) de 10 EGP est lue comme l'avis d'exécution de chaque ordre, donc un par sens`,
    `la garde ${frPct(CUSTODY)} « par opération » est la commission du dépositaire du groupe, en plus de la ligne MCDR de la carte tiers`,
    `droit de garde annuel ${frPct(HOLDING)} hors du trajet (négligeable), abonnement temps réel ${LIVE_MONTHLY} EGP / mois en remarque`,
  ];
  if (side) {
    said.push(
      `par sens : commission ${Number(side.commission.toPrecision(4))}, garde ${Number(side.custody.toPrecision(4))}, ` +
        `frais ${Number(side.admin.toPrecision(4))} ${ccy}`
    );
  }
  if (egypt) {
    said.push(
      `tiers ${Number((egypt.egx + egypt.mcdr + egypt.fra + egypt.risk).toPrecision(4))} ${ccy} par sens, ` +
        `timbre ${Number(egypt.stamp.toPrecision(4))} ${ccy} par sens`
    );
  }
  if (ccy === "USD") said.push(`ligne en dollars : mêmes taux sur le montant en dollars, minimums en EGP convertis par fx.mjs`);
  if (listing.board === "OTC board") {
    said.push(`ligne du tableau OTC de l'EGX : la saisie en ligne n'a pas pu être vérifiée sans compte, aucune page ne la réserve à l'agence`);
  }
  if (marketPerShare != null) said.push(`carnet ${marketPerShare} la part`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else said.push(`pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}`);
  said.push(`compte ${listing.currency}, la ligne est déjà dans cette devise, pas de change`);
  return said.join(" ; ");
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
  const num = (flag) => (arg(flag, null) == null ? null : Number(arg(flag, null)));
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        bp: num("bp"),
        perShare: num("per-share"),
      }),
      null,
      2
    )
  );
}

printCli();
