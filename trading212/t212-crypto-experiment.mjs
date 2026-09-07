// Buys a small amount of a crypto pair at market and sells it back at once, to find out whether
// the round trip really costs what the order review says it will.
//
// The review is the thing under test. It quotes a price to buy and, for a negative amount, a
// price to sell, and the gap between them is the only cost Trading212 discloses on these lines —
// there is no commission and no tax. Whether that gap is what a real order meets is a separate
// question, and the only way to answer it is to place one.
//
// What the trade costs is small and known in advance: fifty euros round-tripped at the two per
// cent the review quotes is one euro. The amount is kept there on purpose — large enough that
// rounding to the cent is a fiftieth of the effect being measured, small enough to be a
// measurement rather than a position.
//
//   node trading212/t212-crypto-experiment.mjs --probe          (ne fait que lire les deux prix)
//   node trading212/t212-crypto-experiment.mjs --live BTC/EUR --amount=50

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = (name, fallback = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : fallback;
};

const LIVE = process.argv.includes("--live");
const AMOUNT = Number(flag("amount", "50"));
const WANTED = (process.argv.slice(2).find((a) => !a.startsWith("--")) || "BTC/EUR").toUpperCase();
const OUT = new URL(LIVE ? "t212-crypto-experiment.json" : "t212-crypto-probe.json", import.meta.url);

const catalogue = JSON.parse(fs.readFileSync(new URL("trading212-parsed.json", import.meta.url), "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const row = rows.find((r) => r.type === "CRYPTO" && String(r.ticker).toUpperCase() === WANTED);
if (!row) throw new Error(`${WANTED} n'est pas une paire crypto du catalogue.`);

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("app.trading212.com"));
if (!page) throw new Error("aucun onglet app.trading212.com ouvert.");

const traderClient = await page.evaluate(
  () => `application=WC4,version=8.46.0,dUUID=${document.cookie.match(/[0-9a-f]{32}=%22([0-9a-f-]{36})%22/)?.[1] ?? ""}`
);

const api = (method, path, body) =>
  page.evaluate(
    async (m, p, b, client) => {
      try {
        const r = await fetch(`https://live.services.trading212.com${p}`, {
          method: m,
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Trader-Client": client, "X-Trader-Target-Type": "CRYPTO" },
          ...(b === null ? {} : { body: JSON.stringify(b) }),
        });
        const text = await r.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        return { status: r.status, json, text: text.slice(0, 300) };
      } catch (e) {
        return { status: 0, json: null, text: String(e).slice(0, 200) };
      }
    },
    method,
    path,
    body === undefined ? null : body,
    traderClient
  );

const review = (value) =>
  api("POST", "/rest/crypto/v1/value-order/review", {
    ticker: row.code,
    orderType: "MARKET",
    currencyCode: row.currency,
    value,
  });

async function state() {
  const r = await api("POST", "/rest/crypto/v1/accounts/summary", []);
  const s = r.json;
  if (!s) throw new Error(`compte illisible : ${r.status} ${r.text}`);
  const held = (s.open?.items ?? []).find((p) => p.code === row.code || p.ticker === row.code);
  return {
    cash: Number(s.cash.total),
    free: Number(s.cash.freeForStocks),
    pending: (s.orders?.items ?? []).length + (s.valueOrders?.items ?? []).length,
    quantity: held ? Number(held.quantity) : 0,
    value: held ? Number(held.value ?? 0) : 0,
  };
}

// Both prices at the same instant, which is the whole point: read a second apart, an asset that
// moves a per cent an hour drifts by a tenth of the gap being measured.
const bothSides = async () => {
  const [buy, sell] = await Promise.all([review(AMOUNT), review(-AMOUNT)]);
  if (buy.status !== 200 || sell.status !== 200) throw new Error(`revue refusée : ${buy.status}/${sell.status} ${buy.text}`);
  const ask = Number(buy.json.instrumentPrice);
  const bid = Number(sell.json.instrumentPrice);
  const mid = (ask + bid) / 2;
  return { ask, bid, mid, quoted: (ask - bid) / mid, at: new Date().toISOString() };
};

const before = await state();
const quotedBefore = await bothSides();
console.error(
  `${WANTED} : achat ${quotedBefore.ask}, vente ${quotedBefore.bid}, soit ${(100 * quotedBefore.quoted).toFixed(2)} % annoncés`
);
console.error(`compte : ${before.cash} ${row.currency}, libre ${before.free}, position ${before.quantity}`);

const log = {
  startedAt: new Date().toISOString(),
  pair: WANTED,
  code: row.code,
  currency: row.currency,
  amount: AMOUNT,
  live: LIVE,
  quotedBefore,
  before,
};

if (!LIVE) {
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  console.log(`\nlecture seule. ${(100 * quotedBefore.quoted).toFixed(2)} % d'aller-retour annoncés sur ${WANTED}.`);
  console.log(`pour mesurer réellement : node trading212/t212-crypto-experiment.mjs --live ${WANTED} --amount=${AMOUNT}`);
  await browser.disconnect();
  process.exit(0);
}

// ------------------------------------------------------------------------ l'aller-retour

if (before.pending) throw new Error(`${before.pending} ordre(s) en attente : refuse de commencer.`);
if (before.quantity) throw new Error(`position déjà ouverte (${before.quantity}) : refuse de commencer.`);
if (before.free < AMOUNT * 1.1) throw new Error(`liquidités insuffisantes : ${before.free} pour ${AMOUNT}.`);

const buy = await api("POST", "/rest/crypto/v1/value-order", {
  ticker: row.code,
  orderType: "MARKET",
  currencyCode: row.currency,
  timeValidity: "GOOD_TILL_CANCEL",
  value: AMOUNT,
});
console.error(`achat : HTTP ${buy.status} ${buy.text.slice(0, 160)}`);
if (buy.status >= 400) throw new Error(`achat refusé : ${buy.text}`);

let held = null;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const s = await state();
  if (s.quantity > 0 && !s.pending) {
    held = s;
    break;
  }
}
if (!held) throw new Error("l'achat n'a pas été rempli en soixante secondes — vérifier le compte à la main.");
console.error(`rempli : ${held.quantity} ${WANTED.split("/")[0]}, liquidités ${held.cash}`);

