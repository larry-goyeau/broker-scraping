// What one round trip costs at Nomura Securities (野村證券): buy n shares at
// price p, sell them back at once, in dollars. Orders placed through the
// online service (オンラインサービス: web and app). Phone and counter orders,
// まめ株 (odd lots), margin, NISA, 株式積立 and the VWAP-guarantee and
// over-the-counter foreign trades stay out.
//
// Read 2026-10-20.
//
// Two account types price an online order differently, so there are two
// plans (`plan`):
//   netcall  an account at the online-only branches (野村ネット＆コール,
//            ほっとダイレクト). The default.
//   branch   an account at a branch (本・支店), order placed online.
//
//   Japan, cash, one order, tax included, shares, ETF, ETN, REIT
//     netcall, online column
//       up to 100 000 ¥             152 ¥
//       up to 300 000 ¥             330 ¥
//       up to 500 000 ¥             524 ¥
//       up to 1 000 000 ¥         1 048 ¥
//       up to 2 000 000 ¥         2 095 ¥
//       up to 3 000 000 ¥         3 143 ¥
//       up to 5 000 000 ¥         5 238 ¥
//       up to 10 000 000 ¥       10 476 ¥
//       up to 20 000 000 ¥       20 952 ¥
//       up to 30 000 000 ¥       31 429 ¥
//       up to 50 000 000 ¥       41 905 ¥
//       above                    78 571 ¥
//     branch, basic table
//       up to 200 000 ¥           2 860 ¥
//       up to 500 000 ¥           1.43 %
//       up to 700 000 ¥           1.10 % + 1 650 ¥
//       up to 1 000 000 ¥         0.946 % + 2 728 ¥
//       up to 3 000 000 ¥         0.88 % + 3 388 ¥
//       up to 5 000 000 ¥         0.847 % + 4 378 ¥
//       up to 10 000 000 ¥        0.704 % + 11 528 ¥
//       up to 30 000 000 ¥        0.572 % + 24 728 ¥
//       up to 50 000 000 ¥        0.264 % + 117 128 ¥
//       above                     0.11 % + 194 128 ¥
//     An online order is 20 % off that table, or 50 % off with 野村のエコ割
//     (free: web delivery and e-mail delivery switched on; 30 % with two
//     of the three items, 25 % with one). The 50 % is used here, as the
//     fee page's own comparison does (500 000 ¥ -> 3 575 ¥). Eco-wari does
//     not exist at the online-only branches.
//     Yen fractions are dropped (the page says the charged fee can be
//     lower than the table because of rounding).
//
//   Foreign shares and ETFs, 委託取引, one order, tax included
//     (US: NYSE, Nasdaq, Cboe BZX; Hong Kong; Xetra; ASX)
//     国内手数料 on the yen amount of the order
//     netcall, online column
//       up to 200 000 ¥           2 389 ¥
//       up to 300 000 ¥           3 142 ¥
//       up to 400 000 ¥           4 274 ¥
//       up to 500 000 ¥           5 405 ¥
//       up to 750 000 ¥           5 866 ¥
//       up to 1 000 000 ¥         6 160 ¥
//       up to 1 500 000 ¥         8 045 ¥
//       up to 2 000 000 ¥        11 817 ¥
//       up to 2 500 000 ¥        15 420 ¥
//       up to 3 000 000 ¥        18 857 ¥
//       up to 5 000 000 ¥        22 125 ¥
//       up to 10 000 000 ¥       36 038 ¥
//       up to 20 000 000 ¥       70 400 ¥
//       up to 30 000 000 ¥      137 447 ¥
//       up to 50 000 000 ¥      188 570 ¥
//       above                   251 429 ¥
//     branch, basic table, 20 % off online (Eco-wari does not apply)
//       up to 71 000 ¥            11.00 %
//       up to 750 000 ¥           7 810 ¥
//       up to 5 000 000 ¥         1.045 %
//       up to 10 000 000 ¥        0.825 % + 11 000 ¥
//       up to 50 000 000 ¥        0.616 % + 31 900 ¥
//       up to 100 000 000 ¥       0.418 % + 130 900 ¥
//       above                     0.198 % + 350 900 ¥
//     The amount is the fill plus local fees and taxes on a buy, minus
//     them on a sale; this file uses the fill. One online order is below
//     100 000 000 ¥.
//     On top: 現地手数料 (the local broker's commission) and 現地諸費用・税.
//     Nomura writes only that they differ by country and region. No page
//     gives a rate. The 20 % online discount is on the 国内手数料 only
//     (契約締結前交付書面: 国内での売買手数料以外は割引の対象外).
//
// Where the local commission was looked for, 2026-10-20 (no market has a
// rate; every foreign line answers N/A, with the published parts beside
// it, as at MUFG Morgan Stanley):
//   - Fee pages, fee overview, foreign-stock and foreign-ETF pages, online
//     foreign-stock rule page, 適用為替 page, risk and fee page, documents
//     page, 2020-02-20 online notice and 2020-02-25 launch notice, FAQ 294,
//     10081, 10083, 10090: "differs by country and region", no number.
//   - 契約締結前交付書面 for listed securities (the 上場有価証券等書面),
//     No.52625P-R ('26.04), personal_risk_202604.pdf, ※2: the 現地諸費用 of a
//     foreign trade are set by market conditions at the time, so the
//     document cannot state the amount in advance. The 2015-04 and 2025-02
//     editions say the same.
//   - 野村の証券取引約款 (2026-10), ch. 7 外国証券取引口座約款, art. 3 ④: a
//     foreign trade pays the commission of the market it is passed to,
//     its taxes and other public levies (公租公課その他の賦課金), and
//     Nomura's own fee. So the local regulatory charges are passed on.
//   - Online help for the buy and sell order, and for the order inquiry
//     (inquiry_fstock.html): the estimate and the fill show three separate
//     local lines, 現地手数料, 現地諸費用 and 現地取引税等, each "based on
//     the local amount", with no rate. FAQ 10083 and the order rule page:
//     買付概算金 = (price × shares + 現地手数料 + 現地取引税等) × rate × 105 %
//     + fee. The online manuals (sousatebiki G/H/P, start) carry none.
//   - Wayback: the old foreign fee page (service/commission/broker/
//     fstock.html, 2006-06 to 2011-08) printed only the domestic table and
//     the same "fees and taxes of the foreign market" sentence; the old
//     foreign-stock page (retail/fstock/, 2019-03-31) lists 現地手数料 +
//     現地諸費用・税 + 国内取次手数料 with no rate. No local table was ever
//     printed (unlike MUFG Morgan Stanley's 0.25 % / 0.50 %, before 2021).
//   - Other Japanese files here: ../mitsubishiufjmorgan has the same N/A
//     (same "cannot be stated in advance" sentence). Monex (Hong Kong) and
//     Rakuten (Hong Kong, ASEAN) bear the local commission; SBI, Rakuten,
//     Monex and eSmart charge one all-in US rate (0.495 %, cap 22 USD).
//     None has a local-broker figure for the US, Hong Kong, Xetra or ASX
//     that would carry over to Nomura.
//   - Third parties, evidence only, none quotes a Nomura document or a
//     local fee: soico.jp (2025-12-20) gives Nomura's US fee as 0.495 %,
//     which contradicts Nomura's own yen table; kabukiso.com (updated
//     2026-07-30) 2 389 ¥ from and 25 or 50 sen; hedge.guide (2021-05-14)
//     6 160 ¥ for 1 000 000 ¥; kakaku.com (2026-04-13) "up to 1.045 %,
//     local fees vary"; diamond.jp/zai no figure. No published 取引報告書
//     of a Nomura online foreign trade was found.
//   Public local charges (still no total without the commission):
//     US     SEC fee on the sale, 20.60 $ per million from 2026-04-04 (SEC
//            fee-rate advisory 2026-2), passed on under art. 3 ④. It is
//            shown in the published parts, rounded up to the cent.
//     HK     stamp and HKEX/SFC/AFRC/CCASS charges, below.
//     Xetra  no transaction tax; exchange and clearing fees are the local
//            broker's and are not published.
//     ASX    no transaction tax or stamp; same.
//
// Conversion (適用為替スプレッド, from 2026-08-24, yen per unit, each way):
//   USD  0.50 below 100 000, 0.25 from 100 000, quoted on request from 1 000 000
//   EUR  0.75 below 100 000, 0.37 from 100 000, on request from 1 000 000
//   AUD  0.80 below 100 000, 0.40 from 100 000, on request from 1 000 000
//   HKD  0.15 below 7 000 000, on request from 7 000 000
// The account holds JPY, USD, EUR and AUD (../../deposits.mjs), so a US,
// Xetra or ASX line gets the spread as a remark. Hong Kong dollars are not
// a deposit currency there, so a Hong Kong trade pays the 0.15 ¥ both ways
// inside the number. (The 外貨決済サービス page and the online rule page do
// list HKD settlement; deposits.mjs is followed.)
//
// Hong Kong statutory charges are HKEX's, each side, written as in
// ../monexjp/monexjp_cost.mjs: stamp 0.1 % up to the next dollar except
// an ETF, SFC 0.0027 %, AFRC 0.00015 %, trading fee 0.00565 %, CCASS
// 0.0042 %. Germany and Australia have no transaction tax; Japan has no
// stamp. Nomura prints no SEC rate; the SEC's own rate is used in the
// published parts only, since the line has no total anyway.
//
// US orders go to an unnamed local broker (現地取次先証券会社). By the
// owner's decision the US book uses the 606 of the group's US
// broker-dealer, Nomura Securities International (rule606.mjs alias
// nomurajp); its report and that of Instinet, where it routes equities,
// carry no held stock mix today, so the book is the quoted NBBO until one
// does. Fukuoka and Sapporo have no public book: the
// fee is computed and the total is N/A.
//
//   https://www.nomura.co.jp/solution/financial-assets/service/commission/
//   https://www.nomura.co.jp/solution/financial-assets/service/commission/netcall/
//   https://www.nomura.co.jp/solution/financial-assets/service/commission/honshiten/
//   https://www.nomura.co.jp/solution/financial-assets/service/commission/honshiten/ecowari.html
//   https://www.nomura.co.jp/solution/financial-assets/fstock/
//   https://www.nomura.co.jp/onlineservice/help/rule/deal_inquiry/fstock_rule.html
//   https://www.nomura.co.jp/solution/financial-assets/retail/exrate.html
//   https://www.nomura.co.jp/solution/financial-assets/service/f-exchange/
//   https://www.nomura.co.jp/introduc/news/2020/20200225_1.html
//   https://www.nomura.co.jp/guide/inclusion_risk/
//   https://faq.nomura.co.jp/faq_detail.html?id=294
//   https://faq.nomura.co.jp/onlineservice/faq_detail.html?id=10081
//   https://faq.nomura.co.jp/onlineservice/faq_detail.html?id=10090
//   https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en
// Read 2026-10-20 for the local-commission search:
//   https://www.nomura.co.jp/hometrade_c/risk/pdf/personal_risk_202604.pdf
//   https://www.nomura.co.jp/hometrade_c/risk/pdf/personal_risk_202502.pdf
//   https://www.nomura.co.jp/hometrade_c/risk/pdf/personal_risk_201504.pdf
//   https://www.nomura.co.jp/onlineservice/writing/risk/
//   https://www.nomura.co.jp/guide/n_article.html
//   https://www.nomura.co.jp/guide/pdf/personal_article.pdf
//   https://www.nomura.co.jp/guide/n_article/documents.html
//   https://www.nomura.co.jp/onlineservice/help/deal_inquiry/foreign_stock/fstock_buy_order.html
//   https://www.nomura.co.jp/onlineservice/help/deal_inquiry/foreign_stock/fstock_sell_order.html
//   https://www.nomura.co.jp/onlineservice/help/deal_inquiry/inquiry/inquiry_fstock.html
//   https://www.nomura.co.jp/onlineservice/help/rule/deal_inquiry/order_rule.html
//   https://www.nomura.co.jp/onlineservice/help/common/hometrade_sousatebiki_G.pdf
//   https://www.nomura.co.jp/onlineservice/news/trading/2020/20200220gaikabu.html
//   https://www.nomura.co.jp/solution/financial-assets/fstock/fetf/
//   https://www.nomura.co.jp/introduc/news/2023/20230206_1.html
//   https://faq.nomura.co.jp/onlineservice/faq_detail.html?id=10083
//   https://web.archive.org/web/20110818114024/http://www.nomura.co.jp/service/commission/broker/fstock.html
//   https://web.archive.org/web/20190331111756/https://www.nomura.co.jp/retail/fstock/
//   https://www.soico.jp/no1/news/securities/4911
//   https://kabukiso.com/america/commission.html
//   https://hedge.guide/feature/nomura-securities-fees-comparison.html
//   https://kakaku.com/stock/stock_companydetail.asp?companycd=1034
//   https://diamond.jp/zai/ud/securities/622cc8a8776561733a210000
//   https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2
//
//   node brokers/nomurajp/nomurajp_cost.mjs 7203 Tokyo JPY --shares=100 --price=3011
//   node brokers/nomurajp/nomurajp_cost.mjs 7203 Tokyo JPY --plan=branch --shares=100 --price=3011
//   node brokers/nomurajp/nomurajp_cost.mjs AAPL XNAS USD --shares=10 --price=343.46
//   node brokers/nomurajp/nomurajp_cost.mjs 700 HKEX HKD --shares=100 --price=415
//   node brokers/nomurajp/nomurajp_cost.mjs DE0007164600 XETRA EUR --shares=10 --price=200
//   node brokers/nomurajp/nomurajp_cost.mjs AU000000BHP4 ASX AUD --shares=100 --price=45
//   node brokers/nomurajp/nomurajp_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("nomurajp-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.nomura.co.jp/solution/financial-assets/service/commission/",
  netcall: "https://www.nomura.co.jp/solution/financial-assets/service/commission/netcall/",
  branch: "https://www.nomura.co.jp/solution/financial-assets/service/commission/honshiten/",
  ecowari: "https://www.nomura.co.jp/solution/financial-assets/service/commission/honshiten/ecowari.html",
  foreign: "https://www.nomura.co.jp/solution/financial-assets/fstock/",
  rules: "https://www.nomura.co.jp/onlineservice/help/rule/deal_inquiry/fstock_rule.html",
  fx: "https://www.nomura.co.jp/solution/financial-assets/retail/exrate.html",
  fxAccount: "https://www.nomura.co.jp/solution/financial-assets/service/f-exchange/",
  launch: "https://www.nomura.co.jp/introduc/news/2020/20200225_1.html",
  risk: "https://www.nomura.co.jp/guide/inclusion_risk/",
  faq: "https://faq.nomura.co.jp/onlineservice/faq_detail.html?id=10081",
  hkex: "https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en",
  precontract: "https://www.nomura.co.jp/hometrade_c/risk/pdf/personal_risk_202604.pdf",
  terms: "https://www.nomura.co.jp/guide/pdf/personal_article.pdf",
  inquiry: "https://www.nomura.co.jp/onlineservice/help/deal_inquiry/inquiry/inquiry_fstock.html",
  sec: "https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2",
  secOn: "2026-04-04",
  readOn: "2026-10-20",
  fxOn: "2026-08-24",
  entity: "野村證券",
  venue: "local broker, not named (現地取次先証券会社)",
};

