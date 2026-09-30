// One real round trip at OANDA TMS, to price the conversion margin.
//
// `oanda_cost.mjs` charges about half a percent per conversion on any line not
// quoted in the account's own currency, and that figure is deduced and not seen.
// The fee table publishes the margin in units of the quoted currency — 0,006 on
// EURUSD — and says it is applied about « the MID price, the prevailing market
// rate based on Quotations available in the Trading System ». Dividing one by
// the other gives 0,52 %, which on an American line bought from a euro account
// is the entire bill, the commission there being zero.
//
// An American line is what makes the measurement clean. Commission nil, no stamp
// duty, and a SEC fee of two thousandths of a percent: on a round trip of one
// Ford share the only things that can move the money are the exchange's spread,
// one cent wide, and the conversion. So the realised loss separates the two
// hypotheses by a factor of ten.
//
//   sans marge de change   perte = l'écart du carnet     ≈ 0,01 $
//   avec marge de change   perte = l'écart + 1,03 %      ≈ 0,15 $
//
// The reference is read from the terminal itself rather than from an outside
// feed, since the table says the mid is the one quoted in the trading system:
// an order ticket on EURUSD prints it, and the same ticket on the share prints
// the share's. Both are read within seconds of the trade.
//
// This script buys and sells for real. It does nothing without `--go`, and it
// closes what it opens. What it leaves behind, if anything goes wrong between
// the two, is one share of a twelve-dollar company.
//
//   node oanda/oanda-trip.mjs                    (lecture seule : cotations, solde)
//   node oanda/oanda-trip.mjs --go               (l'aller-retour, pour de bon)
//   node oanda/oanda-trip.mjs --symbol=F.US --volume=1 --go
//
// Chrome must already be listening on 9222, with the terminal signed in.

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = new URL("oanda-trip.json", import.meta.url);

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SYMBOL = arg("symbol", "F.US");
const VOLUME = arg("volume", "1");
const FX = arg("fx", "EURUSD");
const GO = process.argv.includes("--go");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null, protocolTimeout: 25000 });
const page = (await browser.pages()).find((p) => /oanda\.com/i.test(p.url()));
if (!page) {
  console.error("aucun onglet OANDA : ouvrir https://www.oanda.com/eu-en/platform");
  process.exit(2);
}
const frame = page.frames().find((f) => /mt5web/.test(f.url()));
if (!frame) {
  console.error("le terminal MT5 n'est pas chargé dans la page");
  process.exit(2);
}

const text = () => frame.evaluate(() => document.body.innerText.replace(/\n+/g, "\n"));

