// What one round trip costs at Davy Select: buy n shares at price p, sell
// them back at once, online, in dollars.
//
// The affine triple this file used to answer hid the ticket. PIA is 0.50 %
// with a 14.99 € floor, and on a retail size that floor is the whole
// commission. The old file left it in a `floor` field the page had no column
// for, so every Irish or London trip under ~3 000 € was understated by
// 29.98 €. The 25 € overseas settlement sat in `c`, which at least was a
// number, but the Irish Takeover Panel 1.25 € and the PTM £1 lived only in
// `threshold`, which the page never added. FINRA's 9.79 $ TAF cap was the
// same kind of unused field. `roundTrip` is given the size and charges what
// is charged.
//
// J & E Davy, Davy Select Execution-Only. Schedule effective 1 August 2025,
// re-read 2026-09-15 — unchanged since the 10th. Default is the direct
// Personal Investment Account, online. Telephone (1.65 % / 1.00 % / 0.50 %,
// min 100 €) and bonds / options (phone only) are not this trip. Pensions
// (PRSA / PRB / ARF / EPP) wrap the same overseas card and are not a fourth
// coefficient.
//
//   PIA (direct, default)   0.50 % online, min 14.99 €
//                           + 50 € / quarter if commissions in the quarter
//                             are below that (waived by the tickets)
//   Investment Only         0.90 % / year of the balance, min 750 €
//                           (holding cost; no per-trade commission on IE/UK)
//   Trading Plus            same 0.90 %, min 500 € — intermediary schedule
//
// Instruments listed in Ireland or the UK have no overseas line. Everything
// else adds a published minimum of 0.06 % (direct / IO) or 0.10 % (Trading
// Plus) per trade, plus a 25 € foreign settlement charge per trade. "Fees
// will vary depending on overseas market dealt and broker used" — the
// printed minimum is what is copied, not a guessed higher correspondent
// bill.
//
// What is in the number: the commission each way at its floor; the overseas
// percentage and the 25 € settlement, each way, when the tape is not Irish
// or British; Irish stamp 1 % and UK stamp 0.50 % on a share purchase
// (taxMap when it has the ISIN, else the rates Davy prints — Kerry and the
// other Irish names are absent from the Trading212 sweep); French / Italian
// / Spanish FTT from the same map, never invented; ITP 1.25 € each way on
// an Irish share above 12 500 €; PTM £1 each way on a UK share above
// 10 000 £ (Davy still prints £1; the statutory levy is £1.50); current
// SEC and TAF on an American sale, TAF capped at 9.79 $; the market
// spread, once.
//
// FX is "typically will not exceed 1 %" of the converted amount. That is a
// cap, not a rate, so it stays out of the total. The 0.90 % annual dealing
// charge on IO / Trading Plus, the 50 € quarterly execution-service fee on
// PIA, ROI EFT (free) and other transfers (25–50 €) are holding or funding
// and stay in the remark. Fees are exclusive of VAT; Irish brokerage is
// ordinarily exempt and no VAT is added here.
//
// No live trip: a PIA round trip is already 29.98 € on the floor.
//
//   https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-fees-and-charges-schedule.pdf
//   https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-intermediary-clients-fees-and-charges-schedule.pdf
//
//   node davy/davy_cost.mjs IWDA --shares=1 --price=126
//   node davy/davy_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node davy/davy_cost.mjs KRZ IRISHMAIN EUR --plan=io --shares=10 --price=80
//   node davy/davy_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("davy-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source:
    "https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-fees-and-charges-schedule.pdf",
  intermediary:
    "https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-intermediary-clients-fees-and-charges-schedule.pdf",
  page: "https://www.davyselect.ie/charges/fees-and-charges.html",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
  revised: "2025-08-01",
  entity: "Davy Select (J & E Davy, IE), Execution-Only",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const IE_STAMP = 0.01;
const UK_STAMP = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const HOME_MICS = new Set(["XMSM", "XDUB", "XLON"]);
const PTM = { each: 1, currency: "GBP", above: 10000 };
const ITP = { each: 1.25, currency: "EUR", above: 12500 };
const SETTLEMENT_EUR = 25;
const UK_ISSUERS = /^(GB|JE|GG|IM)$/;

const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const issuerCc = (isin) => String(isin || "").slice(0, 2).toUpperCase();
const DEFAULT_PLAN = "pia";
const TRANSFER = { roiEft: 0, otherLow: 25, otherHigh: 50, ccy: "EUR" };

