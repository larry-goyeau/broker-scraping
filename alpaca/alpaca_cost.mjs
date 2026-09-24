// What one round trip costs at Alpaca: buy n shares at price p, sell them back
// at once, in dollars. Coins are bought by the dollar instead, so they are
// handed an amount and no price.
//
// The account holds dollars and the catalogue is American — 6 333 shares,
// 6 223 funds, 293 of them OTC, and 73 spot pairs. Stocks and ETFs share one
// schedule; the card says "US equity and ETF trades" and means it. What differs
// from tastytrade is what is absent: Alpaca clears for itself, so there is no
// 0.0008 clearing line, which leaves only the regulators.
//
// Barème relu le 2026-09-14, révision du 2026-09-01. Rien n'a bougé sur les
// taux, et quatre choses manquaient au modèle affine :
//
// 1. Les trois plafonds au centime étaient hors du chiffre. Alpaca agrège
//    chaque type de frais par jour et par compte, puis arrondit ce total au
//    centime supérieur. Un aller-retour paie donc trois types — SEC à la
//    vente, TAF à la vente, CAT aux deux jambes — soit 0,03 $ et non les
//    fractions de centime que a × p × n + b × n + c calculait. Sur une part
//    d'IAU le modèle répondait 0,0005 $ là où la caisse a bougé de 0,03 $,
//    soixante fois moins. `roundTrip` facture les plafonds, parce qu'un
//    aller-retour seul dans sa journée les paie en entier.
//
// 2. L'Elite Smart Router est facturé par part, pas en pourcentage. L'ancien
//    fichier prenait `commission` comme une fraction du montant et la
//    multipliait par le produit, quand la carte publie 0,0040 $ la part en
//    tout-compris et 0,0025 à 0,0005 en tiered selon le volume mensuel. Sur
//    mille parts à 2 $ l'écart entre les deux lectures est d'un facteur cent.
//    C'est désormais un paramètre par part, nul par défaut : Alpaca ne facture
//    aucune commission hors Elite, flux non-retail et options indicielles.
//
// 3. Le carnet crypto n'était pas lu. Une pièce coûtait les 0,50 % de frais et
//    rien d'autre, comme si la touche était gratuite. Alpaca tient sa propre
//    place et en publie la touche sans clé, donc `spread.mjs` la relève
//    désormais sous le MIC ALPA, à côté de Binance et Coinbase, et ce fichier
//    lit celle-là. L'écart avec le spot justifiait à lui seul le détour : la
//    touche d'Alpaca vaut 2,65 bp sur le bitcoin contre 0,0013 chez Binance,
//    deux mille fois plus large, et de 5 à 2 000 fois selon la pièce. Lire le
//    spot à sa place n'était pas une approximation, c'était le mauvais carnet.
//    Quantfury, qui reprend vraiment le spot des deux places, garde celles-là.
//
// 4. Les frais crypto se composent un peu. Ils sont prélevés sur ce que l'on
//    reçoit, donc la vente porte sur une position déjà amputée de 0,25 % :
//    l'aller-retour coûte 1 − (1 − 0,0025)² du montant, pas 0,50 %. Six
//    millièmes de centime sur mille dollars, mais c'est gratuit d'être exact.
//
// Restent hors du chiffre, et dans la remarque, deux frais qui ne dépendent pas
// de l'ordre : la conversion de 1,5 % (plafond 40 $) sur un versement en devise
// locale, que paie tout résident non américain, et le passage des frais de
// dépositaire sur les ADR, de 1 à 5 cents la part, prélevé par le dépositaire
// au calendrier et non à la transaction. 529 lignes du catalogue en sont.
// La marge à 6,25 % et le virement sortant à 15 $ sont des coûts de détention.
//
// Mesuré le 2026-09-08, compte Invest USD, trois allers-retours dans la même
// journée : IAU 1 part 82,685/82,685, EZU 1 part 70,6475/70,64, AQLT 2 parts
// 31,8675/31,8025. La caisse est passée de 500,00 à 499,83, soit 0,17 $, dont
// 0,1375 de carnet — les trois plafonds font les 0,03 restants, au centime.
// Les frais de la journée n'ont pas bougé du premier au troisième aller-retour,
// ce qui est la définition même d'un plafond journalier et la raison pour
// laquelle ce chiffre est un majorant pour qui passe plusieurs ordres.
//
// Le palier crypto est lu sur le tableau de bord du compte : « Crypto Fee Rate
// Level 1 », soit 0,25 % taker et 0,15 % maker. Un ticket BTC de 25 $ a été
// refusé le 2026-09-08 : la caisse ACH instantanée sert aux actions et reste
// invisible à la crypto (`available: 0`).
//
//   node alpaca/alpaca_cost.mjs IAU --shares=1 --price=82.685
//   node alpaca/alpaca_cost.mjs AAPL NASDAQ USD --shares=1000 --price=230
//   node alpaca/alpaca_cost.mjs BTC/USD --amount=1000
//   node alpaca/alpaca_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { QUOTE, fxRemark } from "../fx.mjs";

