// What one round trip costs at Lightyear: buy n shares at price p, sell them
// back at once, in dollars. Coins are bought by the amount, so they are handed
// that and no price.
//
// The affine triple hid the cliffs. A US share bills max($0.10, min(0.10 %, $1))
// a side; a Budapest buy bills Hungarian FTT at 0.45 % and then stops at
// 20 000 HUF. Neither is a × p × n. `roundTrip` is given the size and charges
// what is charged.
//
// Two published cards, re-read 2026-09-16 — unchanged since the 11th. Default
// is Lightyear Europe AS (`--plan=eu`). `--plan=uk` is Lightyear UK Ltd
// personal (GIA / ISA): no execution fee. UK business uses the Europe stock
// tickets and is not a third plan here.
//
//   Europe AS
//     ETF                         0
//     US stock                    0.10 %, min $0.10, max $1
//     UK stock                    £1
//     EUR stock / ETN / ETC       €1
//     other EU stock              0.10 %
//       HUF min 200 · CHF 1.50 · DKK 10 · SEK 10 · NOK 10 · PLN 5
//     crypto                      0.45 %
//     FX                          0.35 %
//   UK personal
//     stocks and ETFs             0
//     crypto                      not sold
//     FX                          0.10 %
//
// Cash can be EUR, USD and GBP (HUF too on Europe AS). Those lines have no
// FX in the total. Any other listing currency must convert, so the markup × 2
// sits in `usd` and in `brokerFees`. Stamp / FTT come from the tax map;
// Lightyear also publishes Hungarian FTT 0.45 % (cap 20 000 HUF) on Budapest
// buys, and taxMap has none of those ISINs, so that levy is taken from the
// page. SEC and FINRA TAF are on the US sell, as on their tax page — they
// name the lines and not the rates, so the current levies are used. No PTM
// on either card. Custody 0. No live trip in this deposit.
//
// Catalogue 6 784 lines (6 230 stocks, 510 ETFs, 6 ETC, 2 ETN, 36 crypto).
// US shares go to Alpaca (606). The crypto book is Kraken's, the tape
// Lightyear names; `spread.mjs` reads its public ticker under MIC KRKN.
// ETN / ETC are typed as such and take the €1 EUR-stock ticket, not the
// free ETF line. Lightyear's own money-market / Vault fee (0.10–0.15 % a
// year) is a holding cost on their cash product, not on the one iShares
// MMF that sits here as an ETF.
//
//   https://lightyear.com/en-eu/pricing
//   https://lightyear.com/en-gb/pricing
//   https://lightyear.com/en-eu/help/deposits-conversions-and-withdrawals/fees-and-taxes
//   https://lightyear.com/en-gb/help/deposits-conversions-and-withdrawals/fees-and-taxes
//
//   node lightyear/lightyear_cost.mjs IWDA
//   node lightyear/lightyear_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node lightyear/lightyear_cost.mjs TTE EURONEXT EUR --shares=1 --price=80
//   node lightyear/lightyear_cost.mjs HSBA LSE GBP --plan=uk
//   node lightyear/lightyear_cost.mjs BTC --amount=1000
//   node lightyear/lightyear_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("lightyear-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  eu: "https://lightyear.com/en-eu/pricing",
  uk: "https://lightyear.com/en-gb/pricing",
  euFees: "https://lightyear.com/en-eu/help/deposits-conversions-and-withdrawals/fees-and-taxes",
  ukFees: "https://lightyear.com/en-gb/help/deposits-conversions-and-withdrawals/fees-and-taxes",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-11",
  entity: "Lightyear Europe AS / Lightyear UK Ltd",
};

const DEFAULT_PLAN = "eu";
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const HFTT = 0.0045;
const HFTT_CAP = 20000;
const CRYPTO_RATE = 0.0045;
const ADR_PASS_THROUGH = { low: 0.01, high: 0.05 };
// Lightyear names Kraken on every coin. `spread.mjs` reads that tape under this MIC.
const KRAKEN_MIC = "KRKN";

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);

