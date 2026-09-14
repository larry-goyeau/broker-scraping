// Reconnaissance on the OANDA TMS web platform, read only.
//
// `oanda_cost.mjs` charges one thing it has never seen: the conversion margin.
// The table publishes it in units of the quoted currency — 0,006 on EURUSD —
// and dividing by the rate turns that into about half a percent per conversion,
// which on a euro account buying an American share is the whole bill. That
// reading rests on two claims the fee table states and nothing confirms: that a
// Cash Account holds one currency and converts whatever it must, and that the
// margin is applied about the mid at the moment of the trade.
//
// Both are visible from a logged-in session without placing anything. The cash
// screen says how many currencies the account holds; an order ticket says what
// rate it would use. So this script attaches to the tab already open, reads, and
// writes down what it saw.
//
// It places no orders. Whatever it finds that would need one is named at the end
// rather than done.
//
//   node oanda/oanda-probe.mjs
//   node oanda/oanda-probe.mjs --dump      (le HTML de la page, pour chercher à la main)
//
// Chrome must already be listening: --remote-debugging-port=9222.

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = new URL("oanda-probe.json", import.meta.url);
const HOST = /oanda\.com/i;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => HOST.test(p.url()));

if (!page) {
  console.error("aucun onglet OANDA ouvert : ouvrir https://www.oanda.com/eu-en/platform et se connecter");
  await browser.disconnect();
  process.exit(2);
}

console.log(`onglet : ${page.url()}\n`);

// The platform is a single-page app, so the interesting facts arrive by XHR and
// not in the document. Listening for a moment costs nothing and says more than
// the DOM does.
const seen = [];
page.on("response", async (res) => {
  const url = res.url();
  if (!/oanda|tms/i.test(url)) return;
  if (!/json/i.test(res.headers()["content-type"] || "")) return;
  try {
    const body = await res.json();
    seen.push({ url, status: res.status(), body });
  } catch {
    /* une réponse illisible n'est pas une réponse */
  }
});

const text = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 6000));
const title = await page.title();

// Money on the screen, whatever the markup calls it.
const money = [...text.matchAll(/(-?[\d\u202f\u00a0 ]+[.,]\d{2})\s*(EUR|USD|PLN|CZK|RON|GBP|€|\$|zł|Kč|lei)/gi)]
  .map((m) => `${m[1].trim()} ${m[2]}`)
  .slice(0, 40);

const currencies = [...new Set([...text.matchAll(/\b(EUR|USD|PLN|CZK|RON|GBP)\b/g)].map((m) => m[1]))];

console.log(`titre : ${title}`);
console.log(`devises nommées sur l'écran : ${currencies.join(", ") || "aucune"}`);
if (money.length) console.log(`montants lus :\n  ${money.join("\n  ")}`);
console.log(`\n--- texte de la page ---\n${text.slice(0, 2500)}`);

// A moment of quiet, to catch whatever the app polls for.
await new Promise((r) => setTimeout(r, 6000));

if (seen.length) {
  console.log(`\n--- ${seen.length} réponses JSON captées ---`);
  for (const s of seen.slice(0, 25)) console.log(`  ${s.status}  ${s.url.slice(0, 140)}`);
}

fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: page.url(), title, text, money, currencies, seen }, null, 2));
console.log(`\nécrit dans ${OUT.pathname}`);

if (process.argv.includes("--dump")) {
  const html = await page.content();
  fs.writeFileSync(new URL("oanda-probe.html", import.meta.url), html);
  console.log("html écrit dans oanda/oanda-probe.html");
}

await browser.disconnect();
