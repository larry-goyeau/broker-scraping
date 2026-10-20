// What one round trip costs at East Money Securities (东方财富证券): buy n
// shares online and sell them straight back, in dollars. A-shares, ETFs,
// LOFs and REITs in Shanghai and Shenzhen, Beijing shares, and Southbound
// Stock Connect (港股通) on HKEX. The account takes renminbi only
// (deposits.mjs).
//
// 佣金收取标准与资金收付渠道公示, posted 2026-03-13 on www.18.cn, read on
// 2026-10-19. The page body is one image:
//   https://www.18.cn/onlineService/gsgg/sfgs?id=499
//   https://zqcdn.eastmoneysec.com.cn/secwebdoc/2026/0313/20260313044437507.png
// The commission is printed as a ceiling, "不高于成交金额的3‰" with a floor
// ("起点"), and the actual rate is "以系统实际设置为准". No lower online rate
// is printed, so the figure is that ceiling and the remark says so.
//
//   A-shares, Shanghai and Shenzhen, each side
//     commission  at most 0.3 %, floor 5 CNY; the handling fee, the CSRC
//                 fee and the Shenzhen transfer fee are inside it
//     transfer    Shanghai only, 0.001 % ("0.01‰"), charged to both sides
//     stamp       0.05 % on the sale
//   Funds, ETFs, LOFs (REITs are listed funds), each side
//     commission  at most 0.3 %, floor 5 CNY. Money-market ETFs are free,
//                 and so are the bond ETFs 511020, 511030, 511160, 511360,
//                 159650 and 159651. A money ETF is told by its name (货币,
//                 添益, 日利, 快线, 现金, 保证金, 财富宝) or by the Shanghai
//                 money-fund code block 5116xx-5119xx.
//   Beijing (北交所), each side
//     commission  at most 0.3 %, floor 5 CNY; stamp 0.05 % on the sale
//   Southbound Stock Connect (港股通), each side
//     commission  at most 0.3 %, floor 5 HKD
//     trading levy 0.0027 %, AFRC levy 0.00015 %, trading fee 0.00565 %,
//     share settlement fee 0.0042 %
//     stamp       0.1 %, under HK$1 counted as HK$1; Hong Kong does not
//                 charge it on an ETF
//     portfolio fee 0.008 % a year on the holding (a holding cost, not this trip)
//   A Southbound trade is quoted in HKD and settled in CNY by ChinaClear at
//   its settlement rate. No margin over the mid is printed, so a Hong Kong
//   line, which always converts, is N/A; its fees are still in `brokerFees`.
//
// The catalogue has no ISINs from the grid; the books are keyed by ISIN, so
// a row without one is matched to the shared stock and ETF lists
// (listIsins.mjs), as accepted.mjs does when the catalogue is written.
// No lot is enforced: the tariff is by value.
//
//   node brokers/eastmoney/eastmoney_cost.mjs 600519 XSHG CNY --shares=100 --price=1450
//   node brokers/eastmoney/eastmoney_cost.mjs 510300 XSHG CNY --shares=1000 --price=4.6
//   node brokers/eastmoney/eastmoney_cost.mjs 00700 XHKG HKD --shares=100 --price=600
//
// `roundTrip(...)` reads files, not the network. `priceRow(row, ...)`
// prices a catalogue row directly.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { listIdentity } from "../../listIsins.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "eastmoney";
const CATALOGUE = new URL("eastmoney-parsed.json", import.meta.url);
const PAGE = "https://www.18.cn/onlineService/gsgg/sfgs?id=499";
const READ_ON = "2026-10-19";
const CASH = "CNY";

const CEILING = 0.003;
const FLOOR = 5; // CNY, or HKD on Southbound
const SH_TRANSFER = 0.00001;
const CN_STAMP_SELL = 0.0005;
const HK = {
  levy: 0.000027,
  afrc: 0.0000015,
  tradingFee: 0.0000565,
  settlement: 0.000042,
  stamp: 0.001,
};
const FREE_BOND_ETFS = new Set(["511020", "511030", "511160", "511360", "159650", "159651"]);
const MONEY_NAME = /货币|添益|日利|快线|现金|保证金|财富宝/;

const REMARK_CEILING = "The account's rate can be lower.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

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

function marketOf(mic) {
  if (mic === "XSHG" || mic === "XSHE") return "CN";
  if (mic === "BJSE") return "BJ";
  if (mic === "XHKG") return "HK";
  return null;
}

function freeFund(row) {
  const ticker = String(row.ticker || "").trim();
  if (FREE_BOND_ETFS.has(ticker)) return true;
  if (code(row.type) !== "ETF") return false;
  return MONEY_NAME.test(String(row.name || "")) || /^511[6-9]\d\d$/.test(ticker);
}

