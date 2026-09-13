// What one round trip costs at Revolut: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// One entity, five plans plus an add-on, read 2026-09-12. Investment services
// are Revolut Securities Europe UAB (Vilnius); the crypto in the app is Revolut
// Digital Assets Europe Ltd. Three published cards, one per instrument family:
//
//   EEA stock               0.25 %, min €1 per leg   (Ultra and Pro 0.12 %)
//   US stock                0.25 %, min €1 per leg   (Ultra and Pro 0.12 %)
//                           plus SEC and FINRA TAF on the sell
//   EEA ETF / ETC / ETN     0.10 % per leg, every plan, no minimum
//   crypto                  1.49 % (Standard, Plus), 0.99 % (Premium, Metal),
//                           0.49 % (Ultra), or a stepped minimum under €200
//
// Two order tickets read in the app on 2026-09-12 settle what the cards do not
// say, and both are recorded below rather than assumed: a stablecoin bought with
// its own currency costs nothing, and the crypto price itself carries a markup
// the ticket never names.
//
// Custody is 0: Revolut charged 0.12 % a year until 13 February 2024 and then
// removed it, so a pre-2024 reading of this broker is wrong by the largest term
// it used to have. There are no entry, exit or inactivity charges either.
//
// The published % × 2 sits in `a`, the €1 minimum in `floor`. Two things this
// shape cannot hold, and which are stated rather than folded in:
//
//   The free allowance. Every plan grants commission-free trades each rolling
//   month — Standard 1, Plus 3, Premium 5, Metal and Ultra 10. What this file
//   prices is the marginal round trip, both legs charged, because a round trip
//   is two orders and even the first one on Standard already spends the whole
//   monthly grant on one leg. A reader whose allowance is untouched pays less.
//
//   The FX allowance. Orders execute in the currency of the venue — EUR for the
//   Tradegate lines, USD for NASDAQ and NYSE — and the account can hold both, so
//   no conversion is forced and the markup stays out of `a`. Above €1 000 a
//   month it is 1 % on Standard and 0.5 % on Plus, nothing on Premium, Metal and
//   Ultra. It is reported in `fxIfConverted`.
//
// SEC and FINRA are pass-through government rates, identical at every broker, so
// the figures here are the current ones this repository uses everywhere else
// rather than the ones Revolut's PDF prints. Those disclosures still quote SEC
// $27.80 per million and TAF $0.000166 per share capped at $8.30, which are the
// previous schedules; taking them literally would make Revolut look dearer than
// its neighbours for a reason that is about the age of a document, not a price.
//
//   https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-EEA-stocks-v3.0.pdf
//   https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-US-stocks-v6.0.pdf
//   https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-ETFs-v6.0-LT-EN.pdf
//   https://www.revolut.com/en-FR/legal/exchangingcryptocurrenciespersonalfees/
//
//   node revolut/revolut_cost.mjs AAPL
//   node revolut/revolut_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node revolut/revolut_cost.mjs IWDA TRADEGATE EUR --plan=ultra
//   node revolut/revolut_cost.mjs BTC
//   node revolut/revolut_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("revolut-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  eeaStocks: "https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-EEA-stocks-v3.0.pdf",
  usStocks: "https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-US-stocks-v6.0.pdf",
  etfs: "https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-ETFs-v6.0-LT-EN.pdf",
  crypto: "https://www.revolut.com/en-FR/legal/exchangingcryptocurrenciespersonalfees/",
  readOn: "2026-09-12",
  entity: "Revolut Securities Europe UAB",
  cryptoEntity: "Revolut Digital Assets Europe Ltd",
};

const DEFAULT_PLAN = "standard";

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;

// Removed on 13 February 2024. Kept named rather than dropped, because the
// figure is what most published comparisons of this broker still carry.
const CUSTODY_UNTIL_2024 = 0.0012;

// The per-leg minimum on a stock ticket. Published as EUR 1.00 with a footnote
// that the real floor is country-specific; the catalogue is EUR and USD lines
// sold by the Lithuanian entity, so the euro figure is the one that applies.
const STOCK_MIN = 1;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);

