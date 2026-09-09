// Measures what a Real Stocks buy followed immediately by a sell costs on Bitpanda.
// `--probe` asks for a createOffer quote (no fill). `--live` accepts the offer both ways.
//
//   node bitpanda/bitpanda-live-experiment.mjs --probe --amount=25
//   node bitpanda/bitpanda-live-experiment.mjs --live --amount=25
//
// web.bitpanda.com must be signed in on Chrome :9222. A bought leg that fails to
// sell aborts and says so.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const LIVE = process.argv.includes("--live");
const SYMBOL = arg("symbol", "EUNL").toUpperCase();
const AMOUNT = Number(arg("amount", "25"));
const PAUSE = Number(arg("pause", "2500"));
const OUT = arg(
  "out",
  new URL(LIVE ? "bitpanda-live-experiment.json" : "bitpanda-live-probe.json", import.meta.url)
);

const GATEWAY = "https://api.bitpanda.com/graphql-gateway/graphql";
const GQL = "https://api.bitpanda.com/v1/graphql";
const REST = "https://api.bitpanda.com/v1";

const SEARCH = `query AssetList($query: String, $first: Int) {
  assets(
    input: {filters: {settings: {buyActive: true, includeIndexOnly: false, includeHiddenFromDiscovery: false}}, query: $query}
    first: $first
  ) {
    edges { node { pid id idInternal symbol name __typename
      ... on EquityEtfAsset { legalName exchange { name } metrics { isin } }
      ... on EquityStockAsset { legalName exchange { name } metrics { isin } }
      ... on EquityEtcAsset { legalName exchange { name } metrics { isin } }
    } }
  }
}`;

const GET_ASSET = `query GetAssetGeneric($input: AssetInput!) {
  asset(input: $input) {
    id idInternal pid symbol name price
    ... on EquityEtfAsset { exchangeId metrics { isin } }
    ... on EquityStockAsset { exchangeId metrics { isin } }
    ... on EquityEtcAsset { exchangeId metrics { isin } }
  }
}`;

const CREATE_OFFER = `mutation createOffer($input: CreateOfferRequest!) {
  createOffer(request: $input) {
    offer {
      offerId
      type
      price { value }
      amountFiat { value }
      amountAsset { value }
      fee {
        fiat { value }
        asset { value }
        net { value }
        percentage { value }
        priceWithoutFee { value }
      }
      isFeeTransparent
      tax {
        taxAmountFiat { value }
        isTaxServiceAvailable
        fiatAmountAfterTax { value }
        taxAmountAsset { value }
      }
      isTaxable
      expiresAt { iso8601 }
      warnings { message }
    }
  }
}`;

const ACCEPT_OFFER = `mutation acceptOffer($input: AcceptOfferRequest!) {
  acceptOffer(request: $input) {
    ... on AcceptOfferSuccessResponse {
      trade {
        tradeId type status
        price { value }
        premium { value }
        amountFiat { value }
        amountAsset { value }
        fiatId assetId
        fiatWallet { id }
        assetWallet { id }
        fiatWalletTransaction { id }
        taxWithheld { taxAmountFiat { value } fiatAmountAfterTax { value } }
        executionTime { iso8601 }
      }
    }
    ... on AcceptOfferInProgressResponse {
      acceptOfferInProgress {
        type price { value } amountFiat { value } amountAsset { value } fiatId assetId
      }
    }
  }
}`;

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const pages = await browser.pages();
const page =
  pages.find((p) => /bitpanda\.com/i.test(p.url()) && !/fndsda|snapchat|mail|checkout/i.test(p.url())) ||
  null;
if (!page) throw new Error("aucun onglet Bitpanda ouvert (web.bitpanda.com).");

let token = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  token = (event.request.headers || {})["access-token"] || token;
});

await page.bringToFront();
if (!/bitpanda\.com/i.test(page.url())) {
  await page.goto("https://web.bitpanda.com/portfolio", { waitUntil: "domcontentloaded" });
}
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
        return { status: response.status, body: parsed, text: parsed ? null : text.slice(0, 500) };
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
  if (res.status !== 200) {
    throw new Error(`${operationName} HTTP ${res.status}: ${res.text || JSON.stringify(res.body).slice(0, 300)}`);
  }
  if (res.body?.errors) {
    throw new Error(`${operationName} : ${JSON.stringify(res.body.errors).slice(0, 400)}`);
  }
  return res.body?.data;
}