const CATALOGUE = new URL("alpaca-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf",
  crypto: "https://docs.alpaca.markets/docs/crypto-fees",
  revised: "2026-09-01",
  readOn: "2026-09-14",
  entity: "Alpaca Securities LLC",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_CAP_SHARES = 50205;
const CAT_PER_SHARE = 0.000003;
const CAT_OTC_EQUIV = 0.01;
const CRYPTO_TAKER = 0.0025;
const CRYPTO_MAKER = 0.0015;
// Alpaca runs its own crypto venue; `spread.mjs` reads its touch under this MIC.
const ALPACA_CRYPTO_MIC = "ALPA";

// Each fee type is totalled per account per day, then that total is rounded up
// to the cent. Three types ride on one round trip, so a lone trip cannot pay
// less than three cents however small the order.
const CENT = 0.01;
const FEE_TYPES = 3;
const DAILY_FLOOR = FEE_TYPES * CENT;
// Rounds a charge up to the cent. A charge nobody could compute stays missing:
// rounding null up to zero would turn an unpriced fee into a free one.
const up = (value, step) => (value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / step - 1e-9) * step : 0);

// Funding, not trading: Alpaca converts an inbound transfer in local currency
// at 1.5 %, capped at 40 $. It is the only charge a European reader cannot
// avoid and the only one the trade size does not reach.
const FUNDING_FX = 0.015;
const FUNDING_FX_CAP = 40;
// The depositary bills ADR holders 1 to 5 cents a share on its own calendar.
const ADR_PASS_THROUGH = { low: 0.01, high: 0.05 };

