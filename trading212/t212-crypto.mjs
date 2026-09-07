// What a crypto round trip costs at Trading212, read off the broker's own order review.
//
// Crypto is not priced like the rest of the catalogue. There is no commission line and no tax:
// `rest/crypto/v1/value-order/review` returns a price and a quantity and nothing else, and the
// two multiply back to the amount asked for to the cent. The whole cost is the gap between the
// price it quotes to buy and the price it quotes to sell, and that gap is Trading212's own —
// these are not exchange listings, they have no ISIN and no venue, so nothing in `spread.json`
// can speak for them.
//
// The gap is readable without trading, which is what makes this worth a file: the review prices a
// sale as a negative amount even with no position, so both sides can be asked for at the same
// instant and the round trip falls out of the difference. Note what that costs on the way in —
// around two per cent on Bitcoin, against two hundredths of a per cent on a large ETF.
//
//   node trading212/t212-crypto.mjs
//   node trading212/t212-crypto.mjs BTC/EUR ETH/EUR

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const OUT = new URL("t212-crypto.json", import.meta.url);
const CATALOGUE = new URL("trading212-parsed.json", import.meta.url);

// Large enough that the quoted price is the one a real order would meet rather than a rounding of
// it, small enough to stay under the account's own ceiling.
const AMOUNT = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = (Array.isArray(catalogue) ? catalogue : catalogue.rows || []).filter((r) => r.type === "CRYPTO");
const asked = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
const plan = asked.length ? rows.filter((r) => asked.includes(String(r.ticker).toUpperCase())) : rows;

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("app.trading212.com"));
if (!page) throw new Error("aucun onglet app.trading212.com ouvert.");

const traderClient = await page.evaluate(
  () => `application=WC4,version=8.46.0,dUUID=${document.cookie.match(/[0-9a-f]{32}=%22([0-9a-f-]{36})%22/)?.[1] ?? ""}`
);

// Both sides go out in the same round trip to the page so the two prices are read a millisecond
// apart. On an asset that moves a per cent an hour that matters: read them a second apart and the
// drift is a tenth of the spread being measured.
const bothSides = (ticker, currency) =>
  page.evaluate(
    async (t, cur, amount, client) => {
      const one = async (value) => {
        try {
          const r = await fetch("https://live.services.trading212.com/rest/crypto/v1/value-order/review", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-Trader-Client": client, "X-Trader-Target-Type": "CRYPTO" },
            body: JSON.stringify({ ticker: t, orderType: "MARKET", currencyCode: cur, value }),
          });
          const text = await r.text();
          return { status: r.status, json: r.ok ? JSON.parse(text) : null, text: r.ok ? null : text.slice(0, 120) };
        } catch (e) {
          return { status: 0, json: null, text: String(e).slice(0, 120) };
        }
      };
      const [buy, sell] = await Promise.all([one(amount), one(-amount)]);
      return { buy, sell };
    },
    ticker,
    currency,
    AMOUNT,
    traderClient
  );

const results = [];
for (const [n, row] of plan.entries()) {
  const { buy, sell } = await bothSides(row.code, row.currency);
  if (buy.status !== 200 || sell.status !== 200) {
    results.push({ ticker: row.ticker, code: row.code, currency: row.currency, error: `${buy.status}/${sell.status} ${buy.text || sell.text || ""}`.trim() });
  } else {
    const ask = Number(buy.json.instrumentPrice);
    const bid = Number(sell.json.instrumentPrice);
    const mid = (ask + bid) / 2;
    results.push({
      ticker: row.ticker,
      code: row.code,
      currency: row.currency,
      name: row.name,
      ask,
      bid,
      mid: Number(mid.toPrecision(10)),
      // The round trip crosses the whole gap: bought at the ask, sold at the bid.
      roundTrip: Number(((ask - bid) / mid).toPrecision(4)),
      at: new Date().toISOString(),
    });
  }
  if (n % 20 === 19) process.stderr.write(`\r${n + 1}/${plan.length}   `);
  await sleep(400);
}
process.stderr.write("\r");

const ok = results.filter((r) => r.roundTrip != null);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      amount: AMOUNT,
      source: "rest/crypto/v1/value-order/review, les deux sens lus au même instant",
      convention: "roundTrip = (achat − vente) / milieu, part du montant payée sur un aller-retour",
      note: "aucune commission ni taxe n'apparaît sur ces lignes ; tout le coût est dans cet écart",
      lines: ok.length,
      quotes: Object.fromEntries(results.map((r) => [r.code, r])),
    },
    null,
    2
  )
);

const sorted = [...ok].sort((a, b) => a.roundTrip - b.roundTrip);
console.log(`${ok.length} paires cotées, ${results.length - ok.length} en échec\n`);
console.log("les moins chères :");
for (const r of sorted.slice(0, 8)) console.log(`  ${String(r.ticker).padEnd(10)} ${(100 * r.roundTrip).toFixed(2).padStart(6)} %   milieu ${r.mid}`);
console.log("\nles plus chères :");
for (const r of sorted.slice(-8).reverse()) console.log(`  ${String(r.ticker).padEnd(10)} ${(100 * r.roundTrip).toFixed(2).padStart(6)} %   milieu ${r.mid}`);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].roundTrip : null;
console.log(`\nmédiane : ${median != null ? (100 * median).toFixed(2) + " %" : "—"}  — à comparer aux 0,02 % d'un gros ETF`);
console.log(`écrit dans trading212/t212-crypto.json`);

await browser.disconnect();
