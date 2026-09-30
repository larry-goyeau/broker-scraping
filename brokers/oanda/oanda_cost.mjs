// What one round trip costs at OANDA TMS: buy n shares at price p, sell them
// back at once, in dollars.
//
// OANDA TMS Brokers S.A. (Warsaw, KNF). The catalogue is the TMS Stocks list
// (`oanda_scraping.mjs`): 2 380 cash shares and UCITS ETFs across New York,
// Nasdaq, Xetra, Euronext, the LSE, Madrid and the GPW. The CFD books, BTCUSD
// among them, are another product and are not here.
//
// The affine triple this file used to answer got the commissions right and then
// left out the largest charge on most of its lines. The old header said it in as
// many words — « FX is a pip margin on the system mid, not a %, so it stays out
// of a » — and that sentence is where the number went wrong. It is true that the
// margin is not a percentage. It is not true that it cannot be priced, and it is
// not true that it is optional.
//
// A Cash Account has one base currency. Everything owed or received in another
// one is converted into it, at the moment of the transaction, at a rate the
// table defines as the mid plus or minus a published margin. A euro account
// buying an American share converts twice, once each way, and cannot do
// otherwise: there is no dollar pocket to leave the proceeds in.
//
// The margins are published in units of the quoted currency rather than in
// percent, which is what hid them. Divided by the rates they sit on, they are
// all the same charge:
//
//   EURUSD  0,006 sur 1,1622   0,52 %      USDPLN  0,02 sur 3,7087   0,54 %
//   EURGBP  0,006 sur 0,8589   0,70 %      EURPLN  0,02 sur 4,3102   0,46 %
//   GBPUSD  0,006 sur 1,3531   0,44 %      EURCZK  0,15 sur 24,197   0,62 %
//   USDJPY  0,8   sur 154,75   0,52 %      EURHUF  2,0   sur 363,20   0,55 %
//
// Thirty pairs, every one of them between a quarter and one percent, and most of
// them within a hair of a half. That is not a coincidence of quotation units, it
// is one policy written thirty times, and it costs about as much per conversion
// as the European commission costs per order.
//
// Read once against the terminal rather than the table, on 2026-09-14. The
// trading system quotes the conversion pairs itself, and an order ticket on
// EURUSD printed 1,14657 / 1,15857 at 13:55 UTC. That width is 0,012, which is
// twice 0,006 to the last digit, and the middle of it, 1,15257, was the market
// at that minute — the open tape said 1,1529 five minutes later. So the margin
// is not a spread the broker might narrow on a good day: the quote is built as
// the mid plus and minus the published figure, and 0,006 on 1,1529 is 0,5204 %,
// which is what this file charges.
//
// Then paid for, the same afternoon, on a real euro account: four Allegro at
// 45,87 zł on the GPW, bought and sold back within the minute. The terminal was
// quoting EURPLN 4,3260 / 4,3660 — again a width of twice the published 0,02.
//
//   notionnel                                183,48 zł
//   solde débité à l'achat                    43,41 €   = 183,48 / 4,3260 + 1,00
//   solde crédité à la vente                  41,03 €   = 183,48 / 4,3660 − 1,00
//   aller-retour                               2,38 €
//
// Every digit of that is the schedule. The zloty was bought at the mid less the
// margin and sold at the mid plus it, so the conversion is not a quote the
// broker happens to show but the rate the account is actually filled at, twice.
// And the commission was one euro each way where 0,19 % of the amount would have
// been eight cents, which is the Warsaw minimum doing exactly what it says. No
// Polish transaction tax appeared, and nothing else did either: 2,00 € of
// commission and 0,39 € of margin account for the whole bill.
//
// This file answered 2,395 € for that trade, against 2,38 € paid — the gap is
// the EURPLN drift between the rates it caches and the day of the trade.
//
// The ETF allowance was bought and sold the same afternoon, on the same euro
// account: seven SPDR S&P 500 accumulating, quoted in euros on Xetra.
//
//   solde avant                              122,00 €
//   solde après l'achat de 7 à 16,3245 €       7,73 €
//   solde après la vente                     122,00 €
//   aller-retour                               0,00 €
//
// The debit was the notional and nothing else: 7 × 16,3245 is 114,2715, and
// 114,27 is what left the account. No commission on either leg, where the 0,10 %
// floor would have taken a euro each way, and no conversion, a euro ETF on a
// euro account having nothing to convert. The ten free orders a month are real.
//
// So they are now applied rather than mentioned, and that is a change of mind.
// This file used to charge the ETF commission and footnote the quota, on the
// ground that a monthly allowance cannot be charged to a single trip — which is
// how N26's free trades are treated here too. But the two are not the same
// animal. N26's are bought, at 9,90 € or 16,90 € a month, so crediting them
// without charging the subscription would flatter the answer; Admiral's are
// conditional, one side only and no ETFs. OANDA's cost nothing and exclude
// nothing, and a round trip spends two orders of ten, which leaves the first
// five of the month at the price of the spread. Charging 2,02 € for one of them
// was inventing 175 basis points on the case the schedule gives away, so the
// total now says nothing and `confidence` says what the eleventh order costs.
//
// The American leg is still unmeasured. A market order for one Ford share came
// back « Invalid volume » from a terminal whose own volume field steps by one
// and floors at one, which reads as the US group being shut to that account
// rather than as a size error. The Warsaw trip carries it: the same mid, the
// same published margin, the same two conversions.
//
// Which changes what the free markets are worth. OANDA leads with « 0 EUR
// commission for US shares » on euro, zloty, koruna and leu accounts, and the
// commission really is zero. But a euro account cannot hold the dollars, so the
// round trip pays EURUSD twice: 1,03 % of the amount, on a trade whose
// advertised commission is nothing. A British line on the same account is worse
// still, EURGBP being the widest pair of the lot — 1,40 % round trip, on top of
// the 0,15 % commission. The German, French and Spanish lines are the only ones
// a euro account reaches without converting, and they are the ones that carry a
// commission.
//
// Barème relu le 2026-09-14, table du 1er juillet 2026.
//
//   Actions US        0 sur un compte EUR / PLN / CZK / RON, sans minimum
//                     0,29 %, minimum 7 $, sur un compte USD
//   DE / FR / ES / UK 0,15 %, minimum 5 € / 5 $ / 20 zł / 20 lei / 125 Kč
//   Pologne (GPW)     0,19 %, minimum 1 € / 1 $ / 5 zł / 5 lei / 25 Kč
//   ETF               0,10 %, minimum 1 € / 1 $ / 5 zł / 5 lei / 25 Kč
//                     10 ordres sans commission par mois, jusqu'à 200 000 €
//   Change            mid ± marge publiée, ci-dessus, à chaque conversion
//   Garde             gratuite tant que le compte a servi dans l'année
//
// Four other things the old file did not carry.
//
// The first is the Spanish transaction tax, 0,2 % à l'achat. `taxMap.mjs` has no
// Spanish line, so the fifty-six Madrid names were being priced without it. The
// tax exists, OANDA prints it, and it is now charged — with the reservation that
// it only bites above a billion euros of capitalisation, a list this repository
// does not hold.
//
// The second is the FINRA levy, which was being charged and should not have
// been. OANDA's table names one American charge and one only, the SEC fee on the
// sale. The trading activity fee is a charge on FINRA members, which a Polish
// investment firm is not, and a levy that is not in the table is a levy this
// file should not invent. So it is dropped, by name, the way N26's stamp duty
// was.
//
// The third is the minimum, which used to sit in a `floor` field the page had no
// column for and in a `min fees` remark. On a small order the minimum is the
// whole commission, and it is now simply in the number.
//
// The fourth is the custody fee, which is zero for anyone who trades and ten
// euros a month for anyone who does not — a year of silence turns a free account
// into a hundred and twenty euros a year. It belongs to holding rather than to
// this trip, so it is in the remark.
//
// Two of OANDA's own printed rates are stale and are not used. The SEC fee is
// printed at 0,00221 % and has been 0,00206 % since May 2026; the PTM levy is
// printed at one pound while `taxes.mjs` carries one pound fifty. The French tax
// is printed at 0,3 % and has been 0,4 % since April 2025, which the ex-ante
// document of another broker in this repository confirms to the centime, so
// `taxMap.mjs` is preferred there too.
//
// What is charged and is in the number: the commission each way with its
// minimum; the conversion each way when the line is not in the account's own
// currency; the book, once, it being already a round trip; stamp duties and
// transaction taxes on the purchase; the SEC fee on the sale; and the PTM levy
// both ways above ten thousand pounds.
//
// What is not: the ten free ETF orders a month, an allowance that belongs to a
// month; the product costs of an ETF, which are a charge on holding; the
// exchange fees, which the table names without an amount; and the telephone,
// paper and report charges, which are not a trade.
//
//   https://www.oanda.com/eu-en/document/81
//   https://www.oanda.com/eu-en/invest/brokerage-account
//   https://help.oanda.com/eu/en/faqs/trade-etfs-eu.htm
//
//   node oanda/oanda_cost.mjs AAPL --shares=10 --price=230
//   node oanda/oanda_cost.mjs AAPL --shares=10 --price=230 --plan=usd
//   node oanda/oanda_cost.mjs VWCE XETR EUR --shares=10 --price=120
//   node oanda/oanda_cost.mjs HSBA LSE GBP --shares=100 --price=9
//   node oanda/oanda_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("oanda-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.oanda.com/eu-en/document/81",
  page: "https://www.oanda.com/eu-en/invest/brokerage-account",
  etfHelp: "https://help.oanda.com/eu/en/faqs/trade-etfs-eu.htm",
  readOn: "2026-09-14",
  revised: "2026-07-01",
  entity: "OANDA TMS Brokers S.A. (PL, KNF)",
};

