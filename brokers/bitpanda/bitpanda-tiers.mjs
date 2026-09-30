// Reads what Bitpanda would charge on each coin, both halves of it, without
// buying any.
//
// `createOffer` quotes a trade and hands back the fee it would take. That makes
// the four-tier table of the Cost Transparency document readable per asset:
// 0.99 % for stablecoins and Bitcoin, 1.49 % for the rest, 2.49 % for anything
// under 100 M EUR of market capitalisation or coming out of Spotlight. Nothing
// here knows a market capitalisation, so asking is the only way to tell a Tier 3
// from a Tier 4 — and asking costs nothing, because no offer is ever accepted.
//
// The premium is only the announced half. Bitpanda also quotes a lower price to
// sell than to buy, and on the coins traded for real on 2026-09-14 that gap ran
// about as wide as the premium itself: 1.49 % on BTC, 2.48 % on ADA, 4.87 % on
// BIGTIME, nothing on EURCV. It will quote the sell side to someone holding
// nothing, so the gap is read here too, coin by coin, rather than borrowed from
// a tier — which matters most for the 405 coins of Tier 4, whose liquidity has
// no reason to be alike. It barely moves with size: on ADA, 2.506 % at 25 EUR
// and 2.573 % at 50 000 EUR.
//
// Writes `bitpanda-tiers.json`, which `bitpanda_cost.mjs` prefers over its own
// guess. Re-running skips what is already measured unless `--force`.
//
//   node bitpanda/bitpanda-tiers.mjs
//   node bitpanda/bitpanda-tiers.mjs --only=ADA,AKITA --force
//
// web.bitpanda.com must be signed in on Chrome :9222.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const FORCE = process.argv.includes("--force");
const ONLY = (arg("only", "") || "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
const AMOUNT = Number(arg("amount", "25"));
const PAUSE = Number(arg("pause", "220"));
const OUT = new URL("bitpanda-tiers.json", import.meta.url);
const CATALOGUE = new URL("bitpanda-parsed.json", import.meta.url);

const GATEWAY = "https://api.bitpanda.com/graphql-gateway/graphql";
const GQL = "https://api.bitpanda.com/v1/graphql";
const REST = "https://api.bitpanda.com/v1";

const ASSET_LIST = `query AssetList($query: String, $first: Int, $after: String) {
  assets(
    input: {filters: {settings: {buyActive: true, includeIndexOnly: false, includeHiddenFromDiscovery: false}}, query: $query}
    first: $first
    after: $after
  ) {
    pageInfo { hasNextPage endCursor }
    edges { cursor node { pid id idInternal symbol name __typename } }
  }
}`;

const CREATE_OFFER = `mutation createOffer($input: CreateOfferRequest!) {
  createOffer(request: $input) {
    offer {
      type
      price { value }
      fee { fiat { value } percentage { value } priceWithoutFee { value } }
    }
  }
}`;

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => /bitpanda\.com/i.test(p.url()) && !/mail|checkout/i.test(p.url()));
if (!page) throw new Error("aucun onglet Bitpanda ouvert (web.bitpanda.com).");

let token = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (e) => {
  token = (e.request.headers || {})["access-token"] || token;
});

await page.bringToFront();
for (let waited = 0; waited < 15000 && !token; waited += 250) await sleep(250);
if (!token) {
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  for (let waited = 0; waited < 20000 && !token; waited += 250) await sleep(250);
}
if (!token) throw new Error("pas de access-token Bitpanda : se reconnecter sur web.bitpanda.com.");

async function call(url, { method = "GET", body = null, headers = {} } = {}) {
  return page.evaluate(
    async (url, method, body, token, headers) => {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            accept: "application/json",
            "access-token": token,
            "x-client-app": "webapp",
            "x-currency": "EUR",
            ...(body ? { "content-type": "application/json" } : {}),
            ...headers,
          },
          ...(body ? { body } : {}),
        });
        const text = await response.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {}
        return { status: response.status, body: parsed, text: parsed ? null : text.slice(0, 300) };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    url,
    method,
    body ? JSON.stringify(body) : null,
    token,
    headers
  );
}