const PLANS = {
  eu: {
    id: "eu",
    label: "Lightyear Europe",
    fx: 0.0035,
    hold: new Set(["EUR", "USD", "GBP", "HUF"]),
    crypto: true,
    free: false,
  },
  uk: {
    id: "uk",
    label: "Lightyear UK",
    fx: 0.001,
    hold: new Set(["EUR", "USD", "GBP"]),
    crypto: false,
    free: true,
  },
};

const PLAN_ALIAS = {
  eu: "eu",
  europe: "eu",
  eea: "eu",
  as: "eu",
  uk: "uk",
  gb: "uk",
  gia: "uk",
  isa: "uk",
  personal: "uk",
};

// Native amounts, one way. `flat` is the whole ticket; otherwise max(min, rate × amount)
// then min(cap).
const RULE = {
  etf: { rate: 0, min: 0, currency: "EUR" },
  crypto: { rate: CRYPTO_RATE, min: 0, currency: "EUR" },
  us: { rate: 0.001, min: 0.1, cap: 1, currency: "USD" },
  uk: { flat: 1, currency: "GBP" },
  eur: { flat: 1, currency: "EUR" },
  hu: { rate: 0.001, min: 200, currency: "HUF" },
  ch: { rate: 0.001, min: 1.5, currency: "CHF" },
  dk: { rate: 0.001, min: 10, currency: "DKK" },
  se: { rate: 0.001, min: 10, currency: "SEK" },
  no: { rate: 0.001, min: 10, currency: "NOK" },
  pl: { rate: 0.001, min: 5, currency: "PLN" },
  other_eu: { rate: 0.001, min: 0, currency: "USD" },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();

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

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const ccy = String(row?.currency || "").toUpperCase();
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || ex === "CRYPTO") return "crypto";
  // ETN / ETC take the EUR-stock ticket when they are euro, not the free ETF line.
  if (type === "ETF") return "etf";
  if (US_MICS.has(m) || US_EX.has(ex)) return "us";
  if (ccy === "GBP" || ccy === "GBX") return "uk";
  if (ccy === "EUR") return "eur";
  if (ccy === "HUF") return "hu";
  if (ccy === "CHF") return "ch";
  if (ccy === "DKK") return "dk";
  if (ccy === "SEK") return "se";
  if (ccy === "NOK") return "no";
  if (ccy === "PLN") return "pl";
  return "other_eu";
}

export function ruleOf(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  if (picked.free && market !== "crypto") return { rate: 0, min: 0, currency: "USD" };
  return RULE[market] || null;
}

export function commissionEach(amount, rule) {
  if (!rule) return null;
  if (rule.flat != null) return rule.flat;
  if (amount == null || !Number.isFinite(Number(amount))) {
    return rule.min ? rule.min : rule.rate ? null : 0;
  }
  let fee = Number(amount) * (rule.rate || 0);
  if (rule.min) fee = Math.max(rule.min, fee);
  if (rule.cap != null) fee = Math.min(rule.cap, fee);
  return fee;
}