// Under €200 a crypto exchange pays a step instead of the percentage, whichever
// is greater. Over it, only the percentage. The first step is half the trade,
// which is a refusal dressed as a fee rather than a price.
//
// Verified on a ticket: a $50 BTC buy at 22:14 Paris on 2026-09-12 was charged
// $2.31, which is the €1.99 step of the 25–100 band converted at 1.1622. So the
// table holds, and so does the euro billing on a dollar order.
const CRYPTO_STEPS = {
  "1.49": [[2, null], [5, 0.99], [25, 1.49], [100, 1.99], [150, 2.49], [200, 2.99]],
  "0.99": [[2, null], [50, 0.99], [150, 1.49], [200, 1.99]],
  "0.49": [[2, null], [200, 0.99]],
};

// The price Revolut shows is not the market's. The same ticket that was charged
// its €1.99 priced one bitcoin at $78,118.58 while Kraken's touch and Coinbase's
// spot both sat at $77,170 — 1.23 % above the market, on top of the fee the
// ticket names. Nothing published says so; this is measured.
//
// Doubled into the book term like any other spread, since a round trip crosses
// it twice, and assumed symmetric on the sell because only the buy was read.
// Carried by every crypto line, which makes it a floor and not an average:
// bitcoin is the deepest pair on the shelf and the rest can only be worse.
const CRYPTO_MARKUP_BP = 123;
const CRYPTO_MARKUP_READ = "2026-09-12 22:14 Paris, BTC 50 $";

// A stablecoin bought with its own currency is free: the $50 USDC ticket read
// the same evening credited exactly 50 USDC, no fee, no step, at 1.0000 — while
// the BTC ticket beside it paid. Revolut prices the 1:1 leg as a conversion
// rather than an exchange. USDC is the one that was read; USDT and DAI are the
// rest of the catalogue's stablecoins and are taken with it by kind.
const STABLECOINS = new Set(["USDC", "USDT", "DAI"]);

const PLANS = {
  standard: { id: "standard", label: "Revolut Standard", stock: 0.0025, etf: 0.001, crypto: 0.0149, fx: 0.01, free: 1, sub: 0 },
  plus: { id: "plus", label: "Revolut Plus", stock: 0.0025, etf: 0.001, crypto: 0.0149, fx: 0.005, free: 3, sub: 2.99 },
  premium: { id: "premium", label: "Revolut Premium", stock: 0.0025, etf: 0.001, crypto: 0.0099, fx: 0, free: 5, sub: 7.99 },
  metal: { id: "metal", label: "Revolut Metal", stock: 0.0025, etf: 0.001, crypto: 0.0099, fx: 0, free: 10, sub: 13.99 },
  ultra: { id: "ultra", label: "Revolut Ultra", stock: 0.0012, etf: 0.001, crypto: 0.0049, fx: 0, free: 10, sub: 45 },
  // An add-on bought on top of any plan, so its FX and crypto stay those of the
  // plan underneath. Standard's are used here, which is the common case.
  pro: { id: "pro", label: "Trading Pro", stock: 0.0012, etf: 0.001, crypto: 0.0149, fx: 0.01, free: 10, sub: 15 },
};

const PLAN_ALIAS = {
  standard: "standard",
  std: "standard",
  free: "standard",
  plus: "plus",
  premium: "premium",
  metal: "metal",
  ultra: "ultra",
  pro: "pro",
  tradingpro: "pro",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isStablecoin = (row) => isCrypto(row) && STABLECOINS.has(String(row?.ticker || "").toUpperCase());

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
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

// Which of the three published cards a listing falls under. ETCs and ETNs go
// with the ETFs: the card's wording names units in a fund, which a certificate
// or a note is not, but the three are one family of exchange-traded products on
// the screen and in the hand, and Revolut sells them from the same shelf. The
// legal reading would put them at the stock rate, two and a half times dearer.
const ETP = new Set(["ETF", "ETC", "ETN"]);

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || ex === "CRYPTO") return "crypto";
  if (US_MICS.has(m) || US_EX.has(ex)) return "us";
  if (ETP.has(type)) return "etf";
  return "eea";
}

