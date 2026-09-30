// What one round trip costs at Scalable Capital: buy n shares at price p, sell
// them back at once (online, cash account, no leverage), in dollars. A coin is
// bought by the dollar instead, and answers to `amount`.
//
// The affine triple hid the €250 cliff. A €200 EIX buy pays 0.99 € on every
// plan; the same line at €250 is free on PRIME+ and, if it is a PRIME ETF, free
// on the FREE buy as well. `roundTrip` is given the size and charges what is
// charged.
//
// Scalable Capital Bank GmbH (DE), re-read 2026-09-16. Two plans, FREE by
// default; PRIME+ is 4.99 €/month. The French, Austrian, Italian, Spanish and
// Dutch sites print the same tickets. CFDs, futures, options, bonds, mutual
// funds, FX pairs, ELTIFs and the Wealth mandate are not this trip.
//
//   EIX (Hanover / SEIX)   FREE 0.99 € ; PRIME+ 0 if ≥ 250 € else 0.99 €
//   gettex (Munich)        1.99 € on both plans, since 2026-09-01
//   Xetra                  1.99 € on both plans, venue fees waived
//
// FREE also waives the *buy* of a PRIME ETF (every Amundi, iShares, Vanguard
// or Xtrackers ETF) from 250 €, on EIX only. The sell is still 0.99 €. The
// waiver never applies on gettex or Xetra — Handelsblatt and the 16 Sept.
// trading page say so in as many words. Savings-plan executions are 0 on
// every plan and are not this trip.
//
// Crypto is sold as physically backed ETPs, not as native coins. The app's
// coin shelf (25 tickers, no ISIN) is that product: the FAQ names EIX,
// gettex and Xetra as the books. The published surcharge is 0.99 % FREE /
// 0.69 % PRIME+ each way, on top of the ticket, and it is what Scalable
// bills — so it sits in `brokerFees`. The coin-shelf book is 0: the
// surcharge *is* the spread they print, and inventing Binance under it would
// be a neighbour's tape. An ISIN crypto ETP keeps its venue book and adds
// the same surcharge.
//
// The ticket and the surcharge are in the number, so they stay out of the
// remark. PRIME+ names its 4.99 €/month; FREE does not print 0 €/month.
// Custody is 0. Instant deposits (0.99 % / 0.69 %, free above 5 000 €) are
// funding, not the trip. Cash is euro and the whole catalogue is euro, so
// there is no FX to put in the total or the remark.
//
// Stamp / FTT come from the tax map by ISIN. SEC, TAF, CAT and PTM are not
// published on these German books and are not invented. The catalogue has
// no Xetra quote today (10 066 EIX, 2 437 gettex, 25 crypto); Xetra is
// still a priced venue because the page still sells it.
//
//   https://de.scalable.capital/en/trading
//   https://de.scalable.capital/en/trading-costs
//   https://de.scalable.capital/kryptowaehrung
//   https://fr.scalable.capital/en/trading
//
//   node scalablecapital/scalablecapital_cost.mjs EUNL --shares=10 --price=100
//   node scalablecapital/scalablecapital_cost.mjs APC XMUN EUR --shares=10 --price=200
//   node scalablecapital/scalablecapital_cost.mjs BTC --amount=1000 --plan=prime
//   node scalablecapital/scalablecapital_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("scalablecapital-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://de.scalable.capital/en/trading",
  costs: "https://de.scalable.capital/en/trading-costs",
  crypto: "https://de.scalable.capital/kryptowaehrung",
  fr: "https://fr.scalable.capital/en/trading",
  readOn: "2026-09-16",
  gettexFrom: "2026-09-01",
  entity: "Scalable Capital Bank GmbH (DE)",
};

const DEFAULT_PLAN = "free";
const CASH = "EUR";
const FLAT_ABOVE = 250;
const EIX_TICKET = 0.99;
const VENUE_TICKET = 1.99;
const PRIME_MONTH = 4.99;

const PLANS = {
  free: { id: "free", label: "FREE", month: 0, crypto: 0.0099 },
  prime: { id: "prime", label: "PRIME+", month: PRIME_MONTH, crypto: 0.0069 },
};
const PLAN_ALIAS = {
  free: "free",
  default: "free",
  standard: "free",
  retail: "free",
  prime: "prime",
  primeplus: "prime",
  plus: "prime",
};

const PRIME_ISSUER = /\b(Amundi|iShares|Vanguard|Xtrackers)\b/i;
const CRYPTO_ISSUER = /\b(21Shares|CoinShares Physical|Bitwise Physical|Galaxy Physical)\b/i;
const CRYPTO_ASSET = /\b(Bitcoin|Ethereum|Solana|Litecoin|Ripple|Cardano|Polkadot)\b/i;
const CRYPTO_WRAPPER = /\b(ETC|ETN|ETP)\b/i;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
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
    .replace(/[^a-z0-9+]/g, "")
    .replace(/\+/g, "plus");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function isCryptoRow(row) {
  return code(row?.type) === "CRYPTO" || code(row?.type) === "CRYPTO_ETP";
}

