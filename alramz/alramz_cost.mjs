// What one round trip costs at Al Ramz: buy n shares at price p, sell them back
// at once, in dollars.
//
// The affine triple this file used to answer — a × p × n + b × n + c — held the
// Al Ramz card better than most, because every venue on it charges a plain
// percentage. What it could not hold was the floor: the ticket is a minimum on
// the commission, not a fixed charge, so the old file put it in a `floor` field
// the page had no column for and left `c` at zero. On the US card that floor is
// 10 $ a side, and it is the whole bill below 5 000 $ — which is to say below
//    10// 5 000 $ the affine answer was wrong by a factor of the trade. `roundTrip` is
// given the size and charges what is actually charged.
//
// Al Ramz Capital P.J.S.C. (Abu Dhabi, SCA). The catalogue is webtrade.alramz.ae
// (`alramz_scraping.mjs`): 2 020 US lines (NYSE, NSDQ), 201 in the Emirates
// (ADX, DFM), 250 on Tadawul, 195 on the Tabadul hub (Muscat, Bahrain).
//
// Barème relu le 2026-09-14 sur la carte de commissions et, ce qui est nouveau,
// sur le barème de services de mai 2026, plus récent que la carte de février
// 2025. Commission par sens, plancher par sens, aucun plafond :
//    20//
//   DFM (AED)        courtier 0,125 + marché 0,050 + SCA 0,050 + CDS 0,050  min 10 AED
//   ADX (AED)        courtier 0,125 + marché 0,025                          sans plancher
//   DIFX (USD)       courtier 0,150 + marché 0,050 + CDS 0,050             min 3 USD
//   DIFX (AED)       courtier 0,125 + marché 0,050 + CDS 0,050             min 10 AED
//   Bahreïn (BHD)    courtier 0,2200 + marché 0,0605                       min 3,300 BHD
//   Mascate (OMR)    courtier 0,2500 + marché 0,1000                       min 1,000 OMR
//   États-Unis (USD) courtier 0,20 %, plus 0,000008 « MARKET » à la vente   min 10 USD
//
// Two things the old file got wrong, both read off the card itself.
//    30//
// The first is the asterisk. « VAT 5% on broker comm., market comm., order fees
// & CDS » names four lines and not five: the SCA levy is a regulator's charge
// and carries no VAT. The old file multiplied the whole percentage by 1,05, so
// it taxed the SCA line too. Only DFM prints an SCA that is not zero, and there
// the error is 0,0025 point per sens — small, but it is the sort of small that
// compounds into a table nobody can reconcile. The rate is now built from its
// four components and the VAT rides on the three that carry it, which also
// fixes the floor: ten dirhams floored on DFM is 10,41 AED with VAT and not
// 10,50 AED, because 0,050 of the 0,275 that make up the ticket is untaxed.
//    40//
// The second is the American sell. The card prints a MARKET line of 0,000008 on
// the sale and zero on the purchase — a sell-side ad valorem levy, which is the
// SEC Section 31 fee and nothing else; 0,000008 is exactly the rate the SEC
// charged until May 2024. The old file left that line out of the number and
// then added the current SEC rate under its own name, which came to the same
// money by accident. It is charged here as what it is, at the rate in force
// (0,0000206) rather than the stale one the card still prints, and the
// substitution is said out loud in `confidence` rather than buried.
//
//    50// FINRA's TAF is the one American levy left out. The card prints a TOTAL with
// no TAF line in it, and Al Ramz is an SCA broker reaching the US through a
// correspondent, not a FINRA member billing its own members' fees. Inventing an
// unpublished charge is worse for a model meant to be traceable than naming the
// hole, so the hole is named: if it is passed through it adds 0,000195 $ a part
// on the sale, 9,79 $ at most, which is two cents on the page's default ten
// parts.
//
// Tadawul is in the catalogue and on no card. Its 250 lines answer N/A on the
// commission, not zero.
//    60//
// What stays out of the number, in the remark, because it is not a function of
// the trade: getting the money back out. A transfer costs 5 AED from the app and
// 200 AED if it crosses a border, VAT on top.
//
// The two holding charges this file carried until 2026-09-14 are gone, because
// the schedule was read from its own table rather than from a summary of it.
// « Online and Mobile Trading Platform Access Fees » is billed at nothing in both
// the physical and the digital column; the 200 a year that had been pinned to it
// belongs to the line above, which is a request for a statement. Account
// maintenance under 200 000 AED is 25 a month on the physical column and nothing
// on the digital one, and the account this catalogue is scraped from is the app.
// So a remark that announced up to 500 AED a year of unavoidable cost announced
// a cost this account does not pay.
//
// Funding by card costs 3 %, the « ecommerce processing » line, and that one is
// out of the remark too: a bank transfer in is free, so it is a charge one picks
// rather than one the account carries.
//
// No conversion fee is published for the dirham account that buys in dollars,
//    70// which is a hole rather than a zero and is said in `confidence`. The FAQ also
// sets a minimum order value of 200 AED: below it there is no trade to price.
//
// Market spread comes from `parsed_json/spread.json` and is already a round
// trip: the Rule 605 effective spread per share in America, basis points
// elsewhere. It is added once, not per side.
//
// The Gulf used to be the whole of the hole here — every line outside America
// answered N/A because `spread.mjs` had no adapter for any of these five
// boards. Four of them turned out to publish their own touch for nothing, so
// they were wired on 2026-09-14: Abu Dhabi and Dubai read in session that day,
// Manama and Muscat waiting for theirs, since both keep a Sunday-to-Thursday
// week and were shut by the time the adapter existed. What is left is Tadawul,
// which publishes last price and volume and sells the book, so its 250 lines
// answer N/A on the spread as well as on the commission.
//
// 2 128 of the 2 666 lines now carry a book: 1 972 American, 100 on ADX, 56 on
// DFM. The rest is the honest reading of a hole and not a free trade.
//
// No live trip is in this deposit yet.
//    80//
//   https://www.alramz.ae/our-platform
//   https://www.alramz.ae/sites/default/files/2025-03/commission.pdf
//   https://www.alramz.ae/sites/default/files/2026-05/AL_RAMZ_SERVICE_FEES_V4%20(2).pdf
//   https://alramz.ae/index.php/faqs
//
//   node alramz/alramz_cost.mjs VOO
//   node alramz/alramz_cost.mjs GLD NYSE USD --shares=1 --price=400
//   node alramz/alramz_cost.mjs --schedule
//
//    90// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("alramz-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.alramz.ae/our-platform",
  pdf: "https://www.alramz.ae/sites/default/files/2025-03/commission.pdf",
  services: "https://www.alramz.ae/sites/default/files/2026-05/AL_RAMZ_SERVICE_FEES_V4%20(2).pdf",
  faqs: "https://alramz.ae/index.php/faqs",
  readOn: "2026-09-14",
  pageUpdated: "2025-02-24",
  servicesUpdated: "2026-05-30",
  entity: "Al Ramz Capital P.J.S.C. (AE, SCA)",
};