export function ruleOf(plan, market, { stablecoin = false } = {}) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  if (market === "crypto") {
    if (stablecoin) return { rate: 0, min: 0, steps: null, currency: "EUR", stablecoin: true };
    // Keyed on the rounded percentage: `0.0099 * 100` is not `0.99` in binary
    // floating point, and a miss here silently drops the whole step schedule.
    const steps = CRYPTO_STEPS[(picked.crypto * 100).toFixed(2)] || null;
    // A step is a function of the size, which `a × p × n + b × n + c` cannot
    // hold, so `floor` carries the smallest of them: the tightest bound the
    // affine shape can state without ever overcharging. `exactCost` knows the
    // exact step once a size is given.
    const min = steps ? (steps.find(([, fee]) => fee != null)?.[1] ?? 0) : 0;
    return { rate: picked.crypto, min, steps, currency: "EUR" };
  }
  if (market === "etf") return { rate: picked.etf, min: 0, currency: "EUR" };
  return { rate: picked.stock, min: STOCK_MIN, currency: "EUR" };
}

// The stepped crypto minimum, in euro, for a trade of this size. Null above the
// last step, where the percentage stands alone.
export function cryptoStep(amount, steps) {
  if (!steps || amount == null || !Number.isFinite(Number(amount))) return null;
  for (const [ceiling, fee] of steps) {
    if (Number(amount) < ceiling) return fee == null ? Number(amount) * 0.5 : fee;
  }
  return null;
}

export function commissionEach(amount, rule) {
  if (!rule) return null;
  const rate = rule.rate || 0;
  if (amount == null || !Number.isFinite(Number(amount))) {
    // Without a size the percentage is known and the floor is not, so the answer
    // is the percentage and `floor` carries the rest.
    return rate ? null : 0;
  }
  let fee = Number(amount) * rate;
  const step = rule.steps ? cryptoStep(amount, rule.steps) : null;
  const floor = step ?? rule.min ?? 0;
  if (floor) fee = Math.max(floor, fee);
  return fee;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
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
      ? { leaf: null, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
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

export function exactCost({ amount, market, plan = DEFAULT_PLAN, stablecoin = false }) {
  const picked = planOf(plan);
  const rule = picked ? ruleOf(picked, market, { stablecoin }) : null;
  const each = commissionEach(amount, rule);
  if (each == null || !rule) return { commission: null, currency: QUOTE };
  return {
    commission: dollars(each * 2, rule.currency),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.currency },
    floored: rule.steps
      ? cryptoStep(amount, rule.steps) != null && each === cryptoStep(amount, rule.steps)
      : Boolean(rule.min) && each === rule.min,
    plan: picked.id,
    market,
  };
}

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  delete rates.PTM_LEVY;
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  return { tax, rates, taxTotal };
}

// Every cost the page can compute already has a column of its own, so the remark
// is left with the one figure none of them can hold: what the subscription costs
// each month. It is only written where a row stands for a single plan, which is
// crypto; a share line covers all six and could not name a price.
//
// `min fees` is not displayed. The front lifts that sentence out of the remark
// and into the order column, so removing it would empty the column.
//
// A share or an ETF keeps the conversion markup instead. It is the one charge
// that can dwarf the commission — 1 % against 0.25 % on a dollar line — and it
// sits outside `a` because the account can hold the currency and avoid it.
//
// A stablecoin says on what condition its zero holds. The 1:1 leg is free only
// when it is paid in the coin's own currency; the €100 ticket credited 114.585
// USDC, which is 1.1459 to the euro against the 1.1608 the same evening's fee
// conversion used, so a euro buyer paid the markup the screen called no fees.