export const PLANS = [
  { id: "netcall", label: "野村ネット＆コール / ほっとダイレクト (online-only branch)" },
  { id: "branch", label: "本・支店 account, online order" },
];
export const DEFAULT_PLAN = "netcall";

// [upper bound ¥, rate, add ¥], tax included. A null rate is a flat fee.
const JP_NETCALL = [
  [100_000, null, 152],
  [300_000, null, 330],
  [500_000, null, 524],
  [1_000_000, null, 1_048],
  [2_000_000, null, 2_095],
  [3_000_000, null, 3_143],
  [5_000_000, null, 5_238],
  [10_000_000, null, 10_476],
  [20_000_000, null, 20_952],
  [30_000_000, null, 31_429],
  [50_000_000, null, 41_905],
  [Infinity, null, 78_571],
];
const JP_BRANCH = [
  [200_000, null, 2_860],
  [500_000, 0.0143, 0],
  [700_000, 0.011, 1_650],
  [1_000_000, 0.00946, 2_728],
  [3_000_000, 0.0088, 3_388],
  [5_000_000, 0.00847, 4_378],
  [10_000_000, 0.00704, 11_528],
  [30_000_000, 0.00572, 24_728],
  [50_000_000, 0.00264, 117_128],
  [Infinity, 0.0011, 194_128],
];
// 野村のエコ割, all three items registered.
const JP_BRANCH_ONLINE = 0.5;
const FOREIGN_NETCALL = [
  [200_000, null, 2_389],
  [300_000, null, 3_142],
  [400_000, null, 4_274],
  [500_000, null, 5_405],
  [750_000, null, 5_866],
  [1_000_000, null, 6_160],
  [1_500_000, null, 8_045],
  [2_000_000, null, 11_817],
  [2_500_000, null, 15_420],
  [3_000_000, null, 18_857],
  [5_000_000, null, 22_125],
  [10_000_000, null, 36_038],
  [20_000_000, null, 70_400],
  [30_000_000, null, 137_447],
  [50_000_000, null, 188_570],
  [Infinity, null, 251_429],
];
const FOREIGN_BRANCH = [
  [71_000, 0.11, 0],
  [750_000, null, 7_810],
  [5_000_000, 0.01045, 0],
  [10_000_000, 0.00825, 11_000],
  [50_000_000, 0.00616, 31_900],
  [100_000_000, 0.00418, 130_900],
  [Infinity, 0.00198, 350_900],
];
const FOREIGN_BRANCH_ONLINE = 0.8;
const FOREIGN_ORDER_CAP_YEN = 100_000_000;

