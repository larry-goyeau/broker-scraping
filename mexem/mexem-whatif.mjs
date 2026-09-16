// What Mexem says an order will cost, asked before the order exists.
//
// The fee page leaves six things unsaid, and the portal answers all six for
// nothing: `whatif` is the machine-readable form of the Preview button. It
// returns the commission the ticket would be charged and places no order. This
// file never calls anything else — there is no path through it that reaches
// `orders` without `whatif` on the end.
//
// It borrows the signed-in tab the way `mexem_scraping.mjs` does, and for the
// same reason: the session belongs to the browser, not to this process.
//
//   node mexem/mexem-whatif.mjs
//   node mexem/mexem-whatif.mjs --only=cap
//
// Answers land in `mexem-whatif.json` beside the catalogue.

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const API = "/portal.proxy/v1/portal";
const OUT = new URL("mexem-whatif.json", import.meta.url);

// Each case names the hole it closes, so an answer can be read against an
// expectation rather than admired on its own.
//
// Every size here is one share, and that is not modesty: the portal refuses to
// price an order it would reject, and the account holds 150 €. An order over
// that comes back with a credit-check error and a commission of « — », so the
// only previews that answer anything are the ones that would clear. It costs
// nothing analytically — the floor is the whole bill up to 1 667 € on a European
// tier anyway, so one share and a hundred are the same number.
const CASES = [
  {
    id: "amsterdam",
    asks: "les « exchange and regulatory costs » d'Amsterdam, imprimés sans montant",
    symbol: "IWDA",
    exchange: "AEB",
    side: "BUY",
    quantity: 1,
    expect: "1,00 € si le plancher est tout ; davantage si la place ajoute la sienne",
  },
  {
    id: "amsterdam_dirige",
    asks: "le même ordre, envoyé à Amsterdam nommément plutôt qu'au routeur",
    symbol: "IWDA",
    exchange: "AEB",
    route: "AEB",
    side: "BUY",
    quantity: 1,
    expect: "un chiffre sec si la fourchette n'était que l'incertitude du routeur",
  },
  // Same money, twenty-three times and two hundred times the shares. If the
  // range's top follows the share count the venue bills per share; if it stays
  // put it bills per order. Nothing else on the page can settle this.
  {
    id: "amsterdam_15",
    asks: "le même montant, quinze fois plus de parts",
    symbol: "CMCOM",
    exchange: "AEB",
    side: "BUY",
    // Twenty shares needed 137 € against 128,37 € of settled euro and came back
    // a credit refusal rather than a price. Fifteen clears and asks the same
    // question.
    quantity: 15,
    expect: "1,00 … 1,80 € si la place facture par ordre, quinze fois plus si c'est par part",
  },
  {
    id: "cap",
    asks: "le plafond américain : Mexem imprime 2 %, le tarif fixe IBKR plafonne à 1 %",
    symbol: "F",
    exchange: "NYSE",
    side: "BUY",
    quantity: 1,
    expect: "2 % de la valeur si la carte Mexem dit vrai, 1 % si c'est la grille IBKR",
  },
  // Amsterdam is one of seventeen venues whose "exchange and regulatory costs
  // apply" with no figure printed anywhere. `mexem_cost.mjs` charges the 0,80 €
  // measured there on all seventeen, which is an extrapolation it admits to in
  // every confidence line. These ask the other venues directly. A share and an
  // ETF where both exist, because Amsterdam bills them differently.
  {
    id: "paris",
    asks: "les frais de place de Paris, imprimés sans montant",
    symbol: "ORA",
    exchange: "SBF",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec si Paris ne facture rien, une fourchette si elle facture",
  },
  {
    id: "paris_etf",
    asks: "le même à Paris sur un fonds, qu'Amsterdam facture et pas l'action",
    // CC4 quotes 224 € against 128,37 € of settled euro and came back a credit
    // refusal. PAEEM asks the same question for about 25 €.
    symbol: "PAEEM",
    exchange: "SBF",
    side: "BUY",
    quantity: 1,
    expect: "une fourchette si la majoration ETF n'est pas propre à Amsterdam",
  },
  {
    id: "xetra",
    asks: "les frais de place de Xetra",
    symbol: "TUI1",
    exchange: "IBIS",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  {
    id: "xetra_etf",
    asks: "le même à Xetra sur un fonds",
    symbol: "0EMU",
    exchange: "IBIS",
    side: "BUY",
    quantity: 1,
    expect: "une fourchette si la majoration ETF est générale",
  },
  {
    id: "milan",
    asks: "les frais de place de Milan",
    symbol: "ISP",
    exchange: "BVME",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  {
    id: "bruxelles",
    asks: "les frais de place de Bruxelles",
    symbol: "PROX",
    exchange: "ENEXT.BE",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  {
    id: "vienne",
    asks: "les frais de place de Vienne",
    symbol: "UQA",
    exchange: "VSE",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  {
    id: "lisbonne",
    asks: "les frais de place de Lisbonne",
    symbol: "BCP",
    exchange: "BVL",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  // The second pass, once the account was given the stock permissions it lacked.
  // Frankfurt alone is 6 932 of the lines that carry an extrapolated venue fee,
  // so it is the one that matters most; the rest close the map.
  {
    id: "francfort",
    asks: "les frais de place de Francfort, la plus grosse part de l'extrapolation",
    symbol: "02V",
    exchange: "FWB",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  {
    id: "francfort_etf",
    asks: "le même à Francfort sur un fonds",
    // IDF is an American closed-end fund and came back a KID-language refusal
    // rather than a price. EQSP is a UCITS and asks the same question.
    symbol: "EQSP",
    exchange: "FWB",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette — les fonds allemands n'ont plus de KID en bloc",
  },
  {
    id: "stuttgart",
    asks: "les frais de place de Stuttgart",
    symbol: "02M",
    exchange: "SWB",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec ou une fourchette",
  },
  {
    id: "stuttgart_etf",
    asks: "le même à Stuttgart sur un fonds",
    symbol: "BUNH",
    exchange: "SWB",
    route: "SWB",
    side: "BUY",
    quantity: 1,
    expect: "1 € sec, 0,80 €, ou autre chose : un premier essai a ouvert 1,00 … 4,50 €",
  },
  {
    id: "ebs",
    asks: "les frais de place d'EBS, qui cote surtout en francs",
    symbol: "XSMI",
    exchange: "EBS",
    side: "BUY",
    quantity: 1,
    expect: "le palier suisse, plancher 7,5 CHF, jamais confronté au portail",
  },
  {
    id: "varsovie",
    asks: "les frais de place de Varsovie, et si un ordre en zlotys passe sans zlotys",
    symbol: "ETFBCASH",
    exchange: "WSE",
    side: "BUY",
    quantity: 1,
    expect: "le palier PLN, plancher 20, ou un refus de trésorerie qui dit autre chose",
  },
  {
    id: "budapest",
    asks: "les frais de place de Budapest",
    symbol: "OPUS",
    exchange: "BUX",
    side: "BUY",
    quantity: 1,
    expect: "le palier HUF, plancher 500",
  },
  // Not a venue fee but two taxes this file charges on 1 518 London lines
  // without ever having seen either debited.
  {
    id: "londres",
    asks: "le timbre britannique de 0,5 % et le prélèvement PTM, jamais vus débités",
    symbol: "CARD",
    exchange: "LSE",
    side: "BUY",
    quantity: 1,
    expect: "le plancher de 2,5 £, et le timbre s'il est chiffré à part dans l'aperçu",
  },
  {
    id: "vente_us",
    asks: "la SEC et la TAF sur une vente, que la carte ne réimprime pas",
    symbol: "F",
    exchange: "NYSE",
    side: "SELL",
    quantity: 1,
    expect: "le plafond ou le plancher, plus les deux prélèvements s'ils sont ajoutés à part",
  },
];

// ---------------------------------------------------------------- la session

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const isPortal = (u) => /clientam\.com/i.test(u);
const loggedOut = (u) => /sso\.|\/sso\/|\/Login|signin|authentication|amauthentication/i.test(u);

let page = null;
for (const candidate of await browser.pages()) {
  try {
    if (!candidate.isClosed() && isPortal(candidate.url()) && !loggedOut(candidate.url())) {
      page = candidate;
      break;
    }
  } catch {
    // Tab went away while it was being inspected.
  }
}
if (!page) {
  console.error("Aucun onglet MEXEM connecté sur clientam.com. Ouvre le portail et recommence.");
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

// ---------------------------------------------------------------- le contrat

async function conidFor({ symbol, exchange }) {
  const found = await call("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol, pattern: false, referrer: "" }),
  });
  const hits = Array.isArray(found.json) ? found.json : [];
  const want = String(exchange).toUpperCase();
  // `sections` names the venues a conid trades on; the description carries the
  // primary one. Either is enough to tell an Amsterdam line from a German one.
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

// The only order endpoint this file knows. It previews and returns; the portal
// has no way to turn a whatif into a live order.
async function whatIf({ accountId, conid, side, quantity, price, exchange = null }) {
  const order = {
    conid: Number(conid),
    orderType: "LMT",
    price,
    side,
    quantity,
    tif: "DAY",
    secType: `${conid}:STK`,
    // Left unset the order goes out SMART, and SMART is free to reach a venue on
    // another tier — which is what a commission quoted as a range is saying.
    // Naming the venue is how a single figure is obtained.
    ...(exchange ? { exchange } : {}),
  };
  let answer = await call(`iserver/account/${accountId}/orders/whatif`, {
    method: "POST",
    body: JSON.stringify({ orders: [order] }),
  });
  // Older portals take one order and not a list.
  if (answer.status === 404 || answer.json?.error) {
    answer = await call(`iserver/account/${accountId}/order/whatif`, {
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  // The limit is the last trade, which on Euronext and Xetra need not sit on the
  // instrument's own tick — Orange came back « does not conform to the minimum
  // price variation of 0.005 ». The refusal names the tick, so it can be obeyed
  // rather than guessed. Down for a buy and up for a sell, which only ever asks
  // for less cash than the portal already agreed to.
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

// ---------------------------------------------------------------- la passe

const accounts = await call("iserver/accounts");
const accountId = accounts.json?.selectedAccount || accounts.json?.accounts?.[0];
if (!accountId) {
  console.error(`Pas de compte : ${JSON.stringify(accounts).slice(0, 300)}`);
  process.exit(1);
}
console.error(`compte ${accountId}\n`);

// A cash account may only spend what has settled, and a conversion settles the
// next business day, so « I converted » and « I can buy » are two different days.
// Worth being able to ask which one it is.
if (process.argv.includes("--cash")) {
  const accounts = await call("iserver/accounts");
  const id = accounts.json?.selectedAccount || accounts.json?.accounts?.[0];
  const ledger = await call(`portfolio/${id}/ledger`);
  for (const [ccy, l] of Object.entries(ledger.json || {})) {
    if (!l || typeof l !== "object") continue;
    console.log(
      `${ccy.padEnd(6)} solde ${String(l.cashbalance ?? "?").padStart(12)} ` +
        `| disponible ${String(l.settledcash ?? "?").padStart(12)} ` +
        `| à régler ${String(l.unsettledcash ?? l.cashbalance - (l.settledcash ?? 0) ?? "?").padStart(10)}`
    );
  }
  await browser.disconnect();
  process.exit(0);
}

const only = arg("only");
// One-off question, for when the answer to a case raises another one:
//   node mexem/mexem-whatif.mjs --symbol=CMCOM --venue=AEB --qty=1
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
    console.error(`${c.id.padEnd(16)} introuvable : ${c.symbol} @ ${c.exchange}`);
    results.push({ ...c, error: "contrat introuvable" });
    continue;
  }
  const price = await lastPrice(found.conid);
  if (!price) {
    console.error(`${c.id.padEnd(16)} pas de cours pour ${c.symbol} (${found.conid})`);
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
  // A commission of « — » is never a free trade: it is the portal declining to
  // price an order it would refuse, and the reason is in `errors`.
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
    raw: amount ? undefined : answer,
  });
  console.error(
    `${c.id.padEnd(16)} ${c.side} ${c.quantity} ${c.symbol} @ ${c.exchange} ` +
      `à ${price} → commission ${amount?.commission ?? JSON.stringify(answer.json?.error || answer).slice(0, 160)}` +
      (amount?.commission === "—" && refused.length ? `\n${"".padEnd(16)} refusé : ${String(refused[0]).slice(0, 150)}` : "")
  );
  console.error(`${"".padEnd(16)} attendu : ${c.expect}\n`);
  await sleep(1500);
}

fs.writeFileSync(OUT, JSON.stringify({ readOn: new Date().toISOString(), accountId, results }, null, 2));
console.error(`écrit dans ${OUT.pathname}`);
await browser.disconnect();