export function isPrimeEtf(row) {
  return code(row?.type) === "ETF" && PRIME_ISSUER.test(String(row?.name || ""));
}

export function isCryptoEtp(row) {
  if (isCryptoRow(row)) return true;
  const name = String(row?.name || "");
  if (CRYPTO_ISSUER.test(name)) return true;
  return CRYPTO_ASSET.test(name) && CRYPTO_WRAPPER.test(name);
}

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const flat = loose(row?.exchange);
  const m = code(mic);

  if (isCryptoRow(row) && (raw === "CRYPTO" || !raw)) return "eix";
  if (raw === "SEIX" || flat === "EIX" || ["HANC", "HAND"].includes(raw)) return "eix";
  if (["SEIX", "EIX", "HANC", "HAND"].includes(m)) return "eix";
  if (raw === "XMUN" || raw === "MUNC" || /GETTEX/.test(flat) || m === "XMUN") return "gettex";
  if (raw === "XETR" || m === "XETR") return "xetra";
  return null;
}

export function ticketEach({ market, plan = DEFAULT_PLAN, notionalEur, side, primeEtf }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  if (market === "gettex" || market === "xetra") return VENUE_TICKET;
  if (market !== "eix") return null;
  if (notionalEur == null || !Number.isFinite(Number(notionalEur))) return EIX_TICKET;
  const above = Number(notionalEur) >= FLAT_ABOVE;
  if (picked.id === "prime" && above) return 0;
  if (picked.id === "free" && side === "buy" && primeEtf && above) return 0;
  return EIX_TICKET;
}

