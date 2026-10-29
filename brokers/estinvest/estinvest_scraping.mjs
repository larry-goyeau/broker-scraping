// What Estinvest sells online, with no login: every share and
// exchange-traded fund the Bucharest Stock Exchange lists (the regulated
// market, the AeRO multilateral trading system and the SMT International
// segment).
//
// Its online-account page: "Oferim accesul la piata interna prin platforme
// de tranzactionare intuitive si complete ce iti dau posibilitatea
// tranzactionarii intregii game de instrumente financiare listate la Bursa
// de Valori Bucuresti", on its three platforms ("estinvest.ro, EstTrade si
// ArenaXT"). The whole range listed on the BVB is every segment, so the
// catalogue is the exchange's own book (../brmssif/bvbBook.mjs): its Shares
// and Fund Units tables, each line checked on its own page, less suspended
// lines ("Stare: Suspendata") and lines that never traded. Closed-end fund
// units, warrants, certificates, rights and bonds are not shares or ETFs and
// stay out. Everything trades in lei (XBSE). broker-list.json gives the
// Bucharest Stock Exchange and AeRO.
//
//   https://www.estinvest.ro/cont-online/
//   https://www.bvb.ro/FinancialInstruments/Markets/Shares
//   https://www.bvb.ro/FinancialInstruments/Markets/FundUnits
//
// Fees: https://www.estinvest.ro/cont-online/ ("Costuri de tranzactionare":
// 0,50% up to 100.000 lei of average monthly turnover, then 0,45%, 0,40%,
// 0,35%; minimum 1 leu per order; the ASF fee of 0,06% on purchases is not
// included).
//
//   node brokers/estinvest/estinvest_scraping.mjs

import { writeBvbCatalogue } from "../brmssif/bvbBook.mjs";
import { says } from "../denizyatrm/evidence.mjs";

await says("https://www.estinvest.ro/cont-online/", [
  /posibilitatea tranzactionarii intregii game de instrumente financiare listate la Bursa de Valori Bucuresti/,
  /pana la 100\.000 0,50%/,
]);

const rows = await writeBvbCatalogue(import.meta.url, "estinvest-parsed.json");
if (rows.length < 260) throw new Error(`only ${rows.length} BVB rows`);