function remarkOf({ plan, market, floorUsd, stablecoin }) {
  const lines = [];
  if (market === "crypto") {
    if (stablecoin) lines.push("0% if buy with usd.");
    if (plan.sub) lines.push(`${plan.sub} €/month.`);
  } else if (plan.fx) {
    lines.push(`FX ${(plan.fx * 100).toFixed(2)}% above €1,000/month.`);
  }
  if (floorUsd) lines.push(`min fees ${floorUsd} $.`);
  return lines.join("\n");
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    plan: picked?.id ?? plan,
    etf,
    place,
    currency,
  };

  if (!picked) {
    return { ...answer, why: `formule inconnue : ${plan} (standard|plus|premium|metal|ultra|pro)` };
  }
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Revolut n'existe pas encore : lancer `node revolut/revolut_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Revolut` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Revolut`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
      });

  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const stablecoin = isStablecoin(m.row);
  const market = feeMarketOf(m.row, listing.mic);
  const rule = ruleOf(picked, market, { stablecoin });
  const leaf = book.leaf;
  // Crypto has no book to read, but it does have a measured markup, and a
  // stablecoin quoted at 1.0000 has neither.
  const marketBp = bp ?? leaf?.bp ?? (crypto && !stablecoin ? CRYPTO_MARKUP_BP * 2 : null);
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const { tax, rates, taxTotal } = taxParts(listing.isin);

  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: crypto ? { match: ["crypto"], name: "Crypto", why: "gré à gré" } : m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });

  // The commission is billed in euro whatever the venue, so the floor converts
  // from euro even on a dollar listing.
  const floorUsd = rule.min ? dollars(rule.min * 2, rule.currency) : null;

  return {
    ...answer,
    a: finite(plus(mkt.a, taxTotal, american ? SEC_RATE : 0, rule.rate * 2), 4),
    b: finite(plus(mkt.b, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: floorUsd,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    listing,
    feeMarket: market,
    onlineBuy: true,
    remark: remarkOf({ plan: picked, market, floorUsd, stablecoin }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : crypto
              ? 0
              : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: rule.rate * 2,
      change: null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url:
      leaf?.url ??
      (crypto
        ? SCHEDULE.crypto
        : market === "etf"
          ? SCHEDULE.etfs
          : american
            ? SCHEDULE.usStocks
            : SCHEDULE.eeaStocks),
    basis: `barème ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.rate,
      min: rule.min || 0,
      cap: null,
      flat: null,
      currency: rule.currency,
      eachWay: true,
      plan: picked.id,
      freeTradesPerMonth: picked.free,
      stablecoin: stablecoin || undefined,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: picked.fx * 2,
    custody: 0,
    confidence: confidenceOf({
      picked,
      market,
      rule,
      leaf,
      crypto,
      american,
      taxTotal,
      marketBp,
      marketPerShare,
      stablecoin,
      type: String(listing.type || "").toUpperCase(),
    }),
  };
}

function confidenceOf({ picked, market, rule, leaf, crypto, american, taxTotal, marketBp, marketPerShare, stablecoin, type }) {
  const lines = stablecoin
    ? ["stablecoin sans frais ni palier, ticket lu le " + SCHEDULE.readOn + " : 50 $ rendent 50 USDC à 1,0000 pile"]
    : [
        `${(rule.rate * 100).toFixed(2)} % par jambe sur le palier ${market} du plan ${picked.label}, lu le ${SCHEDULE.readOn}`,
      ];

  if (rule.min && crypto) {
    lines.push(
      `plancher ${rule.min} € par jambe, le plus bas des paliers : entre 25 et 100 € c'est 1,99 €, et le ticket lu l'a bien facturé 2,31 $ en euro sur un ordre en dollar`
    );
  } else if (rule.min) {
    lines.push(`plancher ${rule.min} € par jambe, facturé en euro même sur une ligne en dollar`);
  } else if (market === "etf") {
    lines.push("aucun plancher sur les ETF : la fiche ne donne qu'un pourcentage, là où celle des actions ajoute un minimum");
  }
  if (crypto && rule.steps) {
    lines.push("sous 200 € la crypto paie un palier fixe plutôt que le pourcentage, et sous 2 € la moitié de l'échange");
  }

  lines.push(
    `${picked.free} transaction${picked.free > 1 ? "s" : ""} gratuite${picked.free > 1 ? "s" : ""} par mois hors de ce calcul, ` +
      "qui chiffre l'aller-retour marginal, deux jambes facturées"
  );

  if (american) {
    lines.push(
      `SEC ${SEC_RATE} et TAF ${TAF_PER_SHARE} par part à la vente, aux taux courants du dépôt et non à ceux, plus anciens, que la fiche Revolut imprime encore`
    );
  }
  if (taxTotal > 0) lines.push(`taxe de transfert ${(100 * taxTotal).toFixed(2)} % prise dans la carte des taxes`);
  if (market === "etf" && type && type !== "ETF") {
    lines.push(
      `${type} compté au tarif ETF : la fiche ne nomme que les parts de fonds, mais les trois produits cotés partent du même rayon`
    );
  }

  lines.push(`garde 0 depuis le 13 février 2024, où les ${(100 * CUSTODY_UNTIL_2024).toFixed(2)} % annuels ont été supprimés`);
  lines.push(
    picked.fx
      ? `change hors a : le compte tient l'euro et le dollar, ${(picked.fx * 100).toFixed(2)} % seulement au-delà de 1 000 € convertis par mois`
      : "change hors a : ce plan ne facture pas la conversion"
  );

  if (!crypto && marketBp == null && marketPerShare == null) {
    lines.push("pas de feuille de carnet pour cet ISIN / cette place : le spread reste N/A");
  }
  if (crypto && !stablecoin) {
    lines.push(
      `marge de cotation ${(CRYPTO_MARKUP_BP / 100).toFixed(2)} % par jambe, mesurée et non publiée (${CRYPTO_MARKUP_READ}), ` +
        "vente supposée symétrique et bitcoin pris pour plancher : les paires moins liquides paient davantage"
    );
  }
  lines.push("un ticket d'achat lu, aucun aller-retour réel dans ce dépôt");
  if (!leaf && !crypto) lines.push("carnet absent pour cette ligne");

  return lines.join(" ; ");
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
          stockMin: STOCK_MIN,
          secRate: SEC_RATE,
          tafPerShare: TAF_PER_SHARE,
          tafCap: TAF_CAP,
          custody: 0,
          custodyUntil2024: CUSTODY_UNTIL_2024,
          cryptoSteps: CRYPTO_STEPS,
          cryptoMarkupBp: CRYPTO_MARKUP_BP,
          cryptoMarkupRead: CRYPTO_MARKUP_READ,
          stablecoins: [...STABLECOINS],
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
      "usage : node revolut_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "        [--plan=standard|plus|premium|metal|ultra|pro] [--json]\n" +
        "        node revolut_cost.mjs --schedule\n" +
        "  ex.   node revolut_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node revolut_cost.mjs IWDA TRADEGATE EUR --plan=ultra"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (out.a == null && !out.listing) {
    console.log(`a = N/A   b = N/A   c = ${show(out.c)}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Revolut propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}, ${out.feeMarket}]\n`
  );

  const detail = [];
  // A book quoted per share is a `b` term, so it belongs on that line and not here.
  if (out.bp != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  const perShareDetail = [];
  if (out.perShare != null) perShareDetail.push("carnet 605");
  if (out.parts?.réglementaire) perShareDetail.push(`TAF ${TAF_PER_SHARE}`);

  console.log(`a = ${show(out.a)}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${show(out.b)} $   (par part${perShareDetail.length ? " : " + perShareDetail.join(" + ") : " : rien"})`);
  console.log(`c = ${show(out.c)} $   (par ordre : aucun ticket plat)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $   (${out.commission.min} € × 2)`);

  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${show(out.a)} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ` +
      `${show(out.b)} × n + ${show(out.c)}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = plus(
      out.a == null || amountUsd == null ? null : out.a * amountUsd,
      out.b == null ? null : out.b * n,
      out.c
    );
    // The euro ticket is charged on the euro value of the order, so a dollar
    // listing is brought back to euro before the floor is compared with it.
    const amountEur = l.currency === "EUR" ? amount : toUsd(amount, l.currency) / (usdPer("EUR") || 1);
    const billed = exactCost({ amount: amountEur, market: out.feeMarket, plan: out.plan });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    console.log(`  a, b, c        : ${affine == null ? "N/A" : `${affine.toFixed(4)} $`}`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          ` (${Number(billed.native.each).toPrecision(4)} € × 2${billed.floored ? ", au plancher" : ""})`
      );
    }
  }

  if (out.url) console.log(`\n${out.url}`);
}