function remarkOf(plan) {
  return plan?.month ? `${plan.month} €/month.` : "";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCryptoRow(r) && loose(r.ticker) === asked;
  });

  const crypto = named.filter(isCryptoRow);
  if (crypto.length && (!place || /crypto/i.test(String(place)))) {
    return { named, matches: [{ row: crypto[0], ...listingKey(crypto[0]) }] };
  }

  const equities = named.filter((r) => !isCryptoRow(r));
  const exactCode = wantPlace ? equities.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : equities;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantUnsourced && m.unsourced) return m.unsourced.name === wantUnsourced.name;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

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
    const book = isCryptoRow(r)
      ? { leaf: { bp: 0 }, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
        });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
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
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling them straight back. `usd` is the number the page prints;
 * `brokerFees` is only Scalable's ticket and, on a crypto ETP, its surcharge.
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
    cashCurrency: CASH,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (free|prime)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Scalable n'existe pas encore : lancer `node scalablecapital/scalablecapital_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Scalable` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Scalable`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCryptoRow(m.row);
  const cryptoEtp = isCryptoEtp(m.row);
  const primeEtf = isPrimeEtf(m.row);
  const book = crypto
    ? { leaf: { bp: 0 }, mic: null }
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
    type: crypto ? "CRYPTO" : m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto
      ? "European Investor Exchange (EIX)"
      : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
    primeEtf,
    cryptoEtp,
  };
  const market = feeMarketOf(m.row, listing.mic);
  if (!market) {
    return {
      ...answer,
      listing,
      remark: remarkOf(picked),
      why: `${listing.brokerExchange || listing.exchange} n'est pas une place tarifée chez Scalable (EIX, gettex, Xetra)`,
    };
  }

  const leaf = book.leaf;
  const marketBp = crypto ? 0 : bp ?? leaf?.bp ?? null;
  const marketPerShare = crypto ? null : perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { known: true, buy: {}, sell: {} } : taxesOf(listing.isin);
  const stamp = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: CASH,
    onlineBuy: true,
    venueAuthoritative: crypto,
    remark: remarkOf(picked),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (cryptoEtp ? SCHEDULE.crypto : SCHEDULE.source),
    basis: `barème Scalable ${picked.label}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      kind: "ticket",
      eix: EIX_TICKET,
      venue: VENUE_TICKET,
      above: FLAT_ABOVE,
      currency: CASH,
      eachWay: true,
      plan: picked.id,
      crypto: cryptoEtp ? picked.crypto : 0,
      primeEtf,
    },
    ccy: QUOTE,
    fx: fxNote(CASH),
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  const a = Number(amount);
  const sized = crypto ? a > 0 : n > 0 && p > 0;
  if (!sized) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant pour cette crypto"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        unsourced: m.unsourced,
        crypto,
        cryptoEtp,
        primeEtf,
        stamp,
      }),
    };
  }

  const notionalUsd = crypto ? a : dollars(n * p, listing.currency);
  const notionalEur = notionalUsd == null ? null : notionalUsd / (usdPer(CASH) || NaN);
  const nativeNotional = crypto ? notionalEur : n * p;
  if (notionalEur == null || !Number.isFinite(notionalEur)) {
    return { ...shared, why: "le montant n'a pas pu être converti en euros" };
  }

  const buyTicket = ticketEach({ market, plan: picked, notionalEur, side: "buy", primeEtf });
  const sellTicket = ticketEach({ market, plan: picked, notionalEur, side: "sell", primeEtf });
  const ticketsEur = plus(buyTicket, sellTicket);
  const surchargeEur = cryptoEtp ? picked.crypto * notionalEur * 2 : 0;
  const commissionUsd = ticketsEur == null ? null : dollars(plus(ticketsEur, surchargeEur), CASH);

  const bookUsd = crypto
    ? 0
    : marketPerShare != null
      ? dollars(marketPerShare * n, listing.currency)
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = crypto || notionalUsd == null ? 0 : notionalUsd * stamp;
  const usd = plus(bookUsd, commissionUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
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
      amount: crypto ? a : null,
      notional: nativeNotional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: crypto ? QUOTE : listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    tickets: {
      buy: buyTicket,
      sell: sellTicket,
      surcharge: cryptoEtfRate(picked, cryptoEtp),
      currency: CASH,
    },
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      unsourced: m.unsourced,
      crypto,
      cryptoEtp,
      primeEtf,
      stamp,
      notionalEur,
      buyTicket,
      sellTicket,
    }),
  };
}

function cryptoEtfRate(plan, cryptoEtp) {
  return cryptoEtp ? plan.crypto : 0;
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  unsourced,
  crypto,
  cryptoEtp,
  primeEtf,
  stamp,
  notionalEur,
  buyTicket,
  sellTicket,
}) {
  const said = [];
  said.push(
    `Scalable ${picked.label}, palier ${market}, barème relu le ${SCHEDULE.readOn}` +
      (market === "gettex" ? ` (1,99 € depuis le ${SCHEDULE.gettexFrom} ; la remise EIX ne s'applique plus)` : "")
  );
  if (buyTicket != null && sellTicket != null) {
    said.push(
      `ticket achat ${buyTicket} €, vente ${sellTicket} €` +
        (notionalEur != null ? ` sur ${Number(notionalEur.toPrecision(6))} €` : "")
    );
  } else if (market === "eix") {
    said.push(`ticket EIX ${EIX_TICKET} €, ou 0 au-dessus de ${FLAT_ABOVE} € selon le plan et le sens`);
  } else {
    said.push(`ticket ${VENUE_TICKET} € par jambe, sans remise PRIME`);
  }
  if (primeEtf && market === "eix" && picked.id === "free" && buyTicket === 0) {
    said.push(`PRIME ETF : l'achat est offert, la vente reste à ${EIX_TICKET} €`);
  }
  if (cryptoEtp) {
    said.push(
      `surcharge crypto ${(picked.crypto * 100).toFixed(2)} % par jambe, dans le total` +
        (crypto
          ? " — le rayon crypto de l'app est un ETP, pas une pièce native"
          : "")
    );
  }
  if (crypto) {
    said.push(
      `carnet 0 : Scalable publie sa propre surcharge, ce n'est pas le carnet Binance / Coinbase`
    );
  } else if (marketBp != null) {
    said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  } else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf && !crypto) said.push(`carnet absent pour cette ligne`);
  if (stamp) {
    said.push(`taxe de transfert ${(100 * stamp).toFixed(2)} % prise dans la carte des taxes`);
  }
  said.push(`caisse et cotation en euro, pas de change dans le trajet`);
  said.push(`SEC / TAF / CAT / PTM non publiés sur ces carnets allemands, donc omis`);
  said.push(`les exécutions de sparplan sont à 0 et ne sont pas ce trajet`);
  if (picked.month) said.push(`abonnement ${picked.month} € / mois, hors du total`);
  said.push(`aucun aller-retour réel dans ce dépôt`);
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
          plans: PLANS,
          tickets: { eix: EIX_TICKET, gettex: VENUE_TICKET, xetra: VENUE_TICKET, above: FLAT_ABOVE },
          cash: CASH,
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
      "usage : node scalablecapital/scalablecapital_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "                          [--amount=usd] [--plan=free|prime] [--json]\n" +
        "        node scalablecapital/scalablecapital_cost.mjs --schedule\n" +
        "  ex.   node scalablecapital/scalablecapital_cost.mjs EUNL --shares=10 --price=100\n" +
        "        node scalablecapital/scalablecapital_cost.mjs APC XMUN EUR --shares=10 --price=200\n" +
        "        node scalablecapital/scalablecapital_cost.mjs BTC --amount=1000 --plan=prime"
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
      console.log(`\nce que Scalable propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} ${t.currency} aller-retour` + (t.notionalEur != null ? ` (${t.notionalEur.toFixed(2)} €)\n` : "\n"));
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${Number(t.notional).toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