const money = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(Number(v).toFixed(6)));

const fiats = await call(`${REST}/fiatwallets`);
const wallets = await call(`${REST}/wallets`);
const currencies = await call(`${REST}/currencies/fiats`);
const balances = await call(`${REST}/user/balances`);

const fiatRows = fiats.body?.data || [];
const currencyRows = currencies.body?.data || [];
const fiatAttrs = (w) => w?.attributes || w || {};
const eurWallet = (Array.isArray(fiatRows) ? fiatRows : []).find((w) =>
  /EUR/i.test(fiatAttrs(w).fiat_symbol || fiatAttrs(w).fiat?.symbol || w.fiat?.symbol || "")
);
const eurAttrs = fiatAttrs(eurWallet);
const cash = money(eurAttrs.available ?? eurAttrs.balance ?? null);
console.error(`caisse EUR : ${cash ?? "?"}  (fiat HTTP ${fiats.status}, wallets HTTP ${wallets.status})`);
if (fiats.status !== 200) console.error("fiatwallets", JSON.stringify(fiats.body || fiats.text).slice(0, 400));

const found = await gql(GATEWAY, "AssetList", SEARCH, { query: SYMBOL, first: 8 });
const nodes = (found?.assets?.edges || []).map((e) => e.node);
const asset =
  nodes.find((n) => String(n.symbol || "").toUpperCase() === SYMBOL && /Equity/.test(n.__typename || "")) ||
  nodes.find((n) => String(n.symbol || "").toUpperCase() === SYMBOL) ||
  nodes[0];
if (!asset) throw new Error(`pas de ${SYMBOL} dans la recherche Bitpanda`);

const detail = await gql(GATEWAY, "GetAssetGeneric", GET_ASSET, { input: { pid: asset.pid } }).catch((e) => {
  console.error("GetAssetGeneric pid failed", e.message);
  return null;
});
const assetId = String(detail?.asset?.idInternal || asset.idInternal || asset.pid);
const fiatId = String(eurAttrs.fiat_id || eurAttrs.fiat?.id || "1");

console.error(
  `${asset.symbol} ${asset.__typename} pid=${asset.pid} id=${assetId} ` +
    `isin=${detail?.asset?.metrics?.isin || asset.metrics?.isin || "?"} ` +
    `price=${detail?.asset?.price ?? "?"} fiatId=${fiatId}`
);

async function offer(type, amount, definedFor = "FIAT") {
  return gql(GQL, "createOffer", CREATE_OFFER, {
    input: {
      amount: { value: String(amount) },
      amountDefinedFor: definedFor,
      assetId: String(assetId),
      fiatId: String(fiatId),
      type,
      visionBonus: false,
    },
  });
}

let buyQuote;
try {
  buyQuote = await offer("BUY", AMOUNT, "FIAT");
} catch (err) {
  console.error("createOffer gateway/v1 failed, dump ids", err.message);
  console.error("fiat sample", JSON.stringify(Array.isArray(fiatRows) ? fiatRows.slice(0, 2) : fiatRows).slice(0, 500));
  console.error("currency sample", JSON.stringify(Array.isArray(currencyRows) ? currencyRows.slice(0, 3) : currencyRows).slice(0, 500));
  console.error("asset", JSON.stringify(asset).slice(0, 400), "detail", JSON.stringify(detail).slice(0, 400));
  throw err;
}

const q = buyQuote?.createOffer?.offer;
if (!q) throw new Error(`createOffer sans offre : ${JSON.stringify(buyQuote).slice(0, 400)}`);

const quoted = {
  offerId: q.offerId,
  type: q.type,
  price: money(q.price?.value),
  amountFiat: money(q.amountFiat?.value),
  amountAsset: money(q.amountAsset?.value),
  feeFiat: money(q.fee?.fiat?.value),
  feePct: money(q.fee?.percentage?.value),
  priceWithoutFee: money(q.fee?.priceWithoutFee?.value),
  taxFiat: money(q.tax?.taxAmountFiat?.value),
  isFeeTransparent: q.isFeeTransparent,
  expiresAt: q.expiresAt?.iso8601,
};