const SEC_RATE = 0.0000206;
// What the card still prints on the American sell. Kept so the gap with the
// rate in force can be shown rather than asserted.
const CARD_SELL_LEVY = 0.000008;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const VAT = 0.05;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// Holding costs, from the May 2026 service schedule. VAT on top of each.
// Read off the services schedule rather than off its summary, which is where the two
// figures this file used to carry came from and where they were wrong. Platform access
// is billed at nothing in both columns; the 200 a year belongs to the line above it,
// which is a request for a statement. Account maintenance is 25 a month only on the
// physical column, and the account this catalogue is scraped from is the app.
//
// What is left is getting the money out, which nobody avoids: a transfer costs 5 AED
// from the app, 200 AED if it crosses a border. Funding by card costs 3 % — the
// « ecommerce processing » line — but a bank transfer in costs nothing, so it is a
// charge one chooses and not one the account carries.
const WITHDRAW = { transfer: 5, crossBorder: 200, ccy: "AED" };
const CARD_FUNDING = 0.03;
const MIN_ORDER = { amount: 200, ccy: "AED" };

// Per side, as the card breaks it down. `vat` says whether the UAE asterisk
// applies at all; within a market it never applies to the SCA line.
const RULE = {
  dfm: { broker: 0.00125, market: 0.0005, sca: 0.0005, cds: 0.0005, min: 10, ccy: "AED", vat: true },
  adx: { broker: 0.00125, market: 0.00025, sca: 0, cds: 0, min: 0, ccy: "AED", vat: true },
  difx_usd: { broker: 0.0015, market: 0.0005, sca: 0, cds: 0.0005, min: 3, ccy: "USD", vat: true },
  difx_aed: { broker: 0.00125, market: 0.0005, sca: 0, cds: 0.0005, min: 10, ccy: "AED", vat: true },
  bahrain: { broker: 0.0022, market: 0.000605, sca: 0, cds: 0, min: 3.3, ccy: "BHD", vat: false },
  muscat: { broker: 0.0025, market: 0.001, sca: 0, cds: 0, min: 1, ccy: "OMR", vat: false },
  us: { broker: 0.002, market: 0, sca: 0, cds: 0, min: 10, ccy: "USD", vat: false },
};

