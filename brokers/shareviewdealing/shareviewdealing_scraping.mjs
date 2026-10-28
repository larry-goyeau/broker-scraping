// What Shareview Dealing (Equiniti Financial Services, UK) sells, with no
// login: the London Stock Exchange shares of the companies whose share
// register Equiniti keeps.
//
// The terms limit the service to those companies: "The Service enables you
// to buy and sell certificated Shares online or by telephone where The
// Equiniti Group is the Registrar" and "The Service is only available to
// you to deal in Shares specified by us" (sections 3.1 and 3.3). The buy
// page repeats it: "Be purchasing shares in a UK company for which Equiniti
// maintains the share register", and points to Equiniti's own list,
// "Companies whose registers are maintained by Equiniti" (about 300 names,
// with a dealing type: both, online-only or postal-only). No ETFs: funds
// are not on Equiniti's registers.
//
//   https://shareview.co.uk/documentrepository/svd/shareview_dealing_terms_and_conditions.pdf
//   https://shareview.co.uk/buyandsell/buycertificated
//   https://shareview.co.uk/buyandsell/sharestraded
//   https://shareview.co.uk/documentrepository/svd/ratesandchargescertificated.pdf   (fees: 1.50% online, minimum £45, on the first £50,000; 1.00%, minimum £20, through a Corporate Sponsored Nominee)
//
// Who may use it (UK, Isle of Man and Channel Islands residents, "EEA for
// Vodafone trading only", no US nationals) depends on the client, not the
// share, so it is a remark, not a filter.
//
// The list is a SvelteKit page: the names are not in the HTML (only the
// letter A is rendered) but in a JavaScript chunk the page loads, read here
// from the page's module preloads. Each name is matched to the LSE share
// book (../moneyfarm/lseBook.mjs: today's open lines) on its issuer name,
// with ALIASES for names the list spells differently or that changed
// (Rathbone Bros. is Rathbones Group, Spirax-Sarco is Spirax Group, Cairn
// Energy is Capricorn Energy, Anglo Pacific is Ecora Royalties, "Santander"
// is Banco Santander's sterling CDI line). Every open share line of a
// matched issuer is kept (Lloyds' and Santander UK's preference shares are
// on the same register). The dealing type is kept in raw.
//
// Left out: names with no open LSE share line (taken over or delisted
// companies still on Equiniti's list, such as Amlin, ARM, Cobham, Morrisons
// or Spectris; companies listed elsewhere, such as Iberdrola, BNP Paribas,
// Morgan Stanley, Nufarm or Jackson Financial; unlisted ones such as Heart
// of Midlothian or the building societies; bond issuers such as Land
// Securities Capital Markets and Ferrexpo Finance), and "Shaftesbury": the
// old Shaftesbury plc merged into Capital & Counties, now Shaftesbury
// Capital, and nothing shows Equiniti keeps that register. They are printed
// on every run.
//
//   node brokers/shareviewdealing/shareviewdealing_scraping.mjs

import { lseBook } from "../moneyfarm/lseBook.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://shareview.co.uk/buyandsell/sharestraded";