// 適用為替スプレッド, yen per unit each way: [below this amount, yen]. Past
// the last bound the rate is quoted on request (null).
const FX_YEN = {
  USD: [[100_000, 0.5], [1_000_000, 0.25]],
  EUR: [[100_000, 0.75], [1_000_000, 0.37]],
  AUD: [[100_000, 0.8], [1_000_000, 0.4]],
  HKD: [[7_000_000, 0.15]],
};

// SEC Section 31 fee on a US sale, 20.60 $ per million (advisory 2026-2).
const SEC_RATE = 0.0000206;

const HK_STAMP = 0.001;
const HK_SFC = 0.000027;
const HK_AFRC = 0.0000015;
const HK_TRADING = 0.0000565;
const HK_CCASS = 0.000042;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);
const FOREIGN = { HKEX: "HKEX", XETRA: "XETRA", ASX: "ASX" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function inCurrency(amount, from, to) {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

export function planOf(id = DEFAULT_PLAN) {
  return PLANS.find((p) => p.id === String(id || DEFAULT_PLAN).toLowerCase()) || null;
}

function stepFee(yen, steps, factor = 1) {
  if (!(yen > 0)) return null;
  for (const [upTo, rate, add] of steps) {
    if (yen <= upTo) return Math.floor(((rate == null ? 0 : yen * rate) + add) * factor + 1e-9);
  }
  return null;
}

function japanLeg(yen, plan) {
  return plan === "branch" ? stepFee(yen, JP_BRANCH, JP_BRANCH_ONLINE) : stepFee(yen, JP_NETCALL);
}

function foreignLeg(yen, plan) {
  return plan === "branch" ? stepFee(yen, FOREIGN_BRANCH, FOREIGN_BRANCH_ONLINE) : stepFee(yen, FOREIGN_NETCALL);
}

// Yen per unit for an amount in that currency, or null past the published lines.
function fxYen(currency, amount) {
  const steps = FX_YEN[currency];
  if (!steps || !(amount > 0)) return null;
  for (const [below, yen] of steps) if (amount < below) return yen;
  return null;
}

function fxPct(currency, amount) {
  const yen = fxYen(currency, amount);
  const unit = usdPer(currency);
  const jpy = usdPer("JPY");
  if (yen == null || !(unit > 0) || !(jpy > 0)) return null;
  return (yen / (unit / jpy)) * 100;
}

function nearestCent(amount) {
  return Math.round(amount * 100 + 1e-9) / 100;
}

// SEC fee on the sale, rounded up to the cent (Nomura prints no rounding).
function secFee(notionalUsd) {
  if (!(notionalUsd > 0)) return null;
  return Math.ceil(notionalUsd * SEC_RATE * 100 - 1e-9) / 100;
}

// HKEX, one side. Stamp is waived on an ETF. The compensation levy is 0.
function hkPlace(notionalHkd, type) {
  if (!(notionalHkd > 0)) return null;
  const stamp = type === "ETF" || type === "ETN" ? 0 : Math.ceil(notionalHkd * HK_STAMP - 1e-9);
  return (
    stamp +
    nearestCent(notionalHkd * HK_SFC) +
    nearestCent(notionalHkd * HK_AFRC) +
    nearestCent(notionalHkd * HK_TRADING) +
    nearestCent(notionalHkd * HK_CCASS)
  );
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

const JP_LABEL = {
  netcall: "152 ¥ jusqu'à 100 000 ¥, 524 ¥ jusqu'à 500 000 ¥, 1 048 ¥ jusqu'à 1 000 000 ¥ … 78 571 ¥ au-delà de 50 000 000 ¥",
  branch: "barème de base (2 860 ¥ jusqu'à 200 000 ¥, 1,43 % jusqu'à 500 000 ¥ …) moins 50 % avec la エコ割",
};
const FOREIGN_LABEL = {
  netcall: "国内手数料 2 389 ¥ jusqu'à 200 000 ¥ … 6 160 ¥ jusqu'à 1 000 000 ¥ … 251 429 ¥ au-delà de 50 000 000 ¥",
  branch: "国内手数料 11 % jusqu'à 71 000 ¥, 7 810 ¥ jusqu'à 750 000 ¥, 1,045 % jusqu'à 5 000 000 ¥ …, moins 20 % en ligne",
};

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: "JPY",
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (${PLANS.map((p) => p.id).join("|")})` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Nomura n'existe pas encore : lancer `node brokers/nomurajp/nomurajp_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Nomura` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Nomura`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "nomurajp",
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
  };
  const market = loose(listing.brokerExchange);
  const japan = JAPAN.has(market);
  const american = US_MICS.has(market) && listing.currency === "USD";
  const foreignMarket = FOREIGN[market] || null;
  const hongKong = foreignMarket === "HKEX";
  if (!japan && !american && !foreignMarket) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  // Cash in the listing currency when the account holds it; else yen.
  const held = japan || depositHas("nomurajp", null, listing.currency);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? listing.currency : "JPY",
    url: picked.id === "branch" ? SCHEDULE.branch : SCHEDULE.netcall,
    basis: japan
      ? `${picked.id === "branch" ? "compte 本・支店, ordre en ligne" : "野村ネット＆コール / ほっとダイレクト, ordre en ligne"}, lu le ${SCHEDULE.readOn} : ${JP_LABEL[picked.id]}, TTC par ordre`
      : `外国株式委託取引 Nomura en ligne (${picked.id === "branch" ? "compte 本・支店" : "野村ネット＆コール / ほっとダイレクト"}), lu le ${SCHEDULE.readOn} : ${FOREIGN_LABEL[picked.id]}, TTC par ordre, plus 現地手数料 non publié`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null) {
    // Nomura Securities International's 606 (rule606.mjs); the quoted NBBO
    // when its report has no stock mix.
    const quoted = usBookPerShare({ broker: "nomurajp", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const bookNote =
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`;
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };

  if (!japan) {
    const yen = inCurrency(notional, listing.currency, "JPY");
    const tooBig = yen != null && yen >= FOREIGN_ORDER_CAP_YEN;
    const one = foreignLeg(yen, picked.id);
    const domesticUsd = one == null ? null : dollars(one * 2, "JPY");
    // Forced conversion only when the account cannot hold the currency.
    const rateYen = fxYen(listing.currency, notional);
    const fxUsd = held
      ? 0
      : rateYen == null || notionalUsd == null
        ? null
        : dollars(notional * rateYen * 2, "JPY");
    const pct = held ? fxPct(listing.currency, notional) : null;
    const remark = held ? fxRemark(pct == null ? "" : pct.toFixed(3), listing.currency) : "";
    let placeUsd = 0;
    if (american) placeUsd = secFee(notional);
    if (hongKong) {
      const hkd = inCurrency(notional, listing.currency, "HKD");
      const side = hkPlace(hkd, listing.type);
      placeUsd = side == null ? null : dollars(side * 2, "HKD");
    }
    const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, placeUsd);
    const unpublished =
      `le 現地手数料 (commission du courtier local) n'est pas publié : Nomura écrit seulement qu'il varie selon le pays ` +
      `et le 契約締結前交付書面 (No.52625P-R, 2026-04) qu'il ne peut être indiqué à l'avance ` +
      `(pages des frais, page actions étrangères, règles et aide en ligne, FAQ, 約款, archives Wayback, lus le ${SCHEDULE.readOn})`;
    const why = [
      tooBig ? `un ordre en ligne doit rester sous ${FOREIGN_ORDER_CAP_YEN.toLocaleString("fr-FR")} ¥` : null,
      unpublished,
      !held && rateYen == null ? `change ${listing.currency} au-delà du dernier palier : taux sur demande, non publié` : null,
    ]
      .filter(Boolean)
      .join(" ; ");
    return {
      ...shared,
      remark,
      why,
      commission: {
        domestic: (picked.id === "branch" ? FOREIGN_BRANCH : FOREIGN_NETCALL).map(([upTo, rate, add]) => ({ upTo, rate, add })),
        factor: picked.id === "branch" ? FOREIGN_BRANCH_ONLINE : 1,
        perOrder: one,
        local: null,
        currency: "JPY",
        eachWay: true,
      },
      bp: marketBp,
      perShare: marketPerShare,
      trade,
      published: {
        marché: finite(bookUsd, 6),
        国内手数料: finite(domesticUsd, 6),
        現地手数料: null,
        change: finite(fxUsd, 6),
        taxes: finite(taxUsd, 6),
      },
      confidence: [
        shared.basis,
        "commission locale non publiée : pas de total (ni les pages, ni le 契約締結前交付書面 2026-04, ni le 約款, ni les archives Wayback, ni les comparateurs ne donnent de taux Nomura ; aucun 取引報告書 publié trouvé)",
        "約款 ch. 7 art. 3 ④ : commission du marché local, taxes et prélèvements publics refacturés ; l'écran d'ordre montre 現地手数料, 現地諸費用 et 現地取引税等 à part, sans taux",
        held
          ? `compte en ${listing.currency} : change hors du chiffre`
          : `${listing.currency} n'est pas une devise de dépôt : change ${rateYen ?? "?"} ¥ par unité dans chaque sens, dans le chiffre`,
        hongKong
          ? "timbre et frais HKEX au barème public (timbre, SFC, AFRC, négociation, CCASS)"
          : american
            ? `courtier local non nommé ; frais SEC ${SEC_RATE} à la vente au taux de la SEC (${SCHEDULE.secOn}), Nomura n'imprime pas de taux`
            : `pas de taxe de transaction sur cette place ; frais de bourse et de compensation du courtier local non publiés`,
        bookNote,
      ].join(" ; "),
    };
  }

  const one = japanLeg(notional, picked.id);
  const commissionUsd = one == null ? null : dollars(one * 2, "JPY");
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    picked.id === "branch"
      ? "エコ割 à 50 % (remise électronique et courriel activés, gratuits) ; sans elle 20 %"
      : "agence en ligne : pas d'エコ割",
    "ligne en yens : pas de change",
    bookNote,
  ].join(" ; ");

  return {
    ...shared,
    remark: "",
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { perOrder: one, currency: "JPY", eachWay: true, plan: picked.id },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : {}),
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
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
          plans: PLANS,
          japanNetcall: "online, per order, tax included: 152 JPY up to 100k, 330 / 524 / 1048 / 2095 / 3143 / 5238 / 10476 / 20952 / 31429 / 41905 up to 300k / 500k / 1M / 2M / 3M / 5M / 10M / 20M / 30M / 50M, 78571 above",
          japanBranch: "basic table (2860 JPY up to 200k, 1.43 % up to 500k, 1.10 % + 1650 up to 700k, 0.946 % + 2728 up to 1M, 0.88 % + 3388 up to 3M, 0.847 % + 4378 up to 5M, 0.704 % + 11528 up to 10M, 0.572 % + 24728 up to 30M, 0.264 % + 117128 up to 50M, 0.11 % + 194128 above), 50 % off online with Eco-wari (20 % without)",
          foreignNetcall: "国内手数料, online, per order, on the yen amount: 2389 JPY up to 200k ... 6160 up to 1M ... 251429 above 50M; plus an unpublished local commission (契約締結前交付書面 No.52625P-R '26.04: cannot be stated in advance; none found in the 約款, online help, FAQ, Wayback or third parties, read 2026-10-20): N/A",
          foreignBranch: "国内手数料 basic table (11 % up to 71000, 7810 up to 750k, 1.045 % up to 5M, 0.825 % + 11000 up to 10M, 0.616 % + 31900 up to 50M, 0.418 % + 130900 up to 100M, 0.198 % + 350900 above), 20 % off online (the local part is not discounted); plus an unpublished local commission: N/A",
          conversion: `適用為替スプレッド from ${SCHEDULE.fxOn}, JPY per unit each way: USD 0.50 / 0.25 from 100k, EUR 0.75 / 0.37, AUD 0.80 / 0.40, HKD 0.15 below 7M; remark for USD, EUR, AUD (deposit currencies), in the number for HKD`,
          us: `SEC fee ${SEC_RATE} on the sale from ${SCHEDULE.secOn} (SEC rate, passed on under 約款 ch. 7 art. 3 ④), in the published parts only`,
          xetraAsx: "no transaction tax; local exchange and clearing fees not published",
          hongKong: "HKEX each side: stamp 0.1 % up to the dollar except an ETF, SFC 0.0027 %, AFRC 0.00015 %, trading fee 0.00565 %, CCASS 0.0042 %",
          rule606: "nomurasecuritiesinternational (no stock mix: quoted NBBO)",
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
      "usage : node brokers/nomurajp/nomurajp_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=netcall|branch] [--json]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}  [${planOf(out.plan)?.label || out.plan}]`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || out.published || {};
    if (out.published) console.log("  publié :");
    for (const [k, v] of Object.entries(parts)) {
      if (k === "taxes" && !v) continue;
      console.log(`  ${k.padEnd(15)}: ${show(v)}${v == null ? "" : " $"}`);
    }
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