const PLANS = {
  pia: {
    id: "pia",
    label: "Personal Investment Account",
    rate: 0.005,
    min: 14.99,
    overseas: 0.0006,
    annual: null,
    annualMin: null,
    quarterly: 50,
  },
  io: {
    id: "io",
    label: "Investment Only",
    rate: 0,
    min: 0,
    overseas: 0.0006,
    annual: 0.009,
    annualMin: 750,
    quarterly: null,
  },
  tradingplus: {
    id: "tradingplus",
    label: "Trading Plus",
    rate: 0,
    min: 0,
    overseas: 0.001,
    annual: 0.009,
    annualMin: 500,
    quarterly: null,
  },
};

const PLAN_ALIAS = {
  pia: "pia",
  personal: "pia",
  personalinvestment: "pia",
  personalinvestmentaccount: "pia",
  default: "pia",
  io: "io",
  investmentonly: "io",
  investment: "io",
  tradingplus: "tradingplus",
  plus: "tradingplus",
  intermediary: "tradingplus",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

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
});

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  if (/FUNDMANAGER|NOTQUOTED/.test(code)) return "overseas";
  const m = String(mic || "").toUpperCase();
  if (HOME_MICS.has(m)) return "home";
  if (/IRISHMAIN|IRISHSTOCK|^ISE$|XDUB|XMSM/.test(code)) return "home";
  if (/LONDONMAIN|LONDONSTOCK|^LSE$|XLON|SEAQ|PLUSMARKETS/.test(code)) return "home";
  return "overseas";
}

/**
 * One side, in euro. PIA floors the 0.50 % at 14.99 €. IO / Trading Plus
 * charge nothing on an Irish or London tape and only the overseas line
 * elsewhere. Settlement is the flat 25 €, not a minimum of the 0.06 %.
 */
export function commissionSide({ amountEur, plan, market }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || amountEur == null || !Number.isFinite(Number(amountEur))) return null;
  const n = Number(amountEur);
  const overseas = market === "overseas";
  const raw = picked.rate ? n * picked.rate : 0;
  const commission = picked.rate ? Math.max(picked.min, raw) : 0;
  const overseasPct = overseas ? n * picked.overseas : 0;
  const settlement = overseas ? SETTLEMENT_EUR : 0;
  return {
    charged: commission + overseasPct + settlement,
    commission,
    overseas: overseasPct,
    settlement,
    raw,
    floored: picked.rate ? raw < picked.min : false,
    currency: "EUR",
  };
}

function remarkOf(plan) {
  const lines = [];
  if (plan.quarterly != null) {
    lines.push(`€${plan.quarterly}/quarter if commissions below €${plan.quarterly}.`);
  }
  if (plan.annual != null) {
    lines.push(`Dealing ${(plan.annual * 100).toFixed(2)}%/year, min €${plan.annualMin}.`);
  }
  lines.push("FX typically ≤1% if converted.");
  lines.push(`Withdraw €${TRANSFER.otherLow}–${TRANSFER.otherHigh} outside of Ireland.`);
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
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
 * Stamp from the tax map when Trading212 swept the ISIN. Irish and British
 * shares it never asked about still pay the rates Davy prints (1 % / 0.50 %).
 * A German name on London is not a UK share: no invented stamp.
 */
export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  if (!isStock(listing)) return { tax, rates: {}, source: null };
  const cc = issuerCc(isin);
  if (cc === "IE") return { tax, rates: { stamp: IE_STAMP }, source: "davy" };
  if (cc === "GB") return { tax, rates: { stamp: UK_STAMP }, source: "davy" };
  return { tax, rates: {}, source: null };
}