// Equiniti list name -> LSE TIDMs, where the issuer names do not match.
const ALIASES = {
  "abrdn Asia Focus Plc": ["AAS"],
  "Aberdeen Standard European Logistics Income plc": ["ASLI"],
  "AG Barr": ["BAG"],
  "Anglo Pacific Group": ["ECOR"],
  "Asian Total Return Investment Company": ["ATR"],
  "Auto Trader": ["AUTO"],
  "BP Marsh & Partners": ["BPM"],
  "Cairn Energy": ["CNE"],
  "Coca Cola Hellenic Bottling Company": ["CCH"],
  "DFS": ["DFS"],
  "Dixons Carphone": ["CURY"],
  "Dunedin Income & Growth": ["DIG"],
  "F.W. Thorpe": ["TFW"],
  "J Sainsbury plc": ["SBRY"],
  "J Smart & Co.": ["SMJ"],
  "Macfarlane Group (Clansman)": ["MACF"],
  "Montanaro European Smaller Companies Trust": ["MTE"],
  "Pay Point": ["PAY"],
  "Pipe Hawk": ["PIP"],
  "Polar Capital Financials Trust": ["PCFT"],
  "Polar Capital Global Healthcare Growth & Income Trust": ["PCGH"],
  "Primary Heath Properties": ["PHP"],
  "Rathbone Bros.": ["RAT"],
  "Santander": ["BNC"],
  "Schroder Asia Pacific Fund": ["SDP"],
  "Spirax-Sarco Engineering": ["SPX"],
  "Temple Bar": ["TMPL"],
  "Templeton Emerging Markets": ["TEM"],
  "TheWorks.co.uk plc": ["WRKS"],
};
const NOT_THIS_REGISTER = new Set(["Shaftesbury"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

const jsString = (literal) => JSON.parse(literal).replace(/[​-‍﻿]/g, "").trim();

// The chunk is `const e=[{letter:"A",clients:[{name:"3i Group plc",dealingType:"both"},...]},...];export{e as s};`
// (a client can also be a bare string, as the page's component allows).
function parseClients(source) {
  const clients = [];
  for (const block of source.matchAll(/letter:"[^"]*",clients:\[(.*?)\]\}/gs)) {
    for (const [item] of block[1].matchAll(/\{[^{}]*\}|"(?:[^"\\]|\\.)*"/g)) {
      if (item.startsWith('"')) { clients.push({ name: jsString(item), dealingType: "both" }); continue; }
      const name = item.match(/name:("(?:[^"\\]|\\.)*")/);
      const type = item.match(/dealingType:"([a-z-]+)"/);
      if (name) clients.push({ name: jsString(name[1]), dealingType: type ? type[1] : "both" });
    }
  }
  return clients;
}

async function equinitiClients() {
  const html = await get(PAGE);
  const base = new URL(PAGE + "/");
  const chunks = [...html.matchAll(/<link rel="modulepreload" href="([^"]+\.js)"/g)].map((match) => new URL(match[1], base).href);
  if (!chunks.length) throw new Error(`no module preloads on ${PAGE}`);
  // The list chunk is imported by the page's own node file; try those imports first, then every preload.
  const nodes = chunks.filter((url) => /\/nodes\//.test(url));
  const order = [];
  for (const node of nodes.reverse()) {
    await sleep(500);
    const source = await get(node);
    for (const match of source.matchAll(/from"(\.\.\/chunks\/[^"]+\.js)"/g)) order.push(new URL(match[1], node).href);
  }
  for (const url of chunks) if (!order.includes(url)) order.push(url);
  for (const url of [...new Set(order)]) {
    await sleep(500);
    const source = await get(url);
    if (!/letter:"A",clients:\[/.test(source)) continue;
    return { url, clients: parseClients(source) };
  }
  throw new Error(`no company list in the scripts of ${PAGE}`);
}

const STOP = new Set(["PLC", "LIMITED", "LTD", "GROUP", "HOLDINGS", "HOLDING", "THE", "CO", "COMPANY", "SA", "SE", "INC", "CORPORATION", "CORP", "AND", "OF"]);
const key = (value) => value.toUpperCase().replace(/[’']/g, "").replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((word) => word && !STOP.has(word)).join(" ");
const issuer = (lseName) => lseName.toUpperCase().split(/ (?:PLC|LTD|LIMITED|ORD|SA|SE|INC|CORP|N\.V\.|NV|AG)\b/)[0];

const { rows: book, report } = await lseBook();
console.error(`LSE book: ${book.length} lines (${report.instrumentListAsAt} instrument list, built ${report.built})`);
const shares = book.filter((row) => row.type === "STOCK");
const byIssuer = new Map();
const byTicker = new Map();
for (const row of shares) {
  const k = key(issuer(row.name));
  if (!byIssuer.has(k)) byIssuer.set(k, []);
  byIssuer.get(k).push(row);
  byTicker.set(row.ticker, row);
}

const { url: listUrl, clients } = await equinitiClients();
console.error(`Equiniti list: ${clients.length} companies (${listUrl})`);
if (clients.length < 250) throw new Error(`only ${clients.length} companies on the Equiniti list`);

const results = [];
const unmatched = [];
const brokenAlias = [];
for (const client of clients) {
  if (NOT_THIS_REGISTER.has(client.name)) { unmatched.push(`${client.name} (successor's register unknown)`); continue; }
  let lines;
  if (ALIASES[client.name]) {
    lines = ALIASES[client.name].map((ticker) => byTicker.get(ticker)).filter(Boolean);
    if (lines.length < ALIASES[client.name].length) brokenAlias.push(`${client.name} -> ${ALIASES[client.name].join("/")}`);
  } else {
    lines = byIssuer.get(key(client.name)) || [];
  }
  if (!lines.length) { unmatched.push(client.name); continue; }
  for (const row of lines) results.push({ ...row, raw: `${row.raw} | equiniti: ${client.name} (${client.dealingType})` });
}

const seen = new Set();
const unique = results.filter((row) => {
  if (seen.has(row.ticker)) return false;
  seen.add(row.ticker);
  return true;
});
unique.sort((left, right) => left.name.localeCompare(right.name));

const count = (rows, field) => [...rows.reduce((map, row) => map.set(row[field], (map.get(row[field]) || 0) + 1), new Map())].map(([k, value]) => `${value} ${k}`).join(", ");
console.error(`${unique.length} rows from ${clients.length - unmatched.length} companies (${count(unique, "exchange")}; ${count(unique, "currency")})`);
console.error(`left out, no open LSE share line (${unmatched.length}): ${unmatched.join("; ")}`);
if (brokenAlias.length) console.error(`aliases with no open line any more: ${brokenAlias.join("; ")}`);

for (const [isin, label] of [["GB00BH4HKS39", "Vodafone"], ["GB00BP6MXD84", "Shell"], ["GB0008706128", "Lloyds Banking Group"]]) {
  if (!unique.some((row) => row.isin === isin)) throw new Error(`${label} (${isin}) missing`);
}
if (unique.length < 150) throw new Error(`only ${unique.length} rows, expected about 190`);

fs.writeFileSync(new URL("shareviewdealing-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(unique)), null, 2));