const SEC_RATE = 0.0000206;
const SEC_PRINTED = 0.0000221;
const PTM = { each: 1, ccy: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const ES_FTT = 0.002;
const ES_FTT_ABOVE = "1 milliard d'euros de capitalisation";
const ETF_FREE_TRADES = { n: 10, turnover: 200000, ccy: "EUR" };

// Ce que le compte a réellement payé, le jour où il a servi de témoin.
const MEASURED = {
  on: "2026-09-14",
  gpw: { shares: 4, name: "Allegro", price: "45,87", paid: "2,38", modelled: "2,395" },
  etf: { shares: 7, name: "SPDR S&P 500", price: "16,3245" },
};
const INACTIVITY = { after: 365, amount: 10, ccy: "EUR" };

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "OTC"]);
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const DEFAULT_PLAN = "eur";

// Published in units of the quoted currency, one margin each way about the mid.
// Only the pairs OANDA names are here: a conversion it does not price is a cost
// this file cannot put a number on, and a leu account buying a German share is
// exactly that case.
const FX_MARGIN = {
  USDPLN: 0.02,
  EURPLN: 0.02,
  GBPPLN: 0.02,
  CHFPLN: 0.02,
  USDRON: 0.02,
  AUDUSD: 0.006,
  EURGBP: 0.006,
  EURAUD: 0.006,
  NZDUSD: 0.006,
  EURCHF: 0.006,
  USDCHF: 0.006,
  GBPUSD: 0.006,
  EURUSD: 0.006,
  EURCAD: 0.006,
  USDCAD: 0.006,
  EURNZD: 0.006,
  USDSEK: 0.07,
  USDNOK: 0.07,
  EURSEK: 0.07,
  EURNOK: 0.07,
  USDZAR: 0.07,
  EURZAR: 0.07,
  USDCZK: 0.15,
  EURCZK: 0.15,
  EURTRY: 0.15,
  USDTRY: 0.15,
  EURJPY: 0.8,
  USDJPY: 0.8,
  USDHUF: 2.0,
  EURHUF: 2.0,
};