async function gql(url, operationName, query, variables) {
  const res = await call(url, {
    method: "POST",
    headers: { "apollographql-client-name": url.includes("gateway") ? "graphQLGateway" : "webapp" },
    body: { operationName, query, variables },
  });
  if (res.status !== 200) throw new Error(`${operationName} HTTP ${res.status}: ${res.text || ""}`);
  if (res.body?.errors) throw new Error(`${operationName} : ${JSON.stringify(res.body.errors).slice(0, 200)}`);
  return res.body?.data;
}

const fiats = await call(`${REST}/fiatwallets`);
const fiatRows = fiats.body?.data || [];
const eur = (Array.isArray(fiatRows) ? fiatRows : []).find((w) =>
  /EUR/i.test(w?.attributes?.fiat_symbol || w?.attributes?.fiat?.symbol || "")
);
const fiatId = String(eur?.attributes?.fiat_id || "1");

// Paged rather than a search per coin: the sweep is 560 offers already and
// there is no reason to make it 1120 round trips. Asking for the whole list at
// once is refused, so it comes a hundred at a time — and the coins sit well
// past the four thousand equities, so the walk has to go all the way.
const assets = [];
let after = null;
let walked = 0;
for (let pageNo = 0; pageNo < 200; pageNo += 1) {
  const listed = await gql(GATEWAY, "AssetList", ASSET_LIST, { query: "", first: 100, after });
  const edges = listed?.assets?.edges || [];
  walked += edges.length;
  for (const e of edges) if (/Crypto/i.test(e.node?.__typename || "")) assets.push(e.node);
  const info = listed?.assets?.pageInfo;
  if (pageNo % 20 === 0) console.error(`  ${walked} actifs parcourus, ${assets.length} coins`);
  if (!info?.hasNextPage || !info?.endCursor) break;
  after = info.endCursor;
  await sleep(100);
}
console.error(`${assets.length} crypto-actifs sur ${walked} actifs listés, fiatId=${fiatId}`);

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const wanted = new Set(
  rows.filter((r) => r.type === "CRYPTO").map((r) => String(r.ticker || "").toUpperCase())
);
console.error(`${wanted.size} coins dans le catalogue`);

const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const byTicker = FORCE ? {} : { ...(previous.byTicker || {}) };

// An entry from before the gap was measured is a bare number, and a number is
// only half an answer now, so it goes back in the queue.
const partial = (t) => byTicker[t] == null || typeof byTicker[t] === "number" || byTicker[t].gap == null;
const keep = (t) => wanted.has(t) && (ONLY.length ? ONLY.includes(t) : FORCE || partial(t));
const todo = assets.filter((a) => keep(String(a.symbol || "").toUpperCase()));

// A coin the walk missed is looked up by name, the way the live experiment does
// it. Cheaper than lengthening the walk for a handful of stragglers.
const seen = new Set(todo.map((a) => String(a.symbol || "").toUpperCase()));
for (const t of [...wanted].filter((t) => keep(t) && !seen.has(t))) {
  try {
    const found = await gql(GATEWAY, "AssetList", ASSET_LIST, { query: t, first: 8, after: null });
    const hit = (found?.assets?.edges || [])
      .map((e) => e.node)
      .find((n) => /Crypto/i.test(n.__typename || "") && String(n.symbol || "").toUpperCase() === t);
    if (hit) todo.push(hit);
  } catch {}
  await sleep(120);
}
const unique = [...new Map(todo.map((a) => [String(a.symbol || "").toUpperCase(), a])).values()];
todo.length = 0;
todo.push(...unique);
console.error(`${todo.length} à coter\n`);

// The token dies of old age well before a sweep of five hundred coins ends, and
// an idle tab never asks for a new one. Reloading makes the webapp fetch one,
// and the CDP listener above picks it up.
async function refresh() {
  const stale = token;
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  for (let waited = 0; waited < 25000; waited += 250) {
    if (token && token !== stale) return true;
    await sleep(250);
  }
  return false;
}