function remarkOf({ plan, market, holdable, adr, currency }) {
  const lines = [];
  if (market !== "crypto" && holdable) {
    lines.push(fxRemark((plan.fx * 100).toFixed(2), currency));
  }
  if (adr) lines.push(`ADR pass-through $${ADR_PASS_THROUGH.low}–$${ADR_PASS_THROUGH.high}/share.`);
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto[0];
    const { venue, unsourced } = listingKey(row);
    return { named, matches: [{ row, venue, unsourced }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
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
      ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(r.ticker)), mic: KRAKEN_MIC, currency: "USD" })
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
          broker: "lightyear",
          ticker: r.ticker,
        });
    const market = feeMarketOf(r, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function taxParts(isin, market) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  delete rates.PTM_LEVY;
  delete rates.HFTT;
  delete rates.HUNGARIAN_FTT;
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  return { tax, rates, taxTotal, hftt: market === "hu" };
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is Lightyear's ticket and, when the listing currency is not
 * held, the conversion.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: "",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (eu|uk)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Lightyear n'existe pas encore : lancer `node lightyear/lightyear_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Lightyear` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Lightyear`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  if (crypto && !picked.crypto) {
    return {
      ...answer,
      listing: {
        ticker: m.row.ticker || null,
        name: m.row.name || null,
        type: "CRYPTO",
        exchange: "Crypto",
        currency: String(m.row.currency || "").toUpperCase(),
      },
      onlineBuy: false,
      why: "Lightyear UK ne vend pas de crypto",
      confidence: `${picked.label} ne vend pas de crypto`,
    };
  }

  const book = crypto
    ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(m.row.ticker)), mic: KRAKEN_MIC, currency: "USD" })
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "lightyear",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Kraken" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = ruleOf(picked, market);
  if (!rule) {
    return { ...answer, listing, why: `pas de barre Lightyear pour ${listing.ticker || listing.isin} (${market})` };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us" || US_MICS.has(listing.mic);
  const { tax, rates, taxTotal, hftt } = taxParts(listing.isin, market);
  const holdable = picked.hold.has(listing.currency);
  const fxPct = holdable || crypto ? 0 : picked.fx;
  const ticketCcy = rule.currency;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: holdable ? listing.currency : "",
    onlineBuy: !(crypto && !picked.crypto),
    remark: remarkOf({ plan: picked, market, holdable, adr: listing.adr, currency: listing.currency }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (picked.id === "uk" ? SCHEDULE.ukFees : SCHEDULE.euFees),
    basis: `barème ${picked.label}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.flat != null ? 0 : rule.rate || 0,
      min: rule.min || 0,
      cap: rule.cap ?? null,
      flat: rule.flat ?? null,
      currency: ticketCcy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: holdable ? picked.fx * 2 : 0,
  };

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        rule,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: crypto ? { name: "Kraken", why: "Lightyear nomme Kraken" } : m.unsourced,
        holdable,
        fxPct,
        american,
        hftt,
        assumed: book.assumed,
        bookMic: book.mic,
      }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const nativeNotional = toCcy(notional, listing.currency, ticketCcy);
  const each = commissionEach(nativeNotional, rule);
  const commissionUsd = each == null ? null : dollars(each * 2, ticketCcy);

  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? american
          ? marketPerShare * n
          : dollars(marketPerShare * n, listing.currency)
        : null;

  const secUsd = american && notionalUsd != null ? notionalUsd * SEC_RATE : 0;
  const tafUsd = american && n > 0 ? Math.min(n * TAF_PER_SHARE, TAF_CAP) : 0;
  const taxUsd = crypto || notionalUsd == null ? (crypto ? 0 : null) : notionalUsd * taxTotal;
  const hfttNative = hftt ? Math.min((toCcy(notional, listing.currency, "HUF") ?? 0) * HFTT, HFTT_CAP) : 0;
  const hfttUsd = hftt ? dollars(hfttNative, "HUF") : 0;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;

  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, taxUsd, hfttUsd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || (crypto ? "pas de feuille crypto" : "pas de feuille de carnet")
          }`,
        }
      : {}),
    trade: {
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : null,
      taxes: finite(plus(taxUsd, hfttUsd), 6),
      change: finite(fxUsd, 6),
    },
    sell: american ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafUsd >= TAF_CAP } : null,
    hftt: hftt ? { native: finite(hfttNative, 6), currency: "HUF", usd: finite(hfttUsd, 6), capped: hfttNative >= HFTT_CAP } : null,
    confidence: confidenceOf({
      picked,
      market,
      rule,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: crypto ? { name: "Kraken", why: "Lightyear nomme Kraken" } : m.unsourced,
      holdable,
      fxPct,
      american,
      hftt,
      assumed: book.assumed,
      bookMic: book.mic,
      each,
      nativeNotional,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  rule,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  holdable,
  fxPct,
  american,
  hftt,
  assumed,
  bookMic,
  each,
  nativeNotional,
}) {
  const said = [];
  said.push(
    `barème ${picked.label} ${market}, relu le ${SCHEDULE.readOn} (inchangé depuis le ${SCHEDULE.previouslyRead})`
  );
  if (picked.free && market !== "crypto") {
    said.push(`exécution 0`);
  } else if (rule.flat != null) {
    said.push(`ticket ${rule.flat} ${rule.currency} par jambe`);
  } else {
    const floor =
      rule.min && each != null && nativeNotional != null && each === rule.min
        ? `, le plancher ${rule.min} ${rule.currency} mord`
        : rule.min
          ? `, plancher ${rule.min} ${rule.currency}`
          : "";
    const cap =
      rule.cap != null && each != null && each === rule.cap
        ? `, le plafond ${rule.cap} ${rule.currency} mord`
        : rule.cap != null
          ? `, plafond ${rule.cap} ${rule.currency}`
          : "";
    said.push(`${((rule.rate || 0) * 100).toFixed(2)} % par jambe${floor}${cap}`);
  }
  if (fxPct) {
    said.push(
      `change ${(picked.fx * 100).toFixed(2)} % × 2 : ${listing.currency} n'est pas tenue, donc dans le total`
    );
  } else if (holdable) {
    said.push(
      `change hors du total : le compte tient déjà ${listing.currency} (${(picked.fx * 100).toFixed(2)} % seulement si le cash doit traverser)`
    );
  } else if (market === "crypto") {
    said.push(`crypto cotée en ${listing.currency} : le 0,45 % est le seul frais Lightyear, pas un second change`);
  }
  if (american) {
    said.push(
      `SEC ${SEC_RATE} du montant et TAF ${TAF_PER_SHARE} $/part à la vente, plafonnée à ${TAF_CAP} $ : ` +
        `la page nomme les deux lignes sans publier les taux`
    );
  }
  if (hftt) {
    said.push(
      `FTT hongroise ${(HFTT * 100).toFixed(2)} % à l'achat, plafond ${HFTT_CAP} HUF, lue sur la page Lightyear ` +
        `(taxMap n'a aucun des 26 ISIN de Budapest)`
    );
  }
  if (marketBp != null) {
    said.push(
      `carnet ${Number(marketBp.toPrecision(4))} bp` +
        (market === "crypto" && bookMic === KRAKEN_MIC
          ? `, la touche de Kraken, relevée sur son ticker public`
          : assumed && market === "crypto"
            ? `, plus large de Binance et Coinbase : Lightyear nomme Kraken et ce fichier n'a pas cette touche`
            : "")
    );
  } else if (marketPerShare != null) {
    said.push(`carnet 605 × Q Alpaca, ${marketPerShare} $ la part`);
  } else {
    said.push(`pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}`);
  }
  said.push(`aucun aller-retour réel dans ce dépôt`);
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
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
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [k, { id: v.id, label: v.label, fx: v.fx, crypto: v.crypto, free: v.free }])
          ),
          rules: RULE,
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
      "usage : node lightyear_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--plan=eu|uk] [--json]\n" +
        "        node lightyear_cost.mjs --schedule\n" +
        "  ex.   node lightyear_cost.mjs IWDA --shares=10 --price=100\n" +
        "        node lightyear_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node lightyear_cost.mjs TTE EURONEXT EUR --shares=1 --price=80\n" +
        "        node lightyear_cost.mjs HSBA LSE GBP --plan=uk\n" +
        "        node lightyear_cost.mjs BTC --amount=1000"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Lightyear propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} ${t.currency} aller-retour\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    if (p.change) console.log(`  change         : ${p.change} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