const PLANS = {
  eur: { id: "eur", label: "OANDA TMS (EUR)", ccy: "EUR" },
  usd: { id: "usd", label: "OANDA TMS (USD)", ccy: "USD" },
  pln: { id: "pln", label: "OANDA TMS (PLN)", ccy: "PLN" },
  ron: { id: "ron", label: "OANDA TMS (RON)", ccy: "RON" },
  czk: { id: "czk", label: "OANDA TMS (CZK)", ccy: "CZK" },
};

const PLAN_ALIAS = {
  eur: "eur",
  euro: "eur",
  default: "eur",
  usd: "usd",
  dollar: "usd",
  pln: "pln",
  zloty: "pln",
  poland: "pln",
  ron: "ron",
  leu: "ron",
  lei: "ron",
  czk: "czk",
  koruna: "czk",
};

// One way, in the account's own currency. `min` is a floor on the percentage.
const RULE = {
  eur: {
    us: { rate: 0, min: 0, currency: "EUR" },
    europe: { rate: 0.0015, min: 5, currency: "EUR" },
    poland: { rate: 0.0019, min: 1, currency: "EUR" },
    etf: { rate: 0.001, min: 1, currency: "EUR" },
  },
  usd: {
    us: { rate: 0.0029, min: 7, currency: "USD" },
    europe: { rate: 0.0015, min: 5, currency: "USD" },
    poland: { rate: 0.0019, min: 1, currency: "USD" },
    etf: { rate: 0.001, min: 1, currency: "USD" },
  },
  pln: {
    us: { rate: 0, min: 0, currency: "PLN" },
    europe: { rate: 0.0015, min: 20, currency: "PLN" },
    poland: { rate: 0.0019, min: 5, currency: "PLN" },
    etf: { rate: 0.001, min: 5, currency: "PLN" },
  },
  ron: {
    us: { rate: 0, min: 0, currency: "RON" },
    europe: { rate: 0.0015, min: 20, currency: "RON" },
    poland: { rate: 0.0019, min: 5, currency: "RON" },
    etf: { rate: 0.001, min: 5, currency: "RON" },
  },
  czk: {
    us: { rate: 0, min: 0, currency: "CZK" },
    europe: { rate: 0.0015, min: 125, currency: "CZK" },
    poland: { rate: 0.0019, min: 5, currency: "CZK" },
    etf: { rate: 0.001, min: 25, currency: "CZK" },
  },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isTracker = (listing) => /^(ETF|ETC|ETN)$/i.test(String(listing?.type || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const convert = (amount, from, to) => {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const a = usdPer(from);
  const b = usdPer(to);
  if (a == null || b == null || !(b > 0)) return null;
  return (Number(amount) * a) / b;
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

const pct = (x, digits = 3) => (100 * x).toFixed(digits).replace(".", ",");

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  if (isTracker(row)) return "etf";
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(row?.currency || "").toUpperCase();
  const isin = String(row?.isin || "").toUpperCase();
  if (/WSE|GPW|XWARS|WARSAW/.test(ex) || m === "XWAR") return "poland";
  if (US_MICS.has(m) || US_EX.has(ex) || /NASDAQ|NYSE|AMEX|ARCA|BATS|OTC/.test(ex)) return "us";
  if (
    m === "XLON" ||
    m === "XETR" ||
    m === "XPAR" ||
    m === "XMAD" ||
    /LSE|XETR|XETRA|EURONEXT|BME|MADRID|LONDON/.test(ex)
  ) {
    return "europe";
  }
  // A few catalogue rows keep a leftover csv venue (BCS, GETTEX, LSX) on a US
  // share. The printed US card is for US-listed shares, not for that venue.
  if (isin.startsWith("US") && ccy === "USD") return "us";
  return null;
}

export function ruleOf(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  return RULE[picked.id]?.[market] || null;
}

/** One side's commission, in the account's currency, floor applied. */
export function commissionSide({ notionalInAccount, rule }) {
  if (!rule) return null;
  if (notionalInAccount == null || !Number.isFinite(Number(notionalInAccount))) {
    return rule.rate ? null : { charged: 0, raw: 0, floored: false, currency: rule.currency };
  }
  const raw = Number(notionalInAccount) * (rule.rate || 0);
  const charged = rule.min ? Math.max(rule.min, raw) : raw;
  return { charged, raw, floored: rule.min ? raw < rule.min : false, currency: rule.currency };
}

/**
 * What one conversion costs, as a fraction of the amount. The margin is quoted
 * in units of the pair's second currency, so it becomes a rate by being divided
 * by the pair. Which of the two currencies is being bought does not matter: a
 * margin about the mid is against the client either way.
 */
export function fxLeg({ account, listing }) {
  const a = String(account || "").toUpperCase();
  const b = String(listing || "").toUpperCase();
  if (!a || !b || a === b) return { needed: false, pct: 0, pair: null, margin: null };
  const pair = FX_MARGIN[a + b] != null ? a + b : FX_MARGIN[b + a] != null ? b + a : null;
  if (!pair) return { needed: true, pct: null, pair: null, margin: null, why: `${a}${b} n'est pas au barème de change` };
  const margin = FX_MARGIN[pair];
  const mid = convert(1, pair.slice(0, 3), pair.slice(3));
  if (mid == null || !(mid > 0)) return { needed: true, pct: null, pair, margin, why: `pas de cours pour ${pair}` };
  return { needed: true, pair, margin, mid, pct: margin / mid };
}

/**
 * Stamp duties and transaction taxes, on the purchase. `taxMap.mjs` first, since
 * it is measured and kept current; OANDA's own printed rates fill the countries
 * the map has no line for.
 */
function stampOf({ listing, tax }) {
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "taxMap" };
  if (!isStock(listing)) return { pct: 0, rates: {}, source: null };

  const isin = String(listing.isin || "").toUpperCase();
  const mic = String(listing.mic || "").toUpperCase();
  if (isin.startsWith("IE") || mic === "XDUB" || mic === "XMSM") {
    return { pct: IE_STAMP, rates: { IRISH_STAMP: IE_STAMP }, source: "oanda" };
  }
  if (mic === "XLON" || isin.startsWith("GB")) {
    return { pct: UK_STAMP, rates: { STAMP_DUTY: UK_STAMP }, source: "oanda" };
  }
  if (isin.startsWith("ES") || mic === "XMAD") {
    return { pct: ES_FTT, rates: { SPANISH_FTT: ES_FTT }, source: "oanda", capped: ES_FTT_ABOVE };
  }
  return { pct: 0, rates: {}, source: null };
}

function remarkOf({ market, listing }) {
  const said = [];
  if (market === "etf") {
    said.push(`First ${ETF_FREE_TRADES.n} ETF orders each month have no broker fees; a round trip spends two.`);
  }
  if (isTracker(listing)) said.push("ETF product costs (TER) apply on top.");
  return said.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantVenue && ["XPAR", "XAMS", "XBRU", "XLIS"].includes(wantVenue.mic) && loose(m.row.exchange) === "EURONEXT") {
        return true;
      }
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const plan of Object.keys(PLANS)) {
    const slot = (out[plan] = { n: 0, converts: 0, sansChange: 0, byMarket: {} });
    for (const r of rows) {
      const { venue, unsourced } = listingKey(r);
      const market = feeMarketOf(r, venue?.mic);
      const leg = fxLeg({ account: PLANS[plan].ccy, listing: r.currency });
      slot.n += 1;
      if (leg.needed && leg.pct != null) slot.converts += 1;
      if (leg.needed && leg.pct == null) slot.sansChange += 1;
      const mk = (slot.byMarket[market || "none"] ||= { n: 0, changePct: null });
      mk.n += 1;
      if (leg.pct != null) mk.changePct = Number((100 * leg.pct).toPrecision(3));
    }
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the part OANDA keeps,
 * commission and conversion margin, which is not the same thing as the total.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, plan: picked?.id ?? plan };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (eur|usd|pln|ron|czk)` };
  if (!catalogue) return { ...answer, why: "le catalogue OANDA n'existe pas encore : lancer `node oanda/oanda_scraping.mjs`" };

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue OANDA` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez OANDA`, alternatives: listAlternatives(named) };
  }

  const m = matches[0];
  let book = spreadLeaf(spreads, { isin: m.row.isin, mic: m.venue?.mic ?? null, currency: m.row.currency, unsourced: m.unsourced });
  const marketGuess = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  // Rule 605 is a tape figure. A leftover csv venue (BCS, GETTEX, LSX) on a US
  // share still reads the same American report as NYSE or Nasdaq.
  if (marketGuess === "us" && book.leaf?.perShare == null) {
    const tape = spreadLeaf(spreads, { isin: m.row.isin, mic: "XNYS", currency: "USD" });
    if (tape.leaf?.perShare != null) book = tape;
  }

  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange:
      (book.mic && book.mic !== m.venue?.mic ? resolveVenue({ mic: book.mic, exchange: book.mic }).venue?.name : null) ||
      m.venue?.name ||
      m.unsourced?.name ||
      m.row.exchange ||
      null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = ruleOf(picked, market);
  const tax = taxesOf(listing.isin);
  const leg = fxLeg({ account: picked.ccy, listing: listing.currency });
  const stamp = stampOf({ listing, tax });
  const american = market === "us" || US_MICS.has(listing.mic);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    plan: picked.id,
    cashCurrency: picked.ccy,
    bp: marketBp,
    perShare: marketPerShare,
    url: book.leaf?.url ?? SCHEDULE.source,
    tax,
    fx: { ...fxNote(listing.currency), account: picked.ccy, leg },
    remark: remarkOf({ market, listing }),
    commission: rule
      ? { rate: rule.rate || null, min: rule.min || null, currency: rule.currency, eachWay: true, plan: picked.id }
      : null,
    basis:
      `barème ${picked.label}, palier ${market || "inconnu"}, table du ${SCHEDULE.revised} lue le ${SCHEDULE.readOn}` +
      (leg.needed && leg.pct != null ? `, change ${leg.pair} ${pct(leg.pct)} % par conversion` : ""),
  };

  if (!rule) {
    return {
      ...shared,
      why: `pas de palier publié chez OANDA TMS pour ${listing.ticker || listing.isin} (${listing.exchange || "place"})`,
    };
  }
  if (leg.needed && leg.pct == null) {
    return {
      ...shared,
      why:
        `un compte en ${picked.ccy} doit convertir pour toucher une ligne en ${listing.currency}, et ` +
        `${leg.why} : la conversion est obligatoire, donc le total ne peut pas être dit`,
      confidence: confidenceOf({ picked, rule, market, leg, stamp, american, listing, buy: null, marketBp, n: null }),
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ picked, rule, market, leg, stamp, american, listing, buy: null, marketBp, n: null }),
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalInAccount = convert(notional, listing.currency, picked.ccy);

  // The book is already a round trip, so it is added once and not per side. An
  // American line is priced per share from the Rule 605 tape rather than in
  // basis points, and that figure is already in dollars.
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  // The ten free ETF orders a month were measured, not read: seven SPDR S&P 500
  // bought and sold back took nothing at all, where the floor would have taken a
  // euro each way. So the quota is applied rather than mentioned. It is not a
  // discount to pro-rate either — a round trip spends two orders of ten, which
  // leaves the first five of the month at the price of the spread alone.
  //
  // What the eleventh order would cost is not lost, only moved: it is kept here
  // and said in `confidence`, so nothing about the schedule goes unreported.
  const paid = commissionSide({ notionalInAccount, rule });
  // The allowance stops at 200 000 € of turnover, and a round trip is twice the
  // notional. A trip that would blow the monthly cap on its own is not free by
  // any reading, so it pays. Below it, the quota is assumed untouched — this
  // file prices one trip and cannot know what else the month held.
  const capInAccount = convert(ETF_FREE_TRADES.turnover, ETF_FREE_TRADES.ccy, picked.ccy);
  const withinCap = capInAccount == null || notionalInAccount == null ? true : 2 * notionalInAccount <= capInAccount;
  const free = market === "etf" && rule != null && withinCap;
  const nothing = { charged: 0, raw: 0, floored: false, currency: rule?.currency ?? picked.ccy };
  const buy = free ? nothing : paid;
  const sell = free ? nothing : commissionSide({ notionalInAccount, rule });
  const buyCommUsd = buy ? dollars(buy.charged, buy.currency) : null;
  const sellCommUsd = sell ? dollars(sell.charged, sell.currency) : null;

  // One conversion in, one out, each on the whole amount.
  const fxSideUsd = notionalUsd == null || leg.pct == null ? null : notionalUsd * leg.pct;
  const fxUsd = leg.needed ? (fxSideUsd == null ? null : 2 * fxSideUsd) : 0;

  const stampUsd = notionalUsd == null ? null : notionalUsd * stamp.pct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;

  const notionalGbp = convert(notional, listing.currency, PTM.ccy);
  const ptmDue = !isStock(listing) || !UK_REGISTERED.test(listing.isin || "") ? false : notionalGbp == null ? null : notionalGbp > PTM.above;
  const ptmUsd = ptmDue === false ? 0 : ptmDue === null ? null : dollars(2 * PTM.each, PTM.ccy);

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, fxUsd, stampUsd, secUsd, ptmUsd);
  // What OANDA keeps, told apart from the total because the page prints the two
  // side by side. The conversion margin belongs here and not with the market:
  // it is not a book anyone quoted, it is a published markup on the mid, and it
  // is the whole of what a « 0 EUR commission » American trade actually costs.
  const brokerFees = plus(buyCommUsd, sellCommUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: `aucun carnet pour ${listing.ticker || listing.isin} à ${listing.exchange}` } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency, inAccount: finite(notionalInAccount, 6) },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buy ? { charged: Number(buy.charged.toPrecision(6)), raw: finite(buy.raw, 6), floored: buy.floored, currency: buy.currency } : null,
      change: finite(fxSideUsd, 6),
      taxes: finite(stampUsd, 6),
      taxRates: Object.keys(stamp.rates).length ? stamp.rates : null,
      ptm: ptmDue ? finite(dollars(PTM.each, PTM.ccy), 6) : ptmDue === null ? null : 0,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      native: sell ? { charged: Number(sell.charged.toPrecision(6)), raw: finite(sell.raw, 6), floored: sell.floored, currency: sell.currency } : null,
      change: finite(fxSideUsd, 6),
      réglementaire: american ? finite(secUsd, 6) : 0,
      ptm: ptmDue ? finite(dollars(PTM.each, PTM.ccy), 6) : ptmDue === null ? null : 0,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyCommUsd, sellCommUsd), 6),
      change: finite(fxUsd, 6),
      taxes: finite(stampUsd, 6),
      réglementaire: american ? finite(secUsd, 6) : 0,
      ptm: ptmUsd === null ? null : finite(ptmUsd, 6),
    },
    confidence: confidenceOf({ picked, rule, market, leg, stamp, american, listing, buy, paid, free, marketBp, n }),
  };
}

function confidenceOf({ picked, rule, market, leg, stamp, american, listing, buy, paid = null, free = false, marketBp, n }) {
  const said = [];

  said.push(
    `OANDA TMS Brokers, compte ${picked.ccy}, palier ${market}, table du ${SCHEDULE.revised} lue le ${SCHEDULE.readOn} : ` +
      (rule.rate
        ? `${pct(rule.rate, 2)} % par sens` + (rule.min ? `, plancher ${rule.min} ${rule.currency}` : "")
        : `commission nulle, sans minimum`)
  );

  if (buy?.floored) {
    said.push(
      `au plancher : le ticket de ${rule.min} ${rule.currency} est toute la commission, ` +
        `le barème n'en donnerait que ${Number(buy.raw).toPrecision(3)} ${rule.currency} — ` +
        `le minimum se calcule sur l'ordre du jour et non sur chaque exécution partielle`
    );
  }

  if (leg.needed) {
    said.push(
      `change obligatoire et compté deux fois : un compte se tient dans une seule devise, et tout ce qui est ` +
        `dû ou reçu en ${listing.currency} est converti au mid ± ${leg.margin} sur ${leg.pair}, ` +
        `soit ${pct(leg.pct)} % par conversion au cours du ${FX_AS_OF} — ` +
        `${pct(1 - (1 - leg.pct) ** 2)} % sur l'aller-retour` +
        (rule.rate ? "" : `, ce qui est le prix réel d'une ligne annoncée « 0 EUR commission »`)
    );
  } else {
    said.push(`aucun change : la ligne est cotée dans la devise du compte, ce qui est le seul cas où OANDA ne prend pas sa marge`);
  }

  if (marketBp != null) said.push(`carnet ${Number(marketBp).toPrecision(4)} bp, aller-retour, ajouté une fois`);
  else if (american) said.push(`écart lu par part sur le rapport Rule 605 de la place américaine, aller-retour`);
  else said.push(`aucun carnet pour cette ligne : le total est N/A et non un total sans marché`);

  if (stamp.pct) {
    const names = Object.keys(stamp.rates).join(", ");
    said.push(
      stamp.source === "taxMap"
        ? `${names} ${pct(stamp.pct, 2)} % à l'achat, depuis taxMap.mjs — OANDA imprime encore 0,3 % pour la ` +
          `taxe française, taux d'avant avril 2025, et le document ex ante d'un autre courtier de ce dépôt ` +
          `chiffre 0,40 € sur 100 € de LVMH, donc c'est la table qui est suivie et non la brochure`
        : `${names} ${pct(stamp.pct, 2)} % à l'achat, tarif imprimé par OANDA faute de ligne dans taxMap.mjs` +
          (stamp.capped ? ` — il ne frappe qu'au-delà de ${stamp.capped}, liste que ce dépôt n'a pas` : "")
    );
  }

  if (american) {
    said.push(
      `SEC ${pct(SEC_RATE, 5)} % à la vente seulement — OANDA imprime ${pct(SEC_PRINTED, 5)} %, taux périmé, ` +
        `et c'est le taux courant qui est retenu`
    );
    said.push(
      `prélèvement FINRA écarté, et par absence plutôt que par calcul : la table d'OANDA ne nomme qu'une seule ` +
        `charge américaine, la SEC, et le droit d'activité frappe les membres de la FINRA, ce qu'une société ` +
        `polonaise n'est pas — l'ancien fichier le facturait`
    );
  }

  said.push(
    `frais de place non chiffrés : la table les renvoie « au montant fixé par les organisateurs des marchés ` +
      `réglementés », sans en donner un seul, donc ils manquent au total`
  );

  if (free) {
    const eleventh = paid ? `${Number(paid.charged).toFixed(2).replace(".", ",")} ${paid.currency} par sens` : `${pct(rule.rate, 2)} % par sens`;
    said.push(
      `commission nulle parce que le quota la couvre : ${ETF_FREE_TRADES.n} ordres sur ETF sans commission par ` +
        `mois jusqu'à ${ETF_FREE_TRADES.turnover.toLocaleString("fr-FR")} ${ETF_FREE_TRADES.ccy} de volume, et un ` +
        `aller-retour en dépense deux — mesuré le ${MEASURED.on} sur ${MEASURED.etf.shares} ${MEASURED.etf.name} ` +
        `à ${MEASURED.etf.price} €, où le solde a reculé du notionnel et de rien d'autre, puis est revenu au centime`
    );
    said.push(`au-delà du quota, le barème reprend : ${eleventh}`);
  }

  said.push(
    `hors total : garde gratuite tant que le compte a servi dans les ${INACTIVITY.after} jours, ` +
      `${INACTIVITY.amount} € par mois sinon, et 100 € par mois pour qui demande du courrier papier`
  );

  said.push(
    `deux aller-retours réels le ${MEASURED.on} sur un compte en euros : ${MEASURED.gpw.shares} ${MEASURED.gpw.name} ` +
      `à ${MEASURED.gpw.price} zł ont coûté ${MEASURED.gpw.paid} € quand ce fichier en annonçait ` +
      `${MEASURED.gpw.modelled} €, conversion au mid ∓ la marge publiée et plancher de commission compris, et ` +
      `${MEASURED.etf.shares} ${MEASURED.etf.name} n'ont rien coûté du tout — le reste est lu sur la table`
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
          plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, rules: RULE[k] }])),
          fxMargin: FX_MARGIN,
          fxCost: Object.fromEntries(
            Object.keys(FX_MARGIN).map((pair) => {
              const mid = convert(1, pair.slice(0, 3), pair.slice(3));
              return [pair, mid ? Number((100 * (FX_MARGIN[pair] / mid)).toPrecision(3)) : null];
            })
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
      "usage : node oanda_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=eur|usd|pln|ron|czk] [--json]\n" +
        "        node oanda_cost.mjs --schedule\n" +
        "  ex.   node oanda_cost.mjs AAPL --shares=10 --price=230\n" +
        "        node oanda_cost.mjs HSBA LSE GBP --shares=100 --price=9"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(`\nce que OANDA propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  const l = out.listing;
  const money = (x) => (x == null ? "N/A" : `${Number(x).toFixed(4)} $`);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}   [${planOf(out.plan)?.label}]\n`);

  if (out.trade?.shares) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${Number(t.notional).toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${Number(t.notionalUsd).toFixed(2)} $)` : "") +
        "\n"
    );
  }

  const side = (name, s) => {
    if (!s) return;
    const lines = [];
    if (s.commission != null || s.native) {
      lines.push(
        `  commission   ${money(s.commission)}` +
          (s.native ? `   (${Number(s.native.charged).toPrecision(4)} ${s.native.currency}${s.native.floored ? ", au plancher" : ""})` : "")
      );
    }
    if (s.change) lines.push(`  change       ${money(s.change)}`);
    if (s.taxes) lines.push(`  taxes        ${money(s.taxes)}`);
    if (s.réglementaire) lines.push(`  SEC          ${money(s.réglementaire)}`);
    if (s.ptm) lines.push(`  PTM          ${money(s.ptm)}`);
    if (lines.length) console.log(`${name}\n${lines.join("\n")}`);
  };
  side("achat", out.buy);
  side("vente", out.sell);
  if (out.parts?.marché != null) console.log(`marché\n  carnet       ${money(out.parts.marché)}   (aller-retour)`);

  const base = out.trade?.notionalUsd ?? null;
  console.log(`\ntotal        ${money(out.usd)}` + (out.usd != null && base ? `   soit ${((100 * out.usd) / base).toFixed(3)} % du montant` : ""));
  console.log(`frais OANDA  ${money(out.brokerFees)}` + (out.brokerFees != null && base ? `   soit ${((100 * out.brokerFees) / base).toFixed(3)} %` : ""));
  if (out.usd == null && out.why) console.log(`coût N/A — ${out.why}`);
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ").filter(Boolean)) console.log(`  ${line}`);
  if (out.remark) console.log(`\nremarque\n  ${out.remark.split("\n").join("\n  ")}`);
  if (out.url) console.log(`\n${out.url}`);
}
