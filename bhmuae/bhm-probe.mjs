// Read-only: what the BHM login holds and what a trade there would cost.
// Reads the account panel and the touch on a few DFM lines. Places nothing.
//
//   node bhmuae/bhm-probe.mjs

import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => /bhmuae\.ae/.test(p.url()));
if (!page) {
  console.error("aucun onglet trading.bhmuae.ae ouvert");
  process.exit(2);
}

console.log("page :", page.url(), "\n");

// The Rubix front talks to its own REST layer; replay whatever it already uses.
const seen = new Map();
page.on("response", async (r) => {
  const u = r.url();
  if (!/\/api|\/rest|\/service/i.test(u)) return;
  if (!/json/i.test(r.headers()["content-type"] || "")) return;
  try {
    seen.set(u, await r.json());
  } catch {}
});

const text = await page.evaluate(() => document.body.innerText.replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n"));
const wanted = text
  .split("\n")
  .map((l, i, all) => ({ l, ctx: all.slice(Math.max(0, i - 1), i + 3).join(" · ") }))
  .filter(({ l }) => /cash|balance|buying|power|available|portfolio|equity|AED|USD|solde/i.test(l));
console.log("──── lignes d'argent sur la page ────");
for (const { ctx } of wanted.slice(0, 25)) console.log("  " + ctx.slice(0, 160));

console.log("\n──── onglets / menus ────");
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll("a,button,[role=tab],li")]
    .map((e) => (e.innerText || "").trim())
    .filter((t) => t && t.length < 34)
    .slice(0, 90)
);
console.log("  " + [...new Set(tabs)].join(" | ").slice(0, 900));

await new Promise((r) => setTimeout(r, 6000));

console.log("\n──── réponses JSON captées ────");
for (const [u, body] of seen) {
  const s = JSON.stringify(body);
  if (!/balance|cash|buying|equity|portfolio|ledger|fund/i.test(s + u)) continue;
  console.log("\n" + u.slice(0, 120));
  console.log("  " + s.slice(0, 900));
}
if (!seen.size) console.log("(aucune : la page ne rappelle rien sans interaction)");

await browser.disconnect();