// Per-side legs in the listing currency, for a notional of `amount`.
function legsOf(market, mic, type, row, amount) {
  const fund = type !== "STOCK";
  const free = market === "CN" && fund && freeFund(row);
  const commission = free ? 0 : Math.max(FLOOR, amount * CEILING);
  if (market === "HK") {
    const levies = amount * (HK.levy + HK.afrc + HK.tradingFee + HK.settlement);
    const stamp = fund ? 0 : Math.max(1, Math.ceil(amount * HK.stamp));
    return { buy: { commission, levies, stamp }, sell: { commission, levies, stamp }, free };
  }
  const transfer = market === "CN" && mic === "XSHG" && !fund ? amount * SH_TRANSFER : 0;
  const stampSell = fund ? 0 : amount * CN_STAMP_SELL;
  return {
    buy: { commission, levies: transfer, stamp: 0 },
    sell: { commission, levies: transfer, stamp: stampSell },
    free,
  };
}

export function priceRow(row, { shares, price, bp = null, perShare = null, venue = null, unsourced = null } = {}) {
  const key = venue || unsourced ? { venue, unsourced } : listingKey(row);
  const isin = code(row.isin) || listIdentity(row)?.isin || "";
  const mic = key.venue?.mic ?? code(row.mic);
  const market = marketOf(mic);
  const book = spreadLeaf(spreads, {
    isin,
    mic: mic || null,
    currency: row.currency,
    unsourced: key.unsourced,
    broker: FOLDER,
    ticker: row.ticker,
  });
  const listing = {
    isin: isin || null,
    ticker: row.ticker || null,
    name: row.name || null,
    type: code(row.type) || null,
    mic: book.mic ?? mic ?? null,
    exchange: key.venue?.name ?? key.unsourced?.name ?? row.exchange ?? null,
    currency: code(row.currency),
    brokerExchange: row.exchange || null,
  };
  const held = depositHas(FOLDER, null, listingCash(listing.currency));
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const remark = [REMARK_CEILING, row.remark].filter(Boolean).join(" ");
  const shared = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    onlineBuy: true,
    cashCurrency: CASH,
    url: PAGE,
    remark,
    listing,
    basis:
      `barème « 佣金收取标准 » publié le 13 mars 2026, relu le ${READ_ON}. ` +
      (market === "HK"
        ? "Commission au plafond 0,3 %, plancher 5 HKD ; prélèvements HKEX, SFC, AFRC et règlement ; timbre 0,1 % chaque sens sur une action."
        : `Commission au plafond 0,3 %, plancher 5 CNY${market === "CN" && mic === "XSHG" ? " ; transfert Shanghai 0,001 % chaque sens" : ""} ; timbre 0,05 % à la vente sur une action.`),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!market) return { ...shared, why: `pas de barème East Money pour ${listing.exchange}` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalUsd == null) return { ...shared, why: `aucun cours en dollars pour ${listing.currency} dans fx.mjs` };

  const legs = legsOf(market, mic, listing.type, row, notional);
  const commission = legs.buy.commission + legs.sell.commission;
  const levies = legs.buy.levies + legs.sell.levies;
  const stamp = legs.buy.stamp + legs.sell.stamp;
  const commissionUsd = dollars(commission, listing.currency);
  const leviesUsd = dollars(levies + stamp, listing.currency);
  // Southbound converts CNY to HKD and back at ChinaClear's settlement rate.
  const fxUsd = held ? 0 : null;
  const brokerFees = commissionUsd;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: key.venue,
    unsourced: key.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd, fxUsd);
  const why = [
    fxUsd == null
      ? "change forcé CNY → HKD au taux de règlement de ChinaClear (港股通) : aucune marge publiée"
      : null,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${key.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: legs.free ? 0 : CEILING,
      min: legs.free ? 0 : FLOOR,
      ceiling: true,
      eachWay: true,
      currency: listing.currency,
      free: legs.free,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(leviesUsd, 6),
      change: fxUsd,
      courtageLocal: finite(commission, 6),
      prélèvementsLocal: finite(levies, 6),
      timbreLocal: finite(stamp, 6),
    },
  };
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
    cashCurrency: CASH,
    url: PAGE,
    remark: REMARK_CEILING,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue East Money n'existe pas encore : lancer `node brokers/eastmoney/eastmoney_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue East Money` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez East Money`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }
  const m = matches[0];
  return {
    ...answer,
    ...priceRow(m.row, { shares, price, bp, perShare, venue: m.venue, unsourced: m.unsourced }),
    etf,
    place,
    currency,
  };
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
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
