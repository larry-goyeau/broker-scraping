// What CapTrader says an order will cost, asked before the order exists.
//
// Same machine as `mexem-whatif.mjs` — the portal is IBKR's — pointed at the
// CapTrader tab. It previews and returns; there is no path to `orders` without
// `whatif` on the end.
//
//   node captrader/captrader-whatif.mjs
//   node captrader/captrader-whatif.mjs --only=amsterdam_dirige
//   node captrader/captrader-whatif.mjs --symbol=ORA --venue=SBF
//
// Answers land in `captrader-whatif.json`.

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const API = "/portal.proxy/v1/portal";
const OUT = new URL("captrader-whatif.json", import.meta.url);

const CASES = [
  {
    id: "amsterdam",
    asks: "SMART sur un ticket AEB : 4 € sur la page, 2 € le 10 septembre via GETTEX",
    symbol: "IWDA",
    exchange: "AEB",
    side: "BUY",
    quantity: 1,
    expect: "une fourchette 2 … 4 € si le routeur hésite, 2 € s'il recommence",
  },
  {
    id: "amsterdam_dirige",
    asks: "le même ordre, forcé sur Amsterdam",
    symbol: "IWDA",
    exchange: "AEB",
    route: "AEB",
    side: "BUY",
    quantity: 1,
    expect: "4 € si le palier néerlandais est vrai une fois le routeur écarté",
  },
  {
    id: "gettex",
    asks: "GETTEX nommément, le plancher déjà vu en live",
    symbol: "IWDA",
    exchange: "GETTEX",
    route: "GETTEX",
    side: "BUY",
    quantity: 1,
    expect: "2 € sec",
  },
  {
    id: "paris",
    asks: "le plancher français de 4 €, et si la FTT 0,40 % se voit dans l'aperçu",
    symbol: "ORA",
    exchange: "SBF",
    route: "SBF",
    side: "BUY",
    quantity: 1,
    expect: "4 €, plus ~0,40 % du cours si la taxe est chiffrée ici",
  },
  {
    id: "milan",
    asks: "le plancher italien, et si la FTT 0,10 % que la page dit retenir apparaît",
    symbol: "ISP",
    exchange: "BVME",
    route: "BVME",
    side: "BUY",
    quantity: 1,
    expect: "4 €, plus 0,10 % si la note CapTrader est vraie dans l'aperçu",
  },
  {
    id: "lisbonne",
    asks: "Lisbonne, le seul palier euro à 6 €",
    symbol: "BCP",
    exchange: "BVL",
    route: "BVL",
    side: "BUY",
    quantity: 1,
    expect: "6 €",
  },
  {
    id: "xetra",
    asks: "Xetra à 4 €, sans spécialiste",
    symbol: "TUI1",
    exchange: "IBIS",
    route: "IBIS",
    side: "BUY",
    quantity: 1,
    expect: "4 €",
  },
  {
    id: "francfort",
    asks: "Francfort plus le spécialiste (page 5 € + 2,52 €)",
    symbol: "LHA",
    exchange: "FWB",
    route: "FWB",
    side: "BUY",
    quantity: 1,
    expect: "7,52 € si les deux planchers se cumulent",
  },
  {
    id: "dublin",
    asks: "l'Irlande, sur le livre IBKR et absente de la page",
    symbol: "AIB",
    exchange: "ISED",
    side: "BUY",
    quantity: 1,
    expect: "un chiffre, ou un refus qui dit que la plateforme a un prix même si la page n'en a pas",
  },
  {
    id: "us",
    asks: "le plancher américain de 2 $",
    symbol: "F",
    exchange: "NYSE",
    side: "BUY",
    quantity: 1,
    expect: "2 USD, ou un refus de dollars réglés",
  },
];

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const isPortal = (u) => /clientam\.com/i.test(u);
const isCaptrader = (u) => /CapTrader/i.test(u);
const loggedOut = (u) => /sso\.|\/sso\/|\/Login|signin|authentication|amauthentication/i.test(u);

let page = null;
const candidates = [];
for (const candidate of await browser.pages()) {
  try {
    if (!candidate.isClosed() && isPortal(candidate.url()) && !loggedOut(candidate.url())) {
      candidates.push(candidate);
    }
  } catch {
    // Tab went away.
  }
}
page = candidates.find((p) => isCaptrader(p.url())) || candidates[0];
if (!page) {
  console.error("Aucun onglet CapTrader connecté sur clientam.com. Ouvre le portail et recommence.");
  process.exit(1);
}