const TO_VENUES = {
  ADSM: "ADX",
  DIFX: "NASDAQDUBAI",
  NSDQ: "NASDAQ",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

// Money in `to`, from an amount in `from`.
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = String(from || "").toUpperCase();
  const b = String(to || "").toUpperCase();
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });

const ratesOf = (rule) => ({
  // The four lines the VAT asterisk names, and the one it does not.
  vatable: rule.broker + rule.market + rule.cds,
  plain: rule.sca,
  total: rule.broker + rule.market + rule.cds + rule.sca,
});

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NSDQ|NYSE|AMEX|ARCA|BATS)$/.test(code)) return "us";
  if (code === "DFM" || m === "XDFM") return "dfm";
  if (code === "ADX" || code === "ADSM" || m === "XADS") return "adx";
  if (code === "DIFX" || code === "NASDAQDUBAI" || code === "NASDAQDXB") {
    return ccy === "AED" ? "difx_aed" : "difx_usd";
  }
  if (code === "BAHRAIN" || code === "BHB" || code === "XBAH" || code === "BAHRAINBOURSE") return "bahrain";
  if (code === "MUSCAT" || code === "MSM" || code === "MSX" || code === "XMUS") return "muscat";
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(TO_VENUES[m.row.exchange] || "").includes(wantPlace);
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
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market || "hors carte"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * One side of the trade, in the currency the card quotes that market in.
 * The floor is per transaction, so a round trip pays it twice.
 */
export function commissionSide({ amount, market }) {
  const rule = RULE[market];
  if (!rule) return null;
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const { vatable, plain, total } = ratesOf(rule);
  const raw = Number(amount) * total;
  const base = Math.max(rule.min, raw);
  // The card does not say how a floored ticket splits between its four lines,
  // so the split of the rate is carried over to the floor. On every market but
  // DFM the SCA line is zero and the question does not arise.
  const taxedShare = total > 0 ? vatable / total : 0;
  const vat = rule.vat ? base * taxedShare * VAT : 0;
  // The share of the ticket Al Ramz keeps. The other three lines are named after
  // the exchange, the depository and the SCA, and no broker can forgive any of
  // them; the VAT on the broker line goes to the state but exists only because
  // the commission does. A floored ticket is split the same way as the rate, for
  // want of a card that says otherwise.
  const brokerShare = total > 0 ? rule.broker / total : 0;
  const broker = base * brokerShare * (1 + (rule.vat ? VAT : 0));
  return {
    raw,
    base,
    vat,
    charged: base + vat,
    broker,
    currency: rule.ccy,
    floored: raw < rule.min,
    taxedShare,
    brokerShare,
  };
}

