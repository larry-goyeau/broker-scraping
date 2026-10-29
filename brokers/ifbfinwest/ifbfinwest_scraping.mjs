// What IFB Finwest sells online, with no login: every share and
// exchange-traded fund the Bucharest Stock Exchange lists (the regulated
// market, the AeRO multilateral trading system and the SMT International
// segment).
//
// Its home page: "IFB Finwest Arad - tranzactionare online", "Deschide
// contul online și beneficiază de un comision de doar 0,5%!", with the
// "IFB Finwest Trading" app; its online trading guide lets an authorised
// client "lansati ordine online de cumparare sau de vanzare" on the BVB
// shares it shows. The firm is a BVB member and names no other market for
// online orders. No segment of
// the exchange is named as out (the home page follows the BETAERO index and
// the AeRO movers), so the catalogue is the exchange's own book
// (../brmssif/bvbBook.mjs): its Shares and Fund Units tables, each line
// checked on its own page, less suspended lines ("Stare: Suspendata") and
// lines that never traded. Closed-end fund units, warrants, certificates,
// rights and bonds are not shares or ETFs and stay out. Everything trades
// in lei (XBSE). broker-list.json gives the Bucharest Stock Exchange and
// AeRO.
//
// The site sits behind a Cloudflare browser check that a script cannot
// pass, so its pages are read from their newest Internet Archive captures
// (home page July 2026, guide 2013; the fee annex PDF is served live;
// ../denizyatrm/evidence.mjs).
//
//   https://www.ifbfinwest.ro/
//   https://www.ifbfinwest.ro/ghid/ghid.php?l=tranzactionare_online
//   https://www.bvb.ro/FinancialInstruments/Markets/Shares
//
// Fees: https://www.ifbfinwest.ro/contonline/Documents/anexa_de_taxe_si_comisioane_01_12_2021.pdf
// ("grila de comisioane ... Cont online": 0,9% of the trade for an initial
// sum of 5.000 – 10.000 lei, 0,8% to 50.000, 0,65% to 100.000, 0,5% to
// 300.000, negotiable above; the home page now advertises "un comision de
// doar 0,5%" for the online account).
//
//   node brokers/ifbfinwest/ifbfinwest_scraping.mjs

import { writeBvbCatalogue } from "../brmssif/bvbBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

const pause = () => new Promise((resolve) => setTimeout(resolve, 5000));

const home = await says(
  "https://www.ifbfinwest.ro/",
  [/IFB Finwest Arad - tranzactionare online/, /Deschide contul online și beneficiază de un comision de doar 0,5%/],
  { wayback: true }
);
await pause();
const guide = await says(
  "https://www.ifbfinwest.ro/ghid/ghid.php?l=tranzactionare_online",
  [/lansati ordine online de cumparare sau de vanzare/],
  { wayback: true }
);
await pause();
const annex = await pdfAnswers("https://www.ifbfinwest.ro/contonline/Documents/anexa_de_taxe_si_comisioane_01_12_2021.pdf", { wayback: true });
console.error(`read: home page (${home.source}), guide (${guide.source}), fee annex (${annex.source})`);

const rows = await writeBvbCatalogue(import.meta.url, "ifbfinwest-parsed.json");
if (rows.length < 260) throw new Error(`only ${rows.length} BVB rows`);
