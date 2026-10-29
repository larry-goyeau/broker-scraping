// What Interdealer Capital Invest sells online, with no login: every share
// and exchange-traded fund the Bucharest Stock Exchange lists (the
// regulated market, the AeRO multilateral trading system and the SMT
// International segment).
//
// Its shares page ("Investiții în acțiuni la BVB") and its Arena XT
// tutorial: clients open an online account ("Simplu, rapid, 100% online")
// and trade on the BVB through Arena XT, the BVB's own brokerage platform,
// which shows every market of a symbol ("In cazul unor simboluri care se
// tranzactioneaza pe mai multe piete"). Its tariff prices online trades in
// "Acțiuni, drepturi și instrumente financiare complexe" with no segment
// left out, so the catalogue is the exchange's own book
// (../brmssif/bvbBook.mjs): its Shares and Fund Units tables, each line
// checked on its own page, less suspended lines ("Stare: Suspendata") and
// lines that never traded. Closed-end fund units, warrants, certificates,
// rights and bonds are not shares or ETFs and stay out. Everything trades
// in lei (XBSE). broker-list.json gives the Bucharest Stock Exchange and
// AeRO.
//
//   https://interdealer.ro/investitii-in-actiuni
//   https://interdealer.ro/api/documents/file/Tutorial_ArenaXT.pdf
//   https://www.bvb.ro/FinancialInstruments/Markets/Shares
//
// Fees: https://interdealer.ro/api/documents/file/CATEGORII%20DE%20COMISIOANE%20%C5%9EI%20TAXE%20PENTRU%20SERVICIILE%20OFERITE.pdf
// ("COMISIONE/TAXE DE TRANZACȚIONARE CONT ONLINE: Acțiuni, drepturi și
// instrumente financiare complexe – sume investite cumulat sub 500.000 lei
// 0,5%", negotiable above; BVB's flat 1 leu per order).
//
//   node brokers/interdealer/interdealer_scraping.mjs

import { writeBvbCatalogue } from "../brmssif/bvbBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

const FEES = "https://interdealer.ro/api/documents/file/CATEGORII%20DE%20COMISIOANE%20%C5%9EI%20TAXE%20PENTRU%20SERVICIILE%20OFERITE.pdf";

await says("https://interdealer.ro/", [/100% online/, /CATEGORII%20DE%20COMISIOANE/], { raw: true });
await says("https://interdealer.ro/investitii-in-actiuni", [/Investiții în acțiuni la BVB/, /Arena XT/]);
await pdfAnswers(FEES);

const rows = await writeBvbCatalogue(import.meta.url, "interdealer-parsed.json");
if (rows.length < 260) throw new Error(`only ${rows.length} BVB rows`);