// The remark carries what the number does not. Every trading charge — the four
// commission lines, the VAT on three of them, the floor, the American levy — is
// in `usd` and broken out under `buy` and `sell`. What is left is the cost of
// taking the money back out, which is not a function of the trade and which no
// holder escapes.
const REMARK =
  `Withdrawal ${WITHDRAW.transfer} ${WITHDRAW.ccy} by transfer, ` +
  `${WITHDRAW.crossBorder} ${WITHDRAW.ccy} across a border (VAT on top).`;

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `buy` and `sell` say what each side paid.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const base = { usd: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return {
      ...base,
      why: "le catalogue Al Ramz n'existe pas encore : lancer `node alramz/alramz_scraping.mjs` avec webtrade.alramz.ae ouvert",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...base, why: `${etf} n'est pas dans le catalogue Al Ramz` };
  if (!matches.length) {
    return {
      ...base,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Al Ramz`,
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

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const rule = RULE[market];
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";

  const answer = {
    ...base,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    fx: fxNote(listing.currency),
    remark: REMARK,
  };

  // Tadawul is reachable through the app and priced on no published card.
  if (!market || !rule) {
    return {
      ...answer,
      basis: `aucun barème publié pour ${listing.exchange || m.row.exchange}`,
      why: `${listing.exchange || m.row.exchange} n'est pas sur la carte Al Ramz : commission inconnue`,
      tax: taxesOf(listing.isin),
    };
  }

  const { vatable, plain, total } = ratesOf(rule);
  const basis =
    `barème Al Ramz ${market} relu le ${SCHEDULE.readOn} (carte ${SCHEDULE.pageUpdated}) : ` +
    `${(100 * total).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} % par sens` +
    (rule.min ? `, plancher ${rule.min} ${rule.ccy}` : `, sans plancher`) +
    (!rule.vat
      ? ""
      : plain > 0
        ? `, TVA 5 % sur ${(100 * vatable).toFixed(3)} % des ${(100 * total).toFixed(3)} % (la SCA n'est pas taxée)`
        : `, TVA 5 % dessus`);

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...answer,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const notionalInRule = convert(notional, listing.currency, rule.ccy);

  // The book is already a round trip — Rule 605 per share in America, basis
  // points elsewhere — so it is added once, not per side.
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buyComm = commissionSide({ amount: notionalInRule, market });
  const sellComm = commissionSide({ amount: notionalInRule, market });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  // Nothing in `taxMap.mjs` touches a Gulf or American line today, but a stamp
  // duty is a fact about the instrument and the reader may point this file at
  // an ISIN that carries one.
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxRate = Object.values(rates).reduce((s, r) => s + r, 0);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxRate;

  // The card's sell-side MARKET line, at the rate the SEC charges now rather
  // than the one printed in February 2025. A levy we cannot convert is a levy
  // we cannot price: zero would say the sale escaped it.
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, taxUsd, secUsd);
  // What the broker keeps, told apart from the total because the page prints the
  // two side by side. A free trade, a discount, a plan waives a commission and
  // nothing else: the book belongs to whoever quoted it, the transaction taxes
  // to a treasury, the regulatory levies to a regulator, and no broker can
  // forgive any of them. A remark about free trades next to a single number
  // would read as if it did.
  //
  // That is the courtier line alone, not the whole ticket. The card breaks DFM
  // into courtier 0,125 + marché 0,050 + SCA 0,050 + CDS 0,050, and the last
  // three are the exchange's, the regulator's and the depository's money: BHM,
  // on the same exchange, reverses the same 0,150 under its own labels and keeps
  // the same 0,125. Counting all four here said Al Ramz took twice what it does
  // and made the column mean one thing on this file and another elsewhere.
  // La TVA émiratie est assise sur la commission et disparaît avec elle,
  // donc elle est comptée ici : `broker` la porte déjà.
  const brokerFees = plus(
    buyComm ? dollars(buyComm.broker, buyComm.currency) : null,
    sellComm ? dollars(sellComm.broker, sellComm.currency) : null
  );
  const belowMinOrder = (() => {
    const inAed = convert(notional, listing.currency, MIN_ORDER.ccy);
    return inAed == null ? null : inAed < MIN_ORDER.amount;
  })();

  return {
    ...answer,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buyComm
        ? {
            charged: finite(buyComm.charged, 6),
            raw: finite(buyComm.raw, 6),
            vat: finite(buyComm.vat, 6),
            floored: buyComm.floored,
            currency: buyComm.currency,
          }
        : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      native: sellComm
        ? {
            charged: finite(sellComm.charged, 6),
            raw: finite(sellComm.raw, 6),
            vat: finite(sellComm.vat, 6),
            floored: sellComm.floored,
            currency: sellComm.currency,
          }
        : null,
      sec: finite(secUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyCommUsd, sellCommUsd), 6),
      tva: rule.vat ? finite(plus(dollars(buyComm?.vat, rule.ccy), dollars(sellComm?.vat, rule.ccy)), 6) : 0,
      taxes: finite(taxUsd, 6),
      réglementaire: american ? finite(secUsd, 6) : 0,
    },
    tax,
    commission: {
      broker: rule.broker,
      market: rule.market,
      sca: rule.sca,
      cds: rule.cds,
      total,
      min: rule.min,
      currency: rule.ccy,
      vat: rule.vat ? VAT : 0,
      vatOn: rule.vat ? vatable : 0,
      eachWay: true,
    },
    account: { withdraw: WITHDRAW, cardFunding: CARD_FUNDING },
    minOrder: { ...MIN_ORDER, below: belowMinOrder },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      vatable,
      plain,
      total,
      marketBp,
      marketPerShare,
      taxRate,
      american,
      unsourced: m.unsourced,
      buyComm,
      belowMinOrder,
      n,
    }),
  };
}

