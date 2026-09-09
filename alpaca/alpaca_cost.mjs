// For one listing, one venue and one currency, the three coefficients of
//
//     coût (USD) = a × p × n + b × n + c
//
// on Alpaca, with n the number of shares and p the share price. The account holds
// dollars and the catalogue is American: stocks, ETFs, a few OTC lines, and spot
// crypto. Options are not in the catalogue, so they answer `a = null`.
//
// Stocks and ETFs share one schedule — the card says "US equity and ETF trades".
// What differs from tastytrade is what is absent: Alpaca clears for itself, so
// there is no 0.0008 clearing line, which leaves only the regulators. A hundred
// shares of a penny-wide fund pay about nine times less in fees here than there.
//
// FINRA's CAT levy is on both legs, 0.000003 a share on an NMS line, and a
// hundredth of that on OTC (1 share = 0.01 equivalent share). Tiny, and in `b`
// twice rather than once.
//
// Rounding is a property of the day, not of the order: each fee type is totalled
// per account and rounded up to the cent once. A lone round trip cannot cost
// less than three cents. The affine form is exact on the amounts; only those
// three ceilings sit outside it.
//
// Crypto is a percentage, not a regulator's line. Tier 1 (under 100 k$ of
// 30-day volume) is 0.25 % taker each way, so `a` is 0.005 and `b` is zero.
// The fee posts at end of day as `CFEE`. There is no SEC, no TAF, no CAT.
// A $25 BTC ticket was refused on 2026-09-08: instant ACH cash is usable on
// listed equities and invisible to crypto (`available: 0`).
//
// One live equity trip on the same day settled the fee side. One IAU, market
// both ways, filled 82.685 / 82.685. The cash moved 0.03 $ and
// `pending_reg_taf_fees` printed 0.03 — the three daily ceilings, nothing
// else. A second trip (EZU) added no regulatory fee: pending TAF stayed 0.03.
// `a` and `b` stay the published rates; the 3 cents are the day's floor, not
// a per-order `c`.
//
//   node alpaca/alpaca_cost.mjs IAU
//   node alpaca/alpaca_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node alpaca/alpaca_cost.mjs BTC/USD
//   node alpaca/alpaca_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";
import { QUOTE } from "../fx.mjs";