console.error(
  `devis achat ${AMOUNT} € : ${quoted.amountAsset} @ ${quoted.price}  ` +
    `frais ${quoted.feeFiat} € (${quoted.feePct != null ? `${quoted.feePct} %` : "?"})  ` +
    `hors frais ${quoted.priceWithoutFee}`
);

const log = {
  at: new Date().toISOString(),
  live: LIVE,
  symbol: SYMBOL,
  name: asset.name || asset.legalName || null,
  typename: asset.__typename,
  isin: detail?.asset?.metrics?.isin || asset.metrics?.isin || null,
  assetId,
  fiatId,
  pid: asset.pid,
  cash,
  amount: AMOUNT,
  buyQuote: quoted,
  rawBuyOffer: q,
};

if (!LIVE) {
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  console.error(`\nlecture seule. pour mesurer : node bitpanda/bitpanda-live-experiment.mjs --live --amount=${AMOUNT} --symbol=${SYMBOL}`);
  await browser.disconnect();
  process.exit(0);
}

if (cash != null && cash < AMOUNT + 5) throw new Error(`caisse ${cash} € trop juste pour ${AMOUNT} €`);
if (quoted.feeFiat != null && quoted.feeFiat > 10) {
  throw new Error(`frais cotés ${quoted.feeFiat} € > 10 €, je n'accepte pas sans un nouvel OK`);
}

async function accept(offerId, assetWalletId = null) {
  const data = await gql(GQL, "acceptOffer", ACCEPT_OFFER, {
    input: { offerId, assetWalletId },
  });
  const acc = data?.acceptOffer;
  if (acc?.trade) return acc.trade;
  if (acc?.acceptOfferInProgress) return { pending: true, ...acc.acceptOfferInProgress };
  throw new Error(`acceptOffer inattendu : ${JSON.stringify(data).slice(0, 400)}`);
}

const buy = await accept(quoted.offerId, null);
log.buy = buy;
console.error(`achat : ${JSON.stringify(buy).slice(0, 280)}`);

await sleep(PAUSE);

const assetWalletId = buy.assetWallet?.id || null;
const boughtQty = money(buy.amountAsset?.value) ?? quoted.amountAsset;
if (boughtQty == null || boughtQty <= 0) throw new Error("quantité achetée inconnue, je n'essaie pas de vendre à l'aveugle");

const sellQuoteData = await offer("SELL", boughtQty, "ASSETS");
const sq = sellQuoteData?.createOffer?.offer;
if (!sq?.offerId) throw new Error(`pas de devis vente : ${JSON.stringify(sellQuoteData).slice(0, 400)}`);
log.sellQuote = {
  offerId: sq.offerId,
  price: money(sq.price?.value),
  amountFiat: money(sq.amountFiat?.value),
  amountAsset: money(sq.amountAsset?.value),
  feeFiat: money(sq.fee?.fiat?.value),
  feePct: money(sq.fee?.percentage?.value),
  priceWithoutFee: money(sq.fee?.priceWithoutFee?.value),
};
console.error(
  `devis vente ${boughtQty} : ${log.sellQuote.amountFiat} € @ ${log.sellQuote.price}  frais ${log.sellQuote.feeFiat} €`
);

const sell = await accept(sq.offerId, assetWalletId);
log.sell = sell;
console.error(`vente : ${JSON.stringify(sell).slice(0, 280)}`);

await sleep(800);
const fiatsAfter = await call(`${REST}/fiatwallets`);
const eurAfter = (fiatsAfter.body?.data || []).find((w) =>
  /EUR/i.test(w.attributes?.fiat_symbol || w.fiat?.symbol || w.symbol || "")
);
const afterAttrs = eurAfter?.attributes || eurAfter || {};
log.cashAfter = money(afterAttrs.available ?? afterAttrs.balance ?? null);
log.cashDelta = cash != null && log.cashAfter != null ? money(log.cashAfter - cash) : null;
log.feeRoundTripQuoted = money((quoted.feeFiat || 0) + (log.sellQuote.feeFiat || 0));

fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
console.error(`caisse ${cash} → ${log.cashAfter} (Δ ${log.cashDelta} €). ticket coté AR ${log.feeRoundTripQuoted} €`);
await browser.disconnect();
