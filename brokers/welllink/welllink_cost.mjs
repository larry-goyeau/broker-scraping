// What one round trip costs at Well Link Securities (立橋證券, Hong Kong): buy
// n shares at price p, sell them straight back, in dollars. Electronic
// order (the app). Phone orders (人手下單), margin, IPOs, options and futures
// stay out.
//
// Fee tables read on 2026-10-26 (https://www.wlsec.com/commissions and the
// three PDF schedules it links):
//   Hong Kong stocks and ETFs ("證券服務收費表 (港股)", 二零二五年六月), each side
//     commission 0.028 %, minimum 28 HKD; platform fee 0
//     settlement fee 0.005 % (0.0042 % of it for HKSCC), minimum 5 HKD
//     stamp 0.1 %, a part of a dollar counts as one HKD (0 on an ETF or a REIT)
//     SFC 0.0027 %, HKEX 0.00565 %, AFRC 0.00015 %, each to the nearest cent
//     A USD or RMB counter pays in its own currency ("非港幣結算的香港上市產品
//     以相關結算貨幣收取交易佣金及收費"): the 28 and 5 HKD floors are taken at
//     their equivalent (fx.mjs).
//     Odd lots are dealt by hand at the phone rate ("碎股交易透過人手進行");
//     the online ticket is priced on the notional (../primehk/hkexCost.mjs).
//     https://www.wlsec.com/_files/ugd/b0a966_56d36993f4d8448890df97487a585e1b.pdf
//   China Connect A shares ("證券服務收費表 (滬 / 深港通 A 股)", 二零二六年九月)
//     commission 0.028 %, minimum 28 RMB; platform fee 0
//     handling 0.00341 % (the table prints no ETF rate, so an ETF pays it
//     too), CSRC 0.002 % (ETF exempt), transfer 0.003 % (ChinaClear 0.001 %,
//     ETF exempt, and HKSCC 0.002 %), stamp 0.05 % on the sale (an ETF pays
//     none). The 0.008 % a year portfolio fee is not per trade.
//     https://www.wlsec.com/_files/ugd/b0a966_0b7d164404044350a6f6587e3ae25d14.pdf
//   US listed stocks and ETFs ("證券服務收費表（美股）", 二零二六年十月)
//     commission 0.0099 USD a share, minimum 1.99 USD an order; platform 0
//     SEC 0.00206 % of the sale, minimum 0.01 USD
//     FINRA TAF 0.000195 USD a share sold, minimum 0.01, maximum 9.79, not
//     charged from 1 Oct to 31 Dec 2026 (../wellstrade/usCost.mjs knows the
//     pause). No CAT or clearing line is printed: 0.
//     The 0.12 % Italian / 0.3 % French FTT on an ADR purchase comes from
//     the tax map (usCost).
//     https://www.wlsec.com/_files/ugd/b0a966_884ac1ab91fd452ebcb80e457da06a33.pdf
//
// Cash: HKD, USD and CNH (deposits.mjs), so no line is converted. Well Link
// prints no FX margin ("兌換匯率隨外匯牌價變化而定"), so there is no FX remark.
// Well Link names no US broker-dealer: the US book is the quoted NBBO.
//
//   node brokers/welllink/welllink_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/welllink/welllink_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/welllink/welllink_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//   node brokers/welllink/welllink_cost.mjs 510050 "Shanghai Stock Exchange" CNH --shares=1000 --price=3
//   node brokers/welllink/welllink_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { cashOf, connectRoundTrip, engineOf, printCli } from "../bocomhk/hkMarketsCost.mjs";

const FOLDER = "welllink";
const CATALOGUE = new URL("welllink-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGE = "https://www.wlsec.com/commissions";
const PAGES = {
  HK: "https://www.wlsec.com/_files/ugd/b0a966_56d36993f4d8448890df97487a585e1b.pdf",
  CN: "https://www.wlsec.com/_files/ugd/b0a966_0b7d164404044350a6f6587e3ae25d14.pdf",
  US: "https://www.wlsec.com/_files/ugd/b0a966_884ac1ab91fd452ebcb80e457da06a33.pdf",
};
const CASH = cashOf(FOLDER);

const HK = {
  broker: "Well Link",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.HK,
  readOn: READ_ON,
  channel: "ordre électronique (appli)",
  commission: { rate: 0.00028, min: 28 },
  settlement: { rate: 0.00005, min: 5, label: "frais de règlement (dont 0,0042 % HKSCC)" },
  cash: CASH,
  fxEach: null,
};

const CN = {
  broker: "Well Link",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.CN,
  readOn: READ_ON,
  channel: "ordre électronique (appli)",
  commission: { rate: 0.00028, min: 28 },
  levies: { etf: { handling: 0.0000341 } },
  cash: CASH,
  fxEach: null,
};

const US = {
  broker: "Well Link",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.US,
  readOn: READ_ON,
  entity: "Well Link Securities Limited",
  rule606: null,
  cash: "USD",
  ticket: ({ shares }) => Math.max(1.99, Math.round(shares * 0.0099 * 100) / 100),
  levies: { sec: "penny", taf: "penny", cat: false },
  basis: `ordre électronique, barème Well Link relu le ${READ_ON}. Courtage 0,0099 USD par action, plancher 1,99 USD par ordre ; pas de frais de plateforme ; SEC 0,00206 % de la vente (plancher 0,01 USD) ; TAF 0,000195 USD par action vendue (0,01 à 9,79 USD), suspendue du 1er octobre au 31 décembre 2026. Vente identique.`,
  notes: ["aucun courtier américain nommé : NBBO coté", "aucune ligne CAT ni frais de compensation imprimés : 0"],
};

export function roundTrip(query) {
  const market = engineOf(CATALOGUE, query);
  if (market === "CN") return connectRoundTrip(CN, query);
  if (market === "US") return usRoundTrip(US, query);
  return hkexRoundTrip(HK, query);
}

export const SCHEDULE = { page: PAGE, pages: PAGES, readOn: READ_ON, hk: HK, cn: CN, us: US };

printCli(import.meta.url, roundTrip);