const quotedHeld = await bothSides();

// The position is sold by quantity, exactly what was bought, so nothing is left behind.
const sell = await api("POST", "/rest/crypto/v1/quantity-order", {
  ticker: row.code,
  orderType: "MARKET",
  currencyCode: row.currency,
  timeValidity: "GOOD_TILL_CANCEL",
  quantity: -held.quantity,
});
console.error(`vente : HTTP ${sell.status} ${sell.text.slice(0, 160)}`);
if (sell.status >= 400) {
  console.error(`\n!! LA VENTE A ÉCHOUÉ ET LA POSITION EST OUVERTE : ${held.quantity} ${WANTED}. À fermer à la main.`);
  fs.writeFileSync(OUT, JSON.stringify({ ...log, held, quotedHeld, sellFailed: sell }, null, 2));
  await browser.disconnect();
  process.exit(1);
}

let after = null;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const s = await state();
  if (s.quantity === 0 && !s.pending) {
    after = s;
    break;
  }
}
if (!after) throw new Error("la vente n'a pas été remplie en soixante secondes — vérifier le compte à la main.");

const paid = before.cash - after.cash;
const measured = paid / AMOUNT;
Object.assign(log, {
  finishedAt: new Date().toISOString(),
  held,
  quotedHeld,
  after,
  // What the account actually lost, which is the only figure that owes nothing to a model.
  paid: Number(paid.toFixed(4)),
  measured: Number(measured.toPrecision(4)),
  quoted: Number(quotedHeld.quoted.toPrecision(4)),
  ratio: Number((measured / quotedHeld.quoted).toFixed(3)),
});

// Appended, never overwritten: a previous run's measurement is not recoverable.
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
fs.writeFileSync(OUT, JSON.stringify([...(Array.isArray(previous) ? previous : [previous]), log], null, 2));

console.log(`\n${WANTED}, ${AMOUNT} ${row.currency} achetés puis revendus aussitôt`);
console.log(`  annoncé  : ${(100 * log.quoted).toFixed(2)} %  (achat ${quotedHeld.ask}, vente ${quotedHeld.bid})`);
console.log(`  payé     : ${log.paid} ${row.currency}, soit ${(100 * log.measured).toFixed(2)} %`);
console.log(`  rapport  : ×${log.ratio}`);
console.log(`\nécrit dans ${OUT.pathname.split("/").slice(-2).join("/")}`);

await browser.disconnect();