const CATALOGUE = new URL("alpaca-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf",
  crypto: "https://docs.alpaca.markets/docs/crypto-fees",
  revised: "2026-09-01",
  readOn: "2026-09-08",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_CAP_SHARES = 50205;
const CAT_PER_SHARE = 0.000003;
const CAT_OTC_EQUIV = 0.01;
const COMMISSION_RATE = 0;
const CRYPTO_TAKER = 0.0025;
const CRYPTO_MAKER = 0.0015;
const REMARK_EQUITY = "Regulatory floor $0.03/day.";
const REMARK_CRYPTO =
  "0.50% taker (tier 1). Instant ACH cash is not available for crypto until settled.";

const CHECK = {
  symbol: "IAU",
  type: "ETF",
  n: 1,
  buy: 82.685,
  sell: 82.685,
  book: 0,
  fees: 0.03,
  pendingRegTaf: 0.03,
  on: "2026-09-08",
  second: { symbol: "EZU", n: 1, buy: 70.6475, sell: 70.64, extraFees: 0 },
};

const up = (value, step) => Math.ceil(value / step - 1e-9) * step;
const FEE_TYPES = 3;
const DAILY_FLOOR = FEE_TYPES * 0.01;

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const perShareFees = (otc) => TAF_PER_SHARE + 2 * CAT_PER_SHARE * (otc ? CAT_OTC_EQUIV : 1);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
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
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0 });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (isCrypto(r)) continue;
    const { venue } = listingKey(r);
    const leaf =
      venue?.mic &&
      spreads[String(r.isin || "").toUpperCase()]?.[venue.mic]?.[String(r.currency || "USD").toUpperCase()];
    if (leaf?.bp != null || leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
}) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: Number(perShareFees(false).toPrecision(6)),
    c: 0,
    ccy: QUOTE,
    floor: { amount: Number(DAILY_FLOOR.toFixed(2)), per: "jour et par compte", types: FEE_TYPES },
    cap: {
      term: "b",
      part: "FINRA TAF",
      amount: TAF_CAP,
      fromShares: TAF_CAP_SHARES,
      per: "transaction",
    },
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Alpaca` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    const picked = findListing({ etf, place, currency }).matches[0]?.row || cryptoRow;
    return cryptoCost(picked, answer);
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Alpaca`,
      alternatives: named
        .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
        .slice(0, 12),
    };
  }

  const m = matches[0];
  const otc = isOverTheCounter(m.row);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    otc,
  };

  const leaf = (listing.mic && spreads[listing.isin]?.[listing.mic]?.[listing.currency]) || null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const fees = perShareFees(otc);

  return {
    ...answer,
    a: Number((SEC_RATE + 2 * commission + (marketBp ?? 0) / 1e4).toPrecision(4)),
    b: Number((fees + (marketPerShare ?? 0)).toPrecision(6)),
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? null,
    basis:
      bp || perShare
        ? "imposé"
        : marketBp != null || marketPerShare != null
          ? "publié"
          : "frais seuls",
    fees: {
      secOfAmount: SEC_RATE,
      tafPerShare: TAF_PER_SHARE,
      catPerShareEachWay: Number((CAT_PER_SHARE * (otc ? CAT_OTC_EQUIV : 1)).toPrecision(6)),
      commissionOfAmountEachWay: commission,
      clearingPerShare: 0,
      otc,
      schedule: SCHEDULE,
    },
    confidence: confidenceOf({
      market: marketBp ?? marketPerShare,
      match: m,
      touchWide: (marketPerShare ?? 0) > 0.01,
      commission,
      otc,
      type: listing.type,
    }),
    fxIfConverted: null,
    measured: CHECK,
    remark: REMARK_EQUITY,
  };
}