const CHECK = {
  on: "2026-09-08",
  trips: [
    { symbol: "IAU", n: 1, buy: 82.685, sell: 82.685 },
    { symbol: "EZU", n: 1, buy: 70.6475, sell: 70.64 },
    { symbol: "AQLT", n: 2, buy: 31.8675, sell: 31.8025 },
  ],
  cash: { start: 500, end: 499.83 },
  book: 0.1375,
  fees: 0.03,
  cryptoTier: "Level 1",
};

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
warmListingIndex(rows);
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
// Sponsored or not, the depositary charges the same. The catalogue spells it
// out in the name, which is the only place the fact lives.
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto[0];
    return { named, matches: [{ row, venue: null }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);

  return { named, matches };
}

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, adr: 0 });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (isAdr(r)) slot.adr += 1;
    const key = isCrypto(r) ? null : listingKey(r);
    const { leaf } = isCrypto(r)
      ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(r.ticker)), mic: null, currency: "USD" })
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: key.venue?.mic ?? null,
          currency: r.currency || "USD",
          unsourced: key.unsourced,
        });
    if (leaf?.bp != null || leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

/**
 * The whole bill for one round trip. `usd` is the number the page prints;
 * `buy` and `sell` say what each side paid, and `marginal` says what the same
 * trip would add to a day that is already paying the three ceilings.
 *
 * Shares and a price for anything with a share price; `amount` in dollars for
 * a coin, which has no unit worth naming.
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
  perShareCommission = 0,
}) {
  const base = { usd: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!rows.length) {
    return {
      ...base,
      why: "le catalogue Alpaca est vide : lancer `node alpaca/alpaca_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...base, why: `${etf} n'est pas dans le catalogue Alpaca` };
  if (!matches.length) {
    return {
      ...base,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Alpaca`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  if (isCrypto(m.row)) return cryptoTrip(m.row, { base, amount, bp });

  const otc = isOverTheCounter(m.row);
  const adr = isAdr(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
    broker: "alpaca",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    otc,
    adr,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;

  const n = Number(shares);
  const p = Number(price);
  const answer = {
    ...base,
    listing,
    feeMarket: otc ? "otc" : "us",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
  };
  if (!(n > 0) || !(p > 0)) {
    return {
      ...answer,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      remark: remarkOf({ adr }),
    };
  }

  const notional = n * p;
  // The book is already a round trip — the Rule 605 effective spread per share
  // on the American tape — so it is added once, not per side.
  const bookUsd =
    marketBp != null ? (notional * marketBp) / 1e4 : marketPerShare != null ? marketPerShare * n : null;

  // Sell-side levies. The TAF cap is per trade, and one sale is one trade.
  const secRaw = notional * SEC_RATE;
  const tafRaw = Math.min(n * TAF_PER_SHARE, TAF_CAP);
  // CAT rides on both legs. An OTC share counts for a hundredth of one.
  const catRaw = 2 * n * CAT_PER_SHARE * (otc ? CAT_OTC_EQUIV : 1);

  const sec = up(secRaw, CENT);
  const taf = up(tafRaw, CENT);
  const cat = up(catRaw, CENT);

  // Zero unless the reader is on Alpaca Elite and routing through the smart
  // router, in which case it is per share and charged on both legs.
  const commission = Number(perShareCommission) > 0 ? Number(perShareCommission) * n * 2 : 0;

  const usd = plus(bookUsd, sec, taf, cat, commission);
  // What the broker keeps, told apart from the total because the page prints the
  // two side by side. A free trade, a discount, a plan waives a commission and
  // nothing else: the book belongs to whoever quoted it, the transaction taxes
  // to a treasury, the regulatory levies to a regulator, and no broker can
  // forgive any of them. A remark about free trades next to a single number
  // would read as if it did.
  const brokerFees = commission;
  const marginal = plus(bookUsd, secRaw, tafRaw, catRaw, commission);

  return {
    ...answer,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    // The fees are known and the book is not, so the total is N/A rather than
    // the fees alone: a missing measurement must not read as a cheap venue.
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    remark: remarkOf({ adr }),
    trade: { shares: n, price: p, notional: finite(notional, 6), currency: listing.currency },
    buy: {
      commission: finite(commission / 2, 6),
      cat: finite(catRaw / 2, 6),
    },
    sell: {
      commission: finite(commission / 2, 6),
      sec: finite(secRaw, 6),
      taf: finite(tafRaw, 6),
      tafCapped: tafRaw >= TAF_CAP,
      cat: finite(catRaw / 2, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      réglementaire: finite(plus(sec, taf, cat), 6),
      commission: finite(commission, 6),
    },
    rounding: {
      exact: finite(plus(secRaw, tafRaw, catRaw), 6),
      charged: finite(plus(sec, taf, cat), 6),
      floor: Number(DAILY_FLOOR.toFixed(2)),
      types: FEE_TYPES,
      per: "jour et par compte",
    },
    marginal: finite(marginal, 6),
    cap: { part: "FINRA TAF", amount: TAF_CAP, fromShares: TAF_CAP_SHARES, per: "transaction" },
    check: CHECK,
    basis:
      `frais réglementaires du barème Alpaca Clearing révisé le ${SCHEDULE.revised}, ` +
      `relu le ${SCHEDULE.readOn} : aucune commission, aucune compensation` +
      (otc ? ", ligne OTC (CAT à 0,01 part équivalente)" : ""),
    confidence: confidenceOf({
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      otc,
      adr,
      type: listing.type,
      n,
      secRaw,
      tafRaw,
      catRaw,
      commission,
      perShareCommission,
    }),
  };
}

// A coin is bought by the dollar. The fee is a percentage of what you receive,
// which makes the sell leg smaller than the buy leg by exactly the buy fee.
function cryptoTrip(row, { base, amount, bp }) {
  const pair = String(row.ticker || "");
  const coin = cryptoBase(pair);
  // Alpaca's own venue, not the spot reference books. Where it has no reading
  // `spreadLeaf` falls back to the wider of Binance and Coinbase and says so,
  // which is a floor and nothing better: Alpaca quotes bitcoin two thousand
  // times wider than Binance does.
  const book = spreadLeaf(spreads, { isin: cryptoId(coin), mic: ALPACA_CRYPTO_MIC, currency: "USD" });
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const listing = {
    isin: null,
    ticker: pair,
    name: row.name || null,
    type: "CRYPTO",
    mic: null,
    exchange: "Alpaca (crypto)",
    currency: String(row.currency || "USD").toUpperCase(),
  };
  const answer = {
    ...base,
    // Cash is imposed: the pair settles in the fiat it is quoted in, and
    // Alpaca's instant ACH balance is invisible to crypto altogether.
    cashCurrency: listing.currency,
    listing,
    feeMarket: "crypto",
    bp: marketBp,
    perShare: null,
    url: SCHEDULE.crypto,
  };

  const a = Number(amount);
  if (!(a > 0)) return { ...answer, why: "aucun montant", remark: "" };

  // Buy: you receive the coin, less 0.25 % of it. Sell: you receive the fiat,
  // less 0.25 % of that. So the round trip is 1 − (1 − taker)² of the amount.
  const buyFee = a * CRYPTO_TAKER;
  const held = a - buyFee;
  const sellFee = held * CRYPTO_TAKER;
  const fees = buyFee + sellFee;
  const bookUsd = marketBp != null ? (a * marketBp) / 1e4 : null;

  return {
    ...answer,
    usd: finite(plus(fees, bookUsd), 6),
    // Le taker d'Alpaca est à elle ; le carnet est au marché.
    brokerFees: finite(fees, 6),
    remark: remarkOf({ adr: false }),
    trade: { amount: a, currency: listing.currency },
    buy: { taker: finite(buyFee, 6), rate: CRYPTO_TAKER, paidIn: coin },
    sell: { taker: finite(sellFee, 6), rate: CRYPTO_TAKER, paidIn: listing.currency },
    parts: { marché: finite(bookUsd, 6), frais: finite(fees, 6) },
    rounding: null,
    marginal: finite(plus(fees, bookUsd), 6),
    cap: null,
    tier: { level: 1, taker: CRYPTO_TAKER, maker: CRYPTO_MAKER, under: 100000, window: "30 jours" },
    check: { on: CHECK.on, cryptoTier: CHECK.cryptoTier },
    basis:
      `barème crypto Alpaca, palier 1 confirmé sur le compte (« Crypto Fee Rate ${CHECK.cryptoTier} ») : ` +
      `${(100 * CRYPTO_TAKER).toFixed(2)} % taker chaque sens, sous 100 000 $ de volume 30 jours`,
    confidence: cryptoConfidence({ coin, marketBp, assumed: book.assumed, mic: book.mic, fees, amount: a }),
  };
}

// The remark carries what the number does not. The three ceilings, the
// regulators and the book are all in `usd` and broken out under `parts`, so
// naming them here would only invite the reader to add them twice. What is
// left turns on the reader rather than on the order: how the account was
// funded, and whether a depositary stands between them and the shares.
function remarkOf({ adr }) {
  const said = [
    fxRemark((100 * FUNDING_FX).toFixed(2), "USD", `on funding (max $${FUNDING_FX_CAP})`),
  ];
  if (adr) said.push(`ADR pass-through $${ADR_PASS_THROUGH.low}–$${ADR_PASS_THROUGH.high}/share.`);
  return said.join("\n");
}

function confidenceOf({
  marketBp,
  marketPerShare,
  unsourced,
  otc,
  adr,
  type,
  n,
  secRaw,
  tafRaw,
  catRaw,
  commission,
  perShareCommission,
}) {
  const kind = type === "STOCK" ? "action" : type === "ETF" ? "fonds" : type || "titre";
  const said = [];
  said.push(
    `frais lus au barème d'Alpaca Securities du ${SCHEDULE.revised} (${kind}` +
      (otc ? ", OTC : CAT à 0,01 part équivalente" : "") +
      `), barème unique actions / ETF, aucune commission et aucune ligne de compensation`
  );
  const exact = secRaw + tafRaw + catRaw;
  const charged = up(secRaw, CENT) + up(tafRaw, CENT) + up(catRaw, CENT);
  said.push(
    `SEC ${Number(secRaw.toPrecision(3))} $, TAF ${Number(tafRaw.toPrecision(3))} $, ` +
      `CAT ${Number(catRaw.toPrecision(3))} $ : ${Number(exact.toPrecision(3))} $ au calcul, ` +
      `${charged.toFixed(2)} $ facturés, chacun des trois types étant arrondi au centime ` +
      `supérieur après agrégation du jour`
  );
  if (exact > DAILY_FLOOR) {
    said.push(
      `à ${n} parts les trois types dépassent le centime, donc l'arrondi ne coûte plus que ` +
        `${Number((charged - exact).toPrecision(2))} $`
    );
  } else {
    said.push(
      `c'est un majorant pour qui passe plusieurs ordres le même jour : le 2026-09-08, ` +
        `trois allers-retours ont payé 0,03 $ en tout, pas 0,09 $`
    );
  }
  if (tafRaw >= TAF_CAP) said.push(`TAF au plafond de ${TAF_CAP} $ (atteint à ${TAF_CAP_SHARES} parts)`);
  if (Number(perShareCommission) > 0) {
    said.push(
      `commission Elite Smart Router imposée à ${perShareCommission} $ la part et par jambe, ` +
        `soit ${Number(commission.toPrecision(4))} $ l'aller-retour`
    );
  }
  if (marketPerShare != null) {
    said.push(
      `carnet Rule 605, ${marketPerShare} $ la part, moyenne mensuelle des ordres immédiats ` +
        `de 100 à 499 parts, cinq teneurs, Citadel et Virtu manquants`
    );
    if (marketPerShare > 0.01) {
      said.push(
        `ATTENTION carnet large : sous 100 parts l'amélioration de prix que ce chiffre contient ` +
          `n'a souvent pas lieu. Mesuré ici le ${CHECK.on} sur AQLT, 2 parts : 6,5 c la part ` +
          `l'aller-retour, contre 3,3 c publiés`
      );
    }
  } else if (marketBp != null) {
    said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || "cette place"}, ${unsourced?.why || "pas de source 605"}. ` +
        `Le total ne tient qu'aux frais, à lire comme un plancher`
    );
  }
  if (adr) {
    said.push(
      `ADR : le dépositaire prélève ${ADR_PASS_THROUGH.low} à ${ADR_PASS_THROUGH.high} $ la part ` +
        `à son calendrier, hors du total parce que ce n'est pas la transaction qui le déclenche`
    );
  }
  said.push(
    `un aller-retour réel le ${CHECK.on} : caisse ${CHECK.cash.start} → ${CHECK.cash.end} $ pour ` +
      `trois trips, dont ${CHECK.book} de carnet, soit ${CHECK.fees} $ de frais au centime près`
  );
  return said.join(" ; ");
}

function cryptoConfidence({ coin, marketBp, assumed, mic, fees, amount }) {
  const said = [];
  said.push(
    `${(100 * CRYPTO_TAKER).toFixed(2)} % taker à l'achat et à la vente, palier 1 lu sur le ` +
      `compte le ${SCHEDULE.readOn}, soit ${Number(fees.toPrecision(4))} $ sur ${amount} $`
  );
  said.push(
    `les frais sont prélevés sur ce que l'on reçoit — la pièce à l'achat, le dollar à la vente — ` +
      `donc la seconde jambe porte sur une position déjà amputée de la première`
  );
  said.push(`ni SEC, ni TAF, ni CAT : la crypto n'est pas un titre et ne porte aucune ligne réglementaire`);
  if (marketBp != null && mic === ALPACA_CRYPTO_MIC) {
    said.push(
      `carnet ${Number(marketBp.toPrecision(3))} bp, la touche d'Alpaca elle-même, relevée sur ` +
        `son propre flux de cotation. C'est la bonne place et non un proxy : Alpaca cote ${coin} ` +
        `bien plus large que Binance ou Coinbase, d'un facteur 5 à 2 000 selon la pièce`
    );
  } else if (marketBp != null) {
    said.push(
      `carnet ${Number(marketBp.toPrecision(3))} bp sur ${coin}, lu à la plus large de Binance et ` +
        `Coinbase (${mic}) faute de relevé chez Alpaca. C'est un minorant, et un mauvais : sur les ` +
        `pièces où les deux sont connus, la touche d'Alpaca vaut 5 à 2 000 fois celle du spot`
    );
  } else {
    said.push(
      `ni Binance ni Coinbase ne cote ${coin} contre le dollar, donc le carnet reste N/A plutôt ` +
        `que 0 et le total ne compte que les frais`
    );
  }
  said.push(
    `les frais crypto (CFEE) sont postés en fin de journée ; aucun aller-retour réel, un ticket ` +
      `de 25 $ a été refusé le ${CHECK.on} (ACH instantané visible en actions, available 0 en crypto)`
  );
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème Alpaca Securities, révisé le ${SCHEDULE.revised}, relu le ${SCHEDULE.readOn}`);
    console.log(`  ${SCHEDULE.source}`);
    console.log(`  crypto  ${SCHEDULE.crypto}\n`);
    console.log("  actions et ETF, même carte :");
    console.log(`    SEC            ${SEC_RATE} du montant, à la vente seule`);
    console.log(`    FINRA TAF      ${TAF_PER_SHARE} par part, à la vente seule, plafond ${TAF_CAP} $ à ${TAF_CAP_SHARES} parts`);
    console.log(`    FINRA CAT      ${CAT_PER_SHARE} par part NMS, aux deux jambes (OTC × ${CAT_OTC_EQUIV})`);
    console.log(`    compensation   0 (Alpaca compense pour son compte)`);
    console.log(`    commission     0, sauf Elite Smart Router (par part : 0,0040 tout-compris,`);
    console.log(`                   0,0025 à 0,0005 en tiered selon le volume mensuel),`);
    console.log(`                   flux non-retail, et options indicielles`);
    console.log(`\n  arrondi : chaque type de frais agrégé par jour et par compte, puis au centime supérieur`);
    console.log(`  donc plancher ${DAILY_FLOOR.toFixed(2)} $ pour une journée ne contenant qu'un aller-retour`);
    console.log(`\n  crypto, palier 1 (< 100 000 $ / 30 j), confirmé sur le compte :`);
    console.log(`    taker          ${CRYPTO_TAKER} chaque sens, prélevé sur l'actif reçu`);
    console.log(`    maker          ${CRYPTO_MAKER} chaque sens`);
    console.log(`\n  hors de l'aller-retour :`);
    console.log(`    versement en devise locale   ${100 * FUNDING_FX} %, plafond ${FUNDING_FX_CAP} $`);
    console.log(`    ADR                          ${ADR_PASS_THROUGH.low} à ${ADR_PASS_THROUGH.high} $ la part, au calendrier du dépositaire`);
    console.log(`    marge 6,25 %, virement sortant 15 $ (35 $ international)`);
    console.log(`  pas au catalogue : options (ORF 0,015 / OCC 0,025 / TAF 0,00329 par contrat)`);
    const cover = coverage();
    if (cover) {
      console.log("\n  catalogue :");
      for (const [type, row] of Object.entries(cover)) {
        const extra = `, ${row.withBook} avec carnet, ${row.n - row.withBook} frais seuls`;
        const otc = row.otc ? `, dont ${row.otc} OTC` : "";
        const adr = row.adr ? `, ${row.adr} ADR` : "";
        console.log(`    ${String(type).padEnd(6)} ${row.n} lignes${extra}${otc}${adr}`);
      }
    }
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node alpaca/alpaca_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--json] [--schedule]\n" +
        "  ex.   node alpaca/alpaca_cost.mjs IAU --shares=1 --price=82.685\n" +
        "        node alpaca/alpaca_cost.mjs AAPL NASDAQ USD --shares=1000 --price=230\n" +
        "        node alpaca/alpaca_cost.mjs BTC/USD --amount=1000"
    );
    process.exit(1);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: arg("shares") != null ? Number(arg("shares")) : null,
    price: arg("price") != null ? Number(arg("price")) : null,
    amount: arg("amount") != null ? Number(arg("amount")) : null,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    perShareCommission: arg("smartRouter") != null ? Number(arg("smartRouter")) : 0,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.usd == null ? 1 : 0);
  }

  if (!out.listing) {
    console.error(out.why);
    if (out.alternatives?.length) console.error(`  ailleurs : ${out.alternatives.join(", ")}`);
    process.exit(1);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || "sans nom"}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `${l.adr ? ", ADR" : ""}\n`
  );

  if (out.usd == null) {
    console.log(`coût N/A — ${out.why}`);
  } else if (l.type === "CRYPTO") {
    console.log(`${out.trade.amount} ${out.trade.currency} aller-retour : ${out.usd.toFixed(4)} $\n`);
    console.log(`  frais taker  ${out.parts.frais?.toFixed(4) ?? "N/A"} $   (achat ${out.buy.taker} en ${out.buy.paidIn}, vente ${out.sell.taker} en ${out.sell.paidIn})`);
    console.log(`  carnet       ${out.parts.marché != null ? `${out.parts.marché.toFixed(4)} $   (${out.bp} bp)` : "N/A"}`);
  } else {
    console.log(`${out.trade.shares} part${out.trade.shares > 1 ? "s" : ""} à ${out.trade.price} $ = ${out.trade.notional} $ de notionnel`);
    console.log(`aller-retour : ${out.usd.toFixed(4)} $\n`);
    console.log(`  carnet         ${out.parts.marché != null ? `${out.parts.marché.toFixed(4)} $` : "N/A"}`);
    console.log(`  réglementaire  ${out.parts.réglementaire.toFixed(2)} $   (exact ${out.rounding.exact}, arrondi à ${out.rounding.charged})`);
    if (out.parts.commission) console.log(`  commission     ${out.parts.commission.toFixed(4)} $`);
    console.log(`  ajouté à une journée déjà chargée : ${out.marginal.toFixed(4)} $`);
  }

  if (out.remark) console.log(`\nremarque :\n  ${out.remark.split("\n").join("\n  ")}`);
  console.log("");
  for (const line of String(out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.url) console.log(`\n${out.url}`);
}
