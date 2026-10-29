// What Interfinbrok Corporation sells online, with no login: every share
// and exchange-traded fund the Bucharest Stock Exchange lists (the
// regulated market, the AeRO multilateral trading system and the SMT
// International segment).
//
// Its site (an Angular app, so the text is read from the app's page
// bundle): "Interfinbrok Corporation este membru al Bursei de Valori
// Bucuresti (BVB)", clients trade on the "Platforma Arena-XT" ("solutia de
// platforma de brokeraj dezvoltata de specialistii BVB pentru
// intermediari"), and the fee page has a table "Comisioane pentru ordine
// date online" whose only market is "Bursa de Valori Bucuresti". No segment
// of the exchange is named as out, so the catalogue is the exchange's own
// book (../brmssif/bvbBook.mjs): its Shares and Fund Units tables, each
// line checked on its own page, less suspended lines ("Stare: Suspendata")
// and lines that never traded. Closed-end fund units, warrants,
// certificates, rights and bonds are not shares or ETFs and stay out.
// Everything trades in lei (XBSE). broker-list.json gives the Bucharest
// Stock Exchange alone; AeRO and SMT International are segments of the same
// exchange, reached through the same Arena XT session.
//
//   https://www.interfinbrok.ro/ (pages "prezentare", "taxe")
//   https://www.bvb.ro/FinancialInstruments/Markets/Shares
//
// Fees: https://www.interfinbrok.ro/taxe ("Comisioane pentru ordine date
// online: Bursa de Valori Bucuresti 0,4% peste 500.000 lei, 0,6%
// 100.000 lei - 500.000 lei, 0,7% 25.000 lei - 100.000 lei, 0,8% pana in
// 25.000 lei" of average monthly turnover; intraday at half, not below
// 0,25%).
//
//   node brokers/interfinbrok/interfinbrok_scraping.mjs

import { writeBvbCatalogue } from "../brmssif/bvbBook.mjs";
import { page } from "../denizyatrm/evidence.mjs";

const SITE = "https://www.interfinbrok.ro/";

// The app's lazy page bundle that holds the "taxe" page: index.html names
// the runtime, the runtime maps chunk ids to file hashes.
async function pageBundle() {
  const index = (await page(SITE)).body.toString("utf8");
  const runtime = (index.match(/src="(runtime-es2015\.[0-9a-f]+\.js)"/) || [])[1];
  if (!runtime) throw new Error("no runtime bundle on the home page");
  const map = (await page(SITE + runtime)).body.toString("utf8").match(/\{(\d+:"[0-9a-f]+"(?:,\d+:"[0-9a-f]+")*)\}\[e\]/);
  if (!map) throw new Error("no chunk map in the runtime bundle");
  for (const [, id, hash] of map[1].matchAll(/(\d+):"([0-9a-f]+)"/g)) {
    const text = (await page(`${SITE}${id}-es2015.${hash}.js`)).body.toString("utf8");
    if (/path:"taxe"/.test(text)) return text;
  }
  throw new Error("no bundle carries the taxe page");
}

// The page text, as the bundle's text nodes in order.
const texts = [...(await pageBundle()).matchAll(/\.Ib\(-1,null,\["([^"]*)"\]\)/g)].map((match) => match[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim());
const online = texts.indexOf("Comisioane pentru ordine date online:");
if (online < 0) throw new Error("the fee page no longer has an online-orders table");
const table = texts.slice(online, online + 20).join(" | ");
if (!/Bursa de Valori Bucuresti \| 0,4% \| Peste 500\.000 lei .* 0,8% \| Pana in 25\.000 lei/.test(table)) throw new Error(`online fees changed: ${table}`);
const all = texts.join(" | ");
for (const pattern of [/Interfinbrok Corporation este membru al Bursei de Valori Bucuresti/, /Platforma Arena-XT/]) {
  if (!pattern.test(all)) throw new Error(`the site no longer says ${pattern}`);
}

const rows = await writeBvbCatalogue(import.meta.url, "interfinbrok-parsed.json");
if (rows.length < 260) throw new Error(`only ${rows.length} BVB rows`);