const search = async (q) => {
  await frame.evaluate((q) => {
    const el = document.querySelector('input[placeholder*="Search" i]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, q);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, q);
  await sleep(2000);
};

// The search is a prefix match, so asking for F.US offers ANF.US as well — and
// a dry run picked it, on a share ten times the price, with the volume already
// set to one. The symbol is therefore matched whole and never by inclusion.
const pick = async (symbol) => {
  const ok = await frame.evaluate((symbol) => {
    const btn = [...document.querySelectorAll("button.item")].find((e) => {
      const first = (e.textContent || "").trim().split(/\s+/)[0];
      return first.toUpperCase() === symbol.toUpperCase();
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, symbol);
  await sleep(2000);
  await search("");
  await sleep(1500);
  return ok;
};

const closeTicket = () =>
  frame.evaluate(() => {
    const x = [...document.querySelectorAll("button,svg,span")].find((e) => /^(×|✕|✖)$/.test((e.textContent || "").trim()));
    x?.closest("button")?.click();
  });

/** Open the order ticket on whatever symbol the chart is showing. */
const openTicket = async () => {
  await frame.evaluate(() => {
    const el = [...document.querySelectorAll("button,div,span")].find(
      (e) => e.children.length === 0 && /^New Order$/i.test((e.textContent || "").trim())
    );
    (el?.closest("button") || el)?.click();
  });
  await sleep(2500);
};

// The ticket prints the two sides right above the Sell and Buy buttons, and
// nowhere else does the terminal show a tradeable price to the hundredth.
const quoteFromTicket = async () => {
  const lines = (await text()).split("\n").map((l) => l.trim()).filter(Boolean);
  const i = lines.indexOf("Sell");
  const bid = i > 1 ? Number(lines[i - 2]) : NaN;
  const ask = i > 0 ? Number(lines[i - 1]) : NaN;
  const symbol = (lines.find((l) => /^[\d.]+\s+\S+$/.test(l)) || "").split(/\s+/)[1] || null;
  if (Number.isFinite(bid) && Number.isFinite(ask)) return { symbol, bid, ask, mid: (bid + ask) / 2, at: now() };
  return { symbol, bid: null, ask: null, at: now(), lines: lines.slice(0, 14) };
};

const account = async () => {
  const t = await text();
  const grab = (label) => {
    const m = t.match(new RegExp(`${label}:\\s*(-?[\\d\\s.,]+)`));
    return m ? Number(m[1].replace(/\s/g, "").replace(",", ".")) : null;
  };
  return { balance: grab("Balance"), equity: grab("Equity"), margin: grab("Margin"), free: grab("Free margin"), at: now() };
};

const setVolume = async (v) => {
  await frame.evaluate(() => {
    const ins = [...document.querySelectorAll("input")].filter((e) => e.type !== "checkbox");
    ins[0]?.focus();
    ins[0]?.select?.();
  });
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type(String(v), { delay: 60 });
  await sleep(1200);
};

const log = [];
const note = (what, value) => {
  log.push({ at: now(), what, value });
  console.log(`${what} : ${typeof value === "object" ? JSON.stringify(value) : value}`);
};

// ---------------------------------------------------------------- la mesure

note("solde avant", await account());

// The mid the margin is applied to, read where the table says it lives.
await search(FX);
await pick(FX);
await openTicket();
const eurusd = await quoteFromTicket();
note(`${FX} au ticket`, eurusd);
await closeTicket();
await sleep(1000);

await search(SYMBOL);
if (!(await pick(SYMBOL))) {
  note("arrêt", `${SYMBOL} n'est pas revenu de la recherche`);
  await browser.disconnect();
  process.exit(1);
}
await openTicket();
await setVolume(VOLUME);
const before = await quoteFromTicket();
note(`${SYMBOL} avant l'ordre`, before);

// The ticket names the symbol above the volume field, and that name is the last
// thing checked before anything is sent.
const onTicket = await frame.evaluate(() => {
  const m = document.body.innerText.match(/([\d.]+)\s+([A-Z0-9._]+)\s*\n/);
  return m ? { volume: m[1], symbol: m[2] } : null;
});
note("ce que le ticket porte", onTicket);
if (!onTicket || onTicket.symbol.toUpperCase() !== SYMBOL.toUpperCase()) {
  note("arrêt", `le ticket porte ${onTicket?.symbol} et non ${SYMBOL} : rien n'est envoyé`);
  await browser.disconnect();
  process.exit(1);
}
await page.screenshot({ path: new URL("oanda-trip-before.png", import.meta.url).pathname });

if (!GO) {
  note("lecture seule", "rien n'a été envoyé — relancer avec --go pour l'aller-retour");
  fs.writeFileSync(OUT, JSON.stringify({ symbol: SYMBOL, volume: VOLUME, log }, null, 2));
  await browser.disconnect();
  process.exit(0);
}

const clickSide = (side) =>
  frame.evaluate((side) => {
    const b = [...document.querySelectorAll("button")].find((e) => new RegExp(`^${side}$`, "i").test((e.textContent || "").trim()));
    if (!b) return false;
    b.click();
    return true;
  }, side);

note("achat envoyé", (await clickSide("Buy")) ? `Buy ${VOLUME} ${SYMBOL}` : "bouton Buy introuvable");
await sleep(6000);
await page.screenshot({ path: new URL("oanda-trip-open.png", import.meta.url).pathname });
note("position", (await text()).split("\n").filter((l) => l.trim()).slice(0, 30).join(" | "));
note("solde après achat", await account());

// Closing is the step that must not fail, since what it leaves behind is a real
// position on a real account. So it is tried three ways and reported either way.
const closePosition = async () => {
  const named = await frame.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) => /^(Close|Close position)$/i.test((e.textContent || "").trim()));
    if (!b) return null;
    b.click();
    return "bouton Close";
  });
  if (named) return named;

  // The position row carries its own × at the right end.
  const cross = await frame.evaluate(() => {
    const row = [...document.querySelectorAll("tr,div")].find((e) => /\b(buy|sell)\b/i.test(e.textContent || "") && e.querySelector("button"));
    const x = row && [...row.querySelectorAll("button")].pop();
    if (!x) return null;
    x.click();
    return "croix de la ligne";
  });
  if (cross) return cross;
  return null;
};

let closed = await closePosition();
await sleep(4000);
// A confirmation may stand between the click and the close.
await frame.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((e) => /^(Close|OK|Confirm|Yes)$/i.test((e.textContent || "").trim()));
  b?.click();
});
await sleep(5000);
note("fermeture", closed || "aucun contrôle de fermeture trouvé — VOIR LA CAPTURE, la position est peut-être ouverte");
await page.screenshot({ path: new URL("oanda-trip-closed.png", import.meta.url).pathname });
note("solde après vente", await account());
note("écran", (await text()).split("\n").filter((l) => l.trim()).slice(0, 40).join(" | "));

// The history tab is where the commission is named apart from the result, which
// is the whole point: a minimum commission and a conversion margin are two very
// different charges that land in the same euro.
await frame.evaluate(() => {
  const t = [...document.querySelectorAll("button,div,span")].find(
    (e) => e.children.length === 0 && /^History$/i.test((e.textContent || "").trim())
  );
  (t?.closest("button") || t)?.click();
});
await sleep(4000);
note("historique", (await text()).split("\n").filter((l) => l.trim()).slice(0, 45).join(" | "));
await page.screenshot({ path: new URL("oanda-trip-history.png", import.meta.url).pathname });

fs.writeFileSync(OUT, JSON.stringify({ symbol: SYMBOL, volume: VOLUME, eurusd, before, log }, null, 2));
console.log(`\nécrit dans ${OUT.pathname}`);
await browser.disconnect();
