// What one round trip costs at Standard Chartered Bank (Hong Kong) securities
// services: buy n shares at price p, sell them straight back, in dollars.
// Online order (Online Banking, SC Mobile, SC Equities: the "Online Banking
// & SC Equities" / "Digital channel" lines). The Securities Hotline and the
// designated Northbound hotline are dearer lines and stay out, as do IPOs
// and custody (waived).
//
// "Service Charges - An easy guide to banking fees", Securities services,
// and "Securities Services – Third Party Charges" (SSTPC(03.2025)), read on
// 2026-10-26:
//   Hong Kong securities, each side
//     brokerage 0.20 %, HK$50 minimum a transaction; trade lodgement fee waived
//     stamp 0.1 % (rounded up to the nearest dollar; 0 on an ETF or a REIT)
//     SFC 0.0027 %, FRC (AFRC) 0.00015 %, HKEX trading fee 0.00565 %
//     stock settlement fee (HKSCC) 0.002 %, minimum HK$2, maximum HK$100 —
//     as SC prints it, the client-side line, not HKSCC's own 2025 tariff
//     "For transactions in RMB or USD, the relevant charges specified in RMB
//     or USD apply": none is printed for HK shares, so a USD or RMB counter
//     takes the HK$50 and HK$2 / HK$100 at their equivalent.
//   Stock Connect, each side
//     brokerage 0.20 %, RMB45 minimum
//     CSRC 0.002 % (ETF waived), handling 0.00341 % (ETF 0.004 %), ChinaClear
//     transfer 0.001 % (ETF waived), HKSCC transfer 0.002 %, stamp 0.05 % on
//     the sale (ETF waived)
//   US securities, each side
//     brokerage 0.20 %, USD 18 minimum a transaction (digital channel)
//     SEC fee 0.00206 % of the sale from 4 Apr 2026. No TAF or CAT line is
//     printed: 0 (owner's rule).
//     Foreign financial transaction tax (French 0.3 %, Italian 0.1 %,
//     Spanish 0.2 %) comes from the tax map (../wellstrade/usCost.mjs).
//   "Odd lots are charged as board lots": an odd lot pays the same lines.
//   https://av.sc.com/hk/content/docs/hk-service-charges-en.pdf
//   https://av.sc.com/hk/content/docs/hk-sxa-third-party-charges.pdf
//
// Cash: HKD, USD and CNH (deposits.mjs: the integrated deposit account
// settles each market in its own currency), so no line is converted. The
// bank's FX board is not in a readable page, so there is no FX remark. SC
// names no US broker-dealer: the US book is the quoted NBBO.
//
//   node brokers/standardcharteredhk/standardcharteredhk_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/standardcharteredhk/standardcharteredhk_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/standardcharteredhk/standardcharteredhk_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//   node brokers/standardcharteredhk/standardcharteredhk_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { cashOf, cents, connectRoundTrip, engineOf, printCli } from "../bocomhk/hkMarketsCost.mjs";

const FOLDER = "standardcharteredhk";
const CATALOGUE = new URL("standardcharteredhk-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGE = "https://av.sc.com/hk/content/docs/hk-service-charges-en.pdf";
const THIRD_PARTY = "https://av.sc.com/hk/content/docs/hk-sxa-third-party-charges.pdf";
const CASH = cashOf(FOLDER);
const CHANNEL = "ordre en ligne (Online Banking, SC Mobile, SC Equities)";

const HK = {
  broker: "Standard Chartered HK",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: 0.002, min: 50 },
  settlement: { rate: 0.00002, min: 2, max: 100, label: "frais de règlement HKSCC (tel qu'imprimé par SC)" },
  cash: CASH,
  fxEach: null,
};

const CN = {
  broker: "Standard Chartered HK",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: 0.002, min: 45 },
  cash: CASH,
  fxEach: null,
};

const US = {
  broker: "Standard Chartered HK",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  entity: "Standard Chartered Bank (Hong Kong) Limited",
  rule606: null,
  cash: "USD",
  ticket: ({ notional }) => Math.max(18, cents(notional * 0.002)),
  levies: { sec: "nearest", taf: false, cat: false },
  basis: `ordre en ligne (canal numérique), barème Standard Chartered HK relu le ${READ_ON}. Courtage 0,20 %, plancher 18 USD ; SEC 0,00206 % de la vente ; pas de TAF ni de CAT imprimée. Vente identique.`,
  notes: ["aucun courtier américain nommé : NBBO coté", `frais tiers : ${THIRD_PARTY}`],
};

export function roundTrip(query) {
  const market = engineOf(CATALOGUE, query);
  if (market === "CN") return connectRoundTrip(CN, query);
  if (market === "US") return usRoundTrip(US, query);
  return hkexRoundTrip(HK, query);
}

export const SCHEDULE = { page: PAGE, thirdParty: THIRD_PARTY, readOn: READ_ON, hk: HK, cn: CN, us: US };

printCli(import.meta.url, roundTrip);