function call(path, options = {}) {
  return page.evaluate(
    async (base, target, opts) => {
      try {
        const r = await fetch(`${base}/${target}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: opts.method || "GET",
          body: opts.body || undefined,
        });
        const text = await r.text();
        try {
          return { status: r.status, json: JSON.parse(text) };
        } catch {
          return { status: r.status, error: text.slice(0, 300) };
        }
      } catch (e) {
        return { error: String(e) };
      }
    },
    API,
    path,
    options
  );
}

async function conidFor({ symbol, exchange }) {
  const found = await call("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern: false, referrer: "" }),
  });
  const hits = Array.isArray(found.json) ? found.json : [];
  const want = String(exchange).toUpperCase();
  const onVenue = hits.find(
    (h) =>
      String(h.description || "").toUpperCase() === want ||
      (h.sections || []).some((s) => String(s.exchange || "").toUpperCase().split(",").includes(want))
  );
  const hit = onVenue || hits[0];
  return hit ? { conid: String(hit.conid), description: hit.description, company: hit.companyHeader } : null;
}

async function lastPrice(conid) {
  for (let i = 0; i < 8; i++) {
    const snap = await call(`iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86`);
    const row = Array.isArray(snap.json) ? snap.json[0] : null;
    const raw = row?.["31"] ?? row?.["84"] ?? row?.["86"];
    const px = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
    if (px > 0) return px;
    await sleep(1200);
  }
  return null;
}

async function whatIf({ accountId, conid, side, quantity, price, exchange = null }) {
  const order = {
    conid: Number(conid),
    orderType: "LMT",
    price,
    side,
    quantity,
    tif: "DAY",
    secType: `${conid}:STK`,
    ...(exchange ? { exchange } : {}),
  };
  let answer = await call(`iserver/account/${accountId}/orders/whatif`, {
    method: "POST",
    body: JSON.stringify({ orders: [order] }),
  });
  if (answer.status === 404 || answer.json?.error) {
    answer = await call(`iserver/account/${accountId}/order/whatif`, {
      method: "POST",
      body: JSON.stringify(order),
    });
  }
  const said = JSON.stringify(answer.json ?? "");
  const tick = said.match(/minimum price variation of ([\d.]+)/);
  if (tick) {
    const step = Number(tick[1]);
    const snapped = Number(
      (step * (side === "BUY" ? Math.floor(price / step) : Math.ceil(price / step))).toFixed(10)
    );
    if (step > 0 && snapped > 0 && snapped !== price) {
      return whatIf({ accountId, conid, side, quantity, price: snapped, exchange });
    }
  }
  return answer;
}

const accounts = await call("iserver/accounts");
const accountId = accounts.json?.selectedAccount || accounts.json?.accounts?.[0];
if (!accountId) {
  console.error(`Pas de compte : ${JSON.stringify(accounts).slice(0, 300)}`);
  process.exit(1);
}
console.error(`compte ${accountId}\n`);

const only = arg("only");
const adHoc = arg("symbol")
  ? [
      {
        id: "à la volée",
        asks: "posée en ligne de commande",
        symbol: arg("symbol"),
        exchange: arg("venue") || "AEB",
        route: arg("route") || null,
        side: (arg("side") || "BUY").toUpperCase(),
        quantity: Number(arg("qty") || 1),
        expect: "—",
      },
    ]
  : null;

const results = [];
for (const c of adHoc || CASES) {
  if (!adHoc && only && c.id !== only) continue;
  const found = await conidFor(c);
  if (!found) {
    console.error(`${c.id.padEnd(18)} introuvable : ${c.symbol} @ ${c.exchange}`);
    results.push({ ...c, error: "contrat introuvable" });
    continue;
  }
  const price = await lastPrice(found.conid);
  if (!price) {
    console.error(`${c.id.padEnd(18)} pas de cours pour ${c.symbol} (${found.conid})`);
    results.push({ ...c, ...found, error: "pas de cours" });
    continue;
  }
  const answer = await whatIf({
    accountId,
    conid: found.conid,
    side: c.side,
    quantity: c.quantity,
    price,
    exchange: c.route ?? null,
  });
  const amount = answer.json?.amount || null;
  const refused = answer.json?.errors || (answer.json?.error ? [answer.json.error] : []);
  results.push({
    ...c,
    conid: found.conid,
    company: found.company,
    price,
    notional: Number((price * c.quantity).toFixed(2)),
    amount: amount?.amount ?? null,
    commission: amount?.commission ?? null,
    total: amount?.total ?? null,
    refused: refused.length ? refused : undefined,
  });
  console.error(
    `${c.id.padEnd(18)} ${c.side} ${c.quantity} ${c.symbol} @ ${c.exchange} ` +
      `à ${price} → commission ${amount?.commission ?? JSON.stringify(answer.json?.error || answer).slice(0, 160)}` +
      (amount?.commission === "—" && refused.length ? `\n${"".padEnd(18)} refusé : ${String(refused[0]).slice(0, 160)}` : "")
  );
  console.error(`${"".padEnd(18)} attendu : ${c.expect}\n`);
  await sleep(1200);
}

fs.writeFileSync(OUT, JSON.stringify({ readOn: new Date().toISOString(), accountId, results }, null, 2));
console.error(`écrit dans ${OUT.pathname}`);
await browser.disconnect();