function levyEach({ listing, notional, currency }) {
  if (!isStock(listing)) return { itp: 0, ptm: 0 };
  const cc = issuerCc(listing.isin);
  const mic = String(listing.mic || "").toUpperCase();
  const irish = cc === "IE" || mic === "XMSM" || mic === "XDUB";
  const london = mic === "XLON" || /LONDON/i.test(listing.brokerExchange || listing.exchange || "");
  const british = UK_ISSUERS.test(cc) && london;
  const out = { itp: 0, ptm: 0 };
  if (irish) {
    const eur = toCcy(notional, currency, "EUR");
    if (eur == null) out.itp = null;
    else {
      out.itp = eur > ITP.above ? ITP.each : 0;
      out.itpCcy = ITP.currency;
    }
  }
  if (british) {
    const gbp = toCcy(notional, currency, "GBP");
    if (gbp == null) out.ptm = null;
    else {
      out.ptm = gbp > PTM.above ? PTM.each : 0;
      out.ptmCcy = PTM.currency;
    }
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is what Davy bills.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (pia|io|tradingplus)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Davy n'existe pas encore : lancer `node davy/davy_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Davy` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Davy`,
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
  const overseas = market === "overseas";
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf(picked),
    transfer: TRANSFER,
  };

  const basis =
    `barème Davy Select ${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}` +
    (picked.rate
      ? ` : ${(picked.rate * 100).toFixed(2)} %, plancher ${picked.min} €`
      : ` : pas de courtage par ordre sur IE/UK`) +
    (overseas ? `, overseas ${(picked.overseas * 100).toFixed(2)} % + ${SETTLEMENT_EUR} €` : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ picked, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct, taxSource }),
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

  const buy = commissionSide({ amountEur: notionalEur, plan: picked, market });
  const sell = commissionSide({ amountEur: notionalEur, plan: picked, market });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const brokerFees = plus(buyUsd, sellUsd);

  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_CAP, TAF_PER_SHARE * n) : 0;
  const levy = levyEach({ listing, notional, currency: listing.currency });
  const itpUsd = levy.itp == null ? null : dollars((levy.itp || 0) * 2, levy.itpCcy || "EUR") ?? 0;
  const ptmUsd = levy.ptm == null ? null : dollars((levy.ptm || 0) * 2, levy.ptmCcy || "GBP") ?? 0;

  const usd = plus(bookUsd, brokerFees, taxUsd, secUsd, tafUsd, itpUsd, ptmUsd);

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
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), notionalEur: finite(notionalEur, 6), currency: listing.currency },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, itpUsd, ptmUsd), 6),
    },
    levy: { itp: levy.itp, ptm: levy.ptm },
    commission: {
      rate: picked.rate || null,
      min: picked.min || null,
      overseas: overseas ? picked.overseas : 0,
      settlement: overseas ? SETTLEMENT_EUR : 0,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
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
      buy,
      n,
      american,
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
  buy,
  n,
  american,
  levy,
}) {
  const said = [];
  said.push(
    `Davy Select ${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead})`
  );
  if (picked.rate) {
    said.push(
      buy?.floored
        ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} € calculés, ${picked.min} € facturés par sens`
        : `courtage en ligne ${(picked.rate * 100).toFixed(2)} % par sens` +
          (buy ? `, ${Number(buy.commission.toPrecision(4))} €` : "")
    );
  } else {
    said.push(
      `pas de courtage par ordre sur IE/UK. Le ${(picked.annual * 100).toFixed(2)} % annuel (min ${picked.annualMin} €) reste hors du total`
    );
  }
  if (market === "overseas") {
    said.push(
      `overseas ${(picked.overseas * 100).toFixed(2)} % + ${SETTLEMENT_EUR} € de settlement par sens ` +
        `(minimum imprimé — « fees will vary depending on overseas market dealt and broker used »)`
    );
  } else {
    said.push(`cotation IE/UK : pas de ligne overseas`);
  }
  if (taxPct) {
    said.push(
      taxSource === "davy"
        ? `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant — timbre ${issuerCc(listing.isin)} que Davy imprime (cet ISIN n'est pas dans taxMap.mjs)`
        : `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs (Davy imprime 1 % IE / 0,50 % UK)`
    );
  }
  if (levy?.itp) said.push(`ITP ${ITP.each} € par sens, le montant dépasse ${ITP.above} €`);
  if (levy?.ptm) {
    said.push(
      `PTM ${PTM.each} £ par sens, le montant dépasse ${PTM.above} £ (Davy imprime encore 1 £ — le prélèvement statutaire est 1,50 £)`
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $). ` +
        `La brochure ne les nomme pas — ce sont les taux courants des autres fichiers US`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : change « typically ≤ 1 % », ` +
      (picked.quarterly != null ? `service d'exécution ${picked.quarterly} € / trimestre sous ${picked.quarterly} € de commissions, ` : "") +
      (picked.annual != null ? `dealing ${(picked.annual * 100).toFixed(2)} % / an, ` : "") +
      `virement ROI lendemain gratuit, autres ${TRANSFER.otherLow}–${TRANSFER.otherHigh} €. ` +
      `Téléphone et obligations hors de cet aller-retour. ` +
      (picked.min
        ? `Aucun aller-retour réel dans ce dépôt (un PIA fait déjà ${(picked.min * 2).toFixed(2)} € au plancher)`
        : `Aucun aller-retour réel dans ce dépôt`)
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
          settlementEur: SETTLEMENT_EUR,
          ptm: PTM,
          itp: ITP,
          transfer: TRANSFER,
          plans: PLANS,
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
      "usage : node davy_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=pia|io|tradingplus] [--json]\n" +
        "        node davy_cost.mjs --schedule\n" +
        "  ex.   node davy_cost.mjs IWDA --shares=1 --price=126\n" +
        "        node davy_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node davy_cost.mjs KRZ IRISHMAIN EUR --plan=io --shares=10 --price=80"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Davy propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