function cryptoCost(row, answer) {
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: "Alpaca (crypto)",
    currency: String(row.currency || "USD").toUpperCase(),
  };
  return {
    ...answer,
    a: Number((CRYPTO_TAKER * 2).toPrecision(4)),
    b: 0,
    c: 0,
    floor: null,
    cap: null,
    listing,
    feeMarket: "crypto",
    remark: REMARK_CRYPTO,
    parts: { markupEachWay: CRYPTO_TAKER, makerEachWay: CRYPTO_MAKER },
    bp: Number((CRYPTO_TAKER * 2 * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.crypto,
    basis: "barème crypto Alpaca, palier 1 : 0,25 % taker chaque sens, sous 100 000 $ de volume 30 jours",
    fees: {
      takerEachWay: CRYPTO_TAKER,
      makerEachWay: CRYPTO_MAKER,
      secOfAmount: 0,
      tafPerShare: 0,
      schedule: SCHEDULE,
    },
    confidence:
      `0,25 % taker à l'achat et à la vente, soit 0,50 % l'aller-retour, lu le ${SCHEDULE.readOn}. ` +
      `Pas de SEC, pas de TAF, pas de CAT. Les frais crypto (CFEE) sont postés en fin de journée. ` +
      `Aucun aller-retour réel crypto : un ticket de 25 $ a été refusé le ${CHECK.on} ` +
      `(ACH instantané visible en actions, available 0 en crypto)`,
    fxIfConverted: null,
    measured: null,
  };
}

export function exactCost({
  shares,
  price,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
  otc = false,
  crypto = false,
}) {
  const proceeds = shares * price;
  if (crypto) {
    const fee = 2 * proceeds * CRYPTO_TAKER;
    return {
      taker: Number(fee.toFixed(6)),
      market: Number((((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares).toFixed(4)),
      alone: Number((fee + ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares).toFixed(4)),
      marginal: Number((fee + ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares).toFixed(4)),
    };
  }
  const sec = proceeds * SEC_RATE;
  const taf = Math.min(shares * TAF_PER_SHARE, TAF_CAP);
  const cat = 2 * shares * CAT_PER_SHARE * (otc ? CAT_OTC_EQUIV : 1);
  const fee = 2 * proceeds * commission;
  const market = ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares;
  const exact = sec + taf + cat + fee + market;
  return {
    sec: Number(sec.toFixed(6)),
    taf: Number(taf.toFixed(6)),
    cat: Number(cat.toFixed(6)),
    commission: Number(fee.toFixed(6)),
    market: Number(market.toFixed(4)),
    alone: Number((up(sec, 0.01) + up(taf, 0.01) + up(cat, 0.01) + fee + market).toFixed(4)),
    marginal: Number(exact.toFixed(4)),
  };
}

const confidenceOf = ({ market, match, touchWide, commission, otc, type }) => {
  const kind = type === "STOCK" ? "action" : type === "ETF" ? "fonds" : type || "titre";
  const base =
    `frais lus au barème d'Alpaca Clearing du ${SCHEDULE.revised} (${kind}` +
    (otc ? ", OTC : CAT à 0,01 part équivalente" : "") +
    `), barème unique actions / ETF` +
    (commission ? `, commission de ${(commission * 100).toFixed(2)} % par jambe imposée` : "") +
    `. Un aller-retour réel le ${CHECK.on} sur ${CHECK.symbol} (${CHECK.n} part) : ` +
    `fills ${CHECK.buy}/${CHECK.sell}, caisse −${CHECK.fees} $, pending TAF ${CHECK.pendingRegTaf} $ ` +
    `(les trois plafonds du jour). Un second trip ${CHECK.second.symbol} n'a rien ajouté aux frais`;
  if (market == null) {
    return (
      `${base}. Aucun carnet : ${match.unsourced?.name || "cette place"}, ` +
      `${match.unsourced?.why || "pas de source 605"}. À lire comme un plancher`
    );
  }
  return (
    `${base}. Spread effectif publié : moyenne mensuelle sur les ordres immédiats de 100 à 499 ` +
    `parts, cinq teneurs, Citadel et Virtu manquants` +
    (touchWide
      ? `. ATTENTION carnet large : sous 100 parts, l'amélioration de prix que ce chiffre ` +
        `contient n'a pas lieu — mesuré chez tastytrade, six allers-retours de 10 parts ont payé ` +
        `13 c/part sur AQLT contre 3,3 c publiés, soit la touche entière. Pour un lot rompu, ` +
        `passer la touche cotée en \`perShare\``
      : "")
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème Alpaca Clearing, révisé le ${SCHEDULE.revised}, lu le ${SCHEDULE.readOn}`);
    console.log(`  ${SCHEDULE.source}`);
    console.log(`  crypto  ${SCHEDULE.crypto}\n`);
    console.log("  actions et ETF, même carte :");
    console.log(`    SEC            ${SEC_RATE} du montant, à la vente seule`);
    console.log(`    FINRA TAF      ${TAF_PER_SHARE} par part, à la vente seule, plafond ${TAF_CAP} $ à ${TAF_CAP_SHARES} parts`);
    console.log(`    FINRA CAT      ${CAT_PER_SHARE} par part NMS, aux deux jambes (OTC × ${CAT_OTC_EQUIV})`);
    console.log(`    compensation   0 (Alpaca compense pour son compte)`);
    console.log(`    commission     0 en direct, 0 à 3 % via partenaire ou Elite Smart Router`);
    console.log(`\n  crypto, palier 1 (< 100 000 $ / 30 j) :`);
    console.log(`    taker          ${CRYPTO_TAKER} chaque sens`);
    console.log(`    maker          ${CRYPTO_MAKER} chaque sens`);
    console.log(`\n  arrondi actions : par type de frais, agrégé par jour et par compte, au centime supérieur`);
    console.log(`  donc plancher ${DAILY_FLOOR.toFixed(2)} $ pour une journée ne contenant qu'un aller-retour`);
    console.log(`  hors sujet ici : marge à 6,25 %, virement sortant 15 $ (35 $ international)`);
    console.log(`  pas au catalogue : options (ORF / OCC / TAF contrat)`);
    const cover = coverage();
    if (cover) {
      console.log("\n  catalogue :");
      for (const [type, row] of Object.entries(cover)) {
        const extra = type === "CRYPTO" ? "" : `, ${row.withBook} avec carnet 605, ${row.n - row.withBook} frais seuls`;
        const otc = row.otc ? `, dont ${row.otc} OTC` : "";
        console.log(`    ${String(type).padEnd(6)} ${row.n} lignes${extra}${otc}`);
      }
    }
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node alpaca/alpaca_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json] [--schedule]\n" +
        "  ex.   node alpaca/alpaca_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node alpaca/alpaca_cost.mjs IAU\n" +
        "        node alpaca/alpaca_cost.mjs BTC/USD"
    );
    process.exit(1);
  }

  const commission = arg("commission") != null ? Number(arg("commission")) : COMMISSION_RATE;
  const answer = roundTripCost({
    etf,
    place,
    currency,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    commission,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(answer, null, 2));
    process.exit(answer.a == null ? 1 : 0);
  }

  if (answer.a == null) {
    console.error(answer.why);
    if (answer.alternatives?.length) console.error(`  ailleurs : ${answer.alternatives.join(", ")}`);
    process.exit(1);
  }

  const l = answer.listing;
  const crypto = l.type === "CRYPTO";
  console.log(`${l.ticker || l.isin} — ${l.name || "sans nom"}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  const marketA = answer.bp != null ? ` + ${answer.bp} bp de carnet` : "";
  const marketB = answer.perShare != null ? ` + ${answer.perShare} de spread effectif` : "";
  console.log(
    `a = ${answer.a}   (au prorata : ${
      crypto ? `taker ${CRYPTO_TAKER} chaque sens` : `frais SEC ${SEC_RATE}${commission ? ` + commission ${commission} aux deux jambes` : ""}${marketA}`
    })`
  );
  console.log(
    `b = ${answer.b}   (par part : ${
      crypto ? "rien" : `CAT ${answer.fees.catPerShareEachWay} aux deux jambes + TAF ${TAF_PER_SHARE} à la vente${marketB}`
    })`
  );
  console.log(`c = ${answer.c}   (par ordre : ${crypto ? "rien, le taker est dans a" : "aucune commission, aucune compensation"})`);
  console.log(`\ncoût = ${answer.a} × p × n + ${answer.b} × n + ${answer.c}   (${answer.basis})`);
  if (answer.floor?.amount != null) {
    console.log(
      `  plancher ${answer.floor.amount} ${l.currency} par ${answer.floor.per} : ${answer.floor.types} types de frais, chacun arrondi au centime supérieur`
    );
  }
  console.log(`  ${answer.confidence}`);
  if (answer.url) console.log(`\n${answer.url}`);

  const shares = arg("shares") != null ? Number(arg("shares")) : null;
  const price = arg("price") != null ? Number(arg("price")) : null;
  if (shares && price) {
    const exact = exactCost({
      shares,
      price,
      bp: answer.bp,
      perShare: answer.perShare,
      commission,
      otc: l.otc,
      crypto,
    });
    const affine = answer.a * price * shares + answer.b * shares + answer.c;
    console.log(`\n${shares} part${shares > 1 ? "s" : ""} à ${price} ${l.currency} :`);
    console.log(`  formule affine            ${affine.toFixed(4)} ${l.currency}`);
    if (crypto) {
      console.log(`  taker ${CRYPTO_TAKER} × 2     ${exact.taker} ${l.currency}`);
    } else {
      console.log(`  seul aller-retour du jour ${exact.alone.toFixed(4)} ${l.currency}   (les trois plafonds au centime)`);
      console.log(`  ajouté à une journée déjà chargée ${exact.marginal.toFixed(4)} ${l.currency}`);
      console.log(`  dont marché ${exact.market.toFixed(4)}, SEC ${exact.sec}, TAF ${exact.taf}, CAT ${exact.cat}`);
    }
  }
}