function confidenceOf({
  market,
  rule,
  vatable,
  plain,
  total,
  marketBp,
  marketPerShare,
  taxRate,
  american,
  unsourced,
  buyComm,
  belowMinOrder,
  n,
}) {
  const said = [];
  said.push(
    `commission Al Ramz, palier ${market}, lue le ${SCHEDULE.readOn} sur la carte du ${SCHEDULE.pageUpdated}, ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  said.push(
    `décomposée comme la carte la décompose : courtier ${(100 * rule.broker).toFixed(3)} %` +
      (rule.market ? ` + marché ${(100 * rule.market).toFixed(4).replace(/0+$/, "")} %` : "") +
      (rule.sca ? ` + SCA ${(100 * rule.sca).toFixed(3)} %` : "") +
      (rule.cds ? ` + CDS ${(100 * rule.cds).toFixed(3)} %` : "")
  );
  if (rule.vat) {
    said.push(
      plain > 0
        ? `TVA 5 % sur le courtier, le marché et le CDS seulement — l'astérisque de la carte ne nomme pas la SCA, ` +
          `donc ${(100 * vatable).toFixed(3)} % des ${(100 * total).toFixed(3)} % sont taxés et ${(100 * plain).toFixed(3)} % ne le sont pas`
        : `TVA 5 % sur toute la commission : ce marché n'a pas de ligne SCA`
    );
  } else {
    said.push(`hors bloc local : ni la carte Tabadul ni la carte américaine ne portent l'astérisque de TVA`);
  }
  if (buyComm) {
    said.push(
      buyComm.floored
        ? `le plancher mord : ${Number(buyComm.raw.toPrecision(3))} ${buyComm.currency} calculés, ` +
          `${Number(buyComm.charged.toPrecision(6))} ${buyComm.currency} facturés par sens`
        : `au-dessus du plancher : ${Number(buyComm.charged.toPrecision(4))} ${buyComm.currency} par sens`
    );
  }
  if (rule.min) {
    said.push(
      `la carte imprime « ${rule.min} Minimum » sous le total et répète le même chiffre dans la colonne voisine ` +
        `de chaque bloc : lu comme un plancher par transaction, donc deux fois sur l'aller-retour`
    );
  }
  if (american) {
    said.push(
      `la carte porte une ligne MARKET de ${CARD_SELL_LEVY} à la vente et zéro à l'achat : c'est la taxe SEC, ` +
        `et ${CARD_SELL_LEVY} était son taux jusqu'en mai 2024. Facturée ici au taux en vigueur ${SEC_RATE}, ` +
        `soit ${Number(((SEC_RATE - CARD_SELL_LEVY) * 1e4).toPrecision(2))} bp de plus que ce que la carte imprime`
    );
    said.push(
      `la TAF FINRA n'est sur aucune ligne de la carte et n'est pas facturée ici — si elle est répercutée, ` +
        `elle ajoute ${TAF_PER_SHARE} $ par part à la vente, ${TAF_CAP} $ au plus, soit ` +
        `${Number((TAF_PER_SHARE * n).toPrecision(2))} $ à ${n} parts`
    );
  }
  if (taxRate) said.push(`taxe à l'achat ${(100 * taxRate).toFixed(2)} % du montant`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
    if (marketPerShare > 0.01) {
      said.push(`ATTENTION carnet large : sous 100 parts l'amélioration de ce chiffre n'a souvent pas lieu`);
    }
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || "cette place"}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est nul faute de mesure, pas faute de frais`
    );
  }
  if (belowMinOrder) {
    said.push(
      `sous le minimum d'ordre de ${MIN_ORDER.amount} ${MIN_ORDER.ccy} annoncé en FAQ : ` +
        `à cette taille il n'y a pas d'ordre à passer`
    );
  }
  said.push(
    `aucun frais de conversion n'est publié pour un compte en dirhams qui achète en dollars : ` +
      `c'est un trou et non un zéro, et il ne peut qu'augmenter le total américain`
  );
  said.push(
    `hors total, barème de services du ${SCHEDULE.servicesUpdated} : le retrait coûte ` +
      `${WITHDRAW.transfer} ${WITHDRAW.ccy} par virement et ${WITHDRAW.crossBorder} ${WITHDRAW.ccy} ` +
      `hors frontière, TVA en sus — l'accès à la plateforme est à zéro dans les deux colonnes ` +
      `et la tenue de compte n'est facturée que sur la colonne physique, le compte scrapé ici ` +
      `étant celui de l'application`
  );
  said.push(`aucun aller-retour réel chez Al Ramz dans ce dépôt`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rules: RULE, account: { withdraw: WITHDRAW, cardFunding: CARD_FUNDING }, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node alramz_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node alramz_cost.mjs --schedule\n" +
        "  ex.   node alramz_cost.mjs VOO\n" +
        "        node alramz_cost.mjs GLD NYSE USD --shares=1 --price=400"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Al Ramz propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);

  if (out.usd == null) {
    console.log(`coût N/A — ${out.why || "carnet manquant"}`);
    if (out.basis) console.log(`  ${out.basis}`);
    process.exit(0);
  }

  const t = out.trade;
  const money = (x) => (x == null ? "N/A" : `${Number(x).toFixed(4)} $`);
  console.log(
    `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` +
      `${t.notional.toFixed(2)} ${t.currency}` +
      (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
      `\n`
  );
  const native = (side) =>
    side.native
      ? `   (${Number(side.native.charged.toPrecision(6))} ${side.native.currency}` +
        (side.native.vat ? `, dont ${Number(side.native.vat.toPrecision(3))} de TVA` : "") +
        (side.native.floored ? ", plancher" : "") +
        `)`
      : "";
  console.log(`achat`);
  console.log(`  commission   ${money(out.buy.commission)}${native(out.buy)}`);
  if (out.buy.taxes) console.log(`  taxes        ${money(out.buy.taxes)}   (${Object.keys(out.buy.taxRates || {}).join(", ")})`);
  console.log(`vente`);
  console.log(`  commission   ${money(out.sell.commission)}${native(out.sell)}`);
  if (out.sell.sec) console.log(`  SEC          ${money(out.sell.sec)}`);
  console.log(`marché`);
  console.log(`  carnet       ${money(out.parts.marché)}   (aller-retour)`);
  console.log(
    `\ntotal        ${money(out.usd)}` +
      (t.notionalUsd ? `   soit ${((100 * out.usd) / t.notionalUsd).toFixed(3)} % du montant` : "")
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const line of out.remark.split("\n")) console.log(`  ${line}`);
  if (out.url) console.log(`\n${out.url}`);
}