async function quote(assetId, type) {
  const data = await gql(GQL, "createOffer", CREATE_OFFER, {
    input: {
      amount: { value: String(AMOUNT) },
      amountDefinedFor: "FIAT",
      assetId,
      fiatId,
      type,
      visionBonus: false,
    },
  });
  return data?.createOffer?.offer;
}

// The sell side costs nothing and needs no coin in hand, and the two
// `priceWithoutFee` do not agree: Bitpanda quotes lower to sell than to buy, by
// about as much again as the premium. That gap is the second half of the bill,
// so it is read here rather than assumed from the tier.
async function measure(assetId) {
  const bought = await quote(assetId, "BUY");
  const pct = Number(bought?.fee?.percentage?.value);
  if (!Number.isFinite(pct)) throw new Error("pas de pourcentage dans la cotation");
  await sleep(PAUSE);
  const sold = await quote(assetId, "SELL");
  const buyPwf = Number(bought?.fee?.priceWithoutFee?.value);
  const sellPwf = Number(sold?.fee?.priceWithoutFee?.value);
  const gap =
    Number.isFinite(buyPwf) && Number.isFinite(sellPwf) && buyPwf > 0
      ? Number(((buyPwf - sellPwf) / buyPwf).toFixed(6))
      : null;
  return { rate: Number((pct / 100).toFixed(6)), gap };
}

let done = 0;
let failed = 0;
let renewed = 0;
for (const a of todo) {
  const symbol = String(a.symbol || "").toUpperCase();
  const assetId = String(a.idInternal || a.pid);
  try {
    let seen;
    try {
      seen = await measure(assetId);
    } catch (err) {
      if (!/HTTP 401/.test(err.message)) throw err;
      console.error(`  jeton expiré à ${done} coins, renouvellement`);
      if (!(await refresh())) throw new Error("jeton non renouvelé : se reconnecter sur web.bitpanda.com");
      renewed += 1;
      seen = await measure(assetId);
    }

    byTicker[symbol] = seen;
    done += 1;
    if (done % 25 === 0) {
      console.error(`  ${done}/${todo.length} cotés (${failed} refus)`);
      fs.writeFileSync(OUT, JSON.stringify({ readOn: new Date().toISOString().slice(0, 10), amount: AMOUNT, byTicker }, null, 2));
    }
  } catch (err) {
    failed += 1;
    if (failed <= 5) console.error(`  ${symbol} : ${err.message.slice(0, 120)}`);
  }
  await sleep(PAUSE);
}

fs.writeFileSync(
  OUT,
  JSON.stringify({ readOn: new Date().toISOString().slice(0, 10), amount: AMOUNT, byTicker }, null, 2)
);

const tally = {};
const gaps = [];
for (const v of Object.values(byTicker)) {
  const rate = typeof v === "number" ? v : v.rate;
  const key = `${(rate * 100).toFixed(2)} %`;
  tally[key] = (tally[key] || 0) + 1;
  if (typeof v === "object" && Number.isFinite(v.gap)) gaps.push(v.gap);
}
console.error(`\n${Object.keys(byTicker).length} coins mesurés, ${failed} refus, ${renewed} renouvellements de jeton`);
for (const [rate, n] of Object.entries(tally).sort()) console.error(`  ${rate.padStart(7)} : ${n}`);
if (gaps.length) {
  gaps.sort((a, b) => a - b);
  const at = (q) => gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))];
  console.error(
    `\nécart caché sur ${gaps.length} coins : médiane ${(at(0.5) * 100).toFixed(2)} %, ` +
      `1er décile ${(at(0.1) * 100).toFixed(2)} %, 9e décile ${(at(0.9) * 100).toFixed(2)} %, ` +
      `max ${(gaps[gaps.length - 1] * 100).toFixed(2)} %`
  );
}
console.error(`\n→ ${OUT.pathname.split("/").pop()}`);

await browser.disconnect();
