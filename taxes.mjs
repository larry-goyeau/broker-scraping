// Which transaction taxes each listing pays, one instrument at a time.
//
// This sits at the root, with the other shared sources, because a transaction tax is a fact about
// the instrument and not about the broker: British stamp duty is half a per cent of a purchase of
// HSBC wherever it is bought, and the French tax is four tenths of a per cent of a purchase of
// Eutelsat at every broker in the file. Only the reading is Trading212's — its ex-ante cost
// disclosure is the cheapest authority available, being free, per instrument, and the broker's own
// statement of what it will collect. `rule605-monthly.mjs` and `xlm-monthly.mjs` sit here for the
// same reason, each sourced from one place and useful to all of them.
//
// A rule by exchange would be wrong, and that is the whole reason this file exists. Two shares
// quoted side by side in Paris are taxed differently — Eutelsat pays the French transaction tax
// and Groupe SFPI does not, because the tax only reaches issuers above a billion of market
// capitalisation, a threshold no catalogue carries. London is worse: the main market pays stamp
// duty, AIM pays none, and a foreign issuer listed there pays none either. So the tax is a
// property of the instrument, and the only authority on it is the broker that collects it.
//
// Nothing is bought. `rest/v2/public/added-costs` prices a hypothetical order and returns the
// charges that would attach to it; the quantity is large on purpose so that a tax of a tenth of a
// percent lands well above the cent it is rounded to.
//
// What comes back, established over the regimes swept here:
//   STAMP_DUTY               0.5%   du montant, à l'achat seulement, actions britanniques hors AIM
//   FRENCH_TRANSACTION_TAX   0.4%   du montant, à l'achat seulement, gros émetteurs français
//   PTM_LEVY                 1,50 £ par ordre, des deux côtés, au-delà de 10 000 £ de montant
//   TRANSACTION_FEE          0,0000206 du montant, à la vente, lignes américaines (SEC)
//   FINRA_FEE                0,000195 par part, à la vente, lignes américaines
//
//   node taxes.mjs                            (balaie tout, reprend où il en était)
//   node taxes.mjs --exchange="Euronext Paris"
//   node taxes.mjs --fresh                    (repart de zéro)

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const OUT = new URL("parsed_json/taxes.json", import.meta.url);
const CATALOGUE = new URL("trading212/trading212-parsed.json", import.meta.url);
// Where the sweep used to write, before it moved to the root. Read once so a run in progress is
// not thrown away, then never again.
const MOVED_FROM = new URL("trading212/t212-taxes.json", import.meta.url);

const flag = (name, fallback = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : fallback;
};

// Big enough that a 0.1% tax on a penny share still clears the cent it is rounded to, small
// enough that the disclosure does not refuse the notional. Both ends were checked.
const QUANTITY = Number(flag("quantity", "1000"));
// The endpoint refuses past roughly five calls a second, and refuses for a while once refused,
// so the sweep is paced rather than parallel. Four at a time with a breath between lots held for
// a full pass; anything faster came back 429 and stayed there.
const BATCH = Number(flag("batch", "2"));
const PAUSE = Number(flag("pause", "900"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const allRows = (Array.isArray(catalogue) ? catalogue : catalogue.rows || []).filter(
  (r) => r.code && r.type !== "CRYPTO"
);
// Fourteen thousand disclosures at the pace this endpoint tolerates would take a working day, so
// the sweep is aimed rather than exhaustive — but aimed by law, not by convenience. Every venue
// whose jurisdiction levies a tax on the transaction itself is swept line by line, because within
// those venues the tax is a property of the issuer that nothing else recovers. Everywhere else is
// sampled, widely enough that a tax could not hide in it, and the file records which lines were
// swept and which were merely sampled so that a sample is never read as a census.
const TAXING_VENUES = new Set([
  "London Stock Exchange", // droit de timbre 0,5 %, et prélèvement PTM au-delà de 10 000 £
  "London Stock Exchange AIM", // exempté de timbre, mais le PTM y court quand même
  "Euronext Paris", // taxe française 0,4 % au-dessus du milliard de capitalisation
  "Borsa Italiana", // taxe italienne 0,1 %
  "Bolsa de Madrid", // taxe espagnole 0,2 %
  "Euronext Brussels", // taxe belge sur les opérations de bourse
  "Euronext Amsterdam",
  "Euronext Lisbon",
]);
const SAMPLE = Number(flag("sample", "150"));

const wantExchange = flag("exchange");
let rows;
if (wantExchange) {
  rows = allRows.filter((r) => r.exchange === wantExchange);
} else {
  const kept = new Map();
  rows = allRows.filter((r) => {
    if (TAXING_VENUES.has(r.exchange)) return true;
    const n = kept.get(r.exchange) ?? 0;
    if (n >= SAMPLE) return false;
    kept.set(r.exchange, n + 1);
    return true;
  });
}

const held = fs.existsSync(OUT) ? OUT : fs.existsSync(MOVED_FROM) ? MOVED_FROM : null;
const previous = !process.argv.includes("--fresh") && held ? JSON.parse(fs.readFileSync(held, "utf8")) : null;
const seen = new Map(Object.entries(previous?.byCode ?? {}));
const failed = new Map(Object.entries(previous?.failed ?? {}));

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("app.trading212.com"));
if (!page) throw new Error("aucun onglet app.trading212.com ouvert.");

// The equity session is validated against this client string, so it is read from the app's own
// cookie rather than invented.
const traderClient = await page.evaluate(
  () => `application=WC4,version=8.46.0,dUUID=${document.cookie.match(/[0-9a-f]{32}=%22([0-9a-f-]{36})%22/)?.[1] ?? ""}`
);

// A batch goes out in one round trip to the page, which is what makes fourteen thousand
// disclosures take minutes rather than an hour.
const disclose = (orders) =>
  page.evaluate(
    async (list, client) => {
      const one = async (body) => {
        try {
          const r = await fetch("https://live.services.trading212.com/rest/v2/public/added-costs", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Trader-Client": client,
              "X-Trader-Target-Type": "EQUITY",
            },
            body: JSON.stringify(body),
          });
          const text = await r.text();
          try {
            return { status: r.status, json: JSON.parse(text) };
          } catch {
            return { status: r.status, text: text.slice(0, 120) };
          }
        } catch (e) {
          return { status: 0, text: String(e).slice(0, 120) };
        }
      };
      return Promise.all(list.map(one));
    },
    orders,
    traderClient
  );

const orderFor = (row, quantity) => ({
  quantity,
  instrumentCode: row.code,
  currencyCode: row.currency || "EUR",
  orderType: "MARKET",
  timeValidity: "GOOD_TILL_CANCEL",
  enabledExtendedMarketHours: false,
});

// The purchase is swept in full because that is where the per-instrument fact lives: stamp duty
// and the French tax attach to the issuer, and no rule recovers which issuer. The sale carries
// only uniform rules — the American regulatory fees, the takeover levy above its threshold — so
// it is sampled by exchange instead of swept, and the file says which is which rather than
// letting a sample pass for a census.
const SELL_SAMPLE = Number(flag("sellSample", "30"));
const sellWanted = new Set();
const perVenue = new Map();
for (const r of rows) {
  const n = perVenue.get(r.exchange) ?? 0;
  if (n < SELL_SAMPLE) {
    perVenue.set(r.exchange, n + 1);
    sellWanted.add(r.code);
  }
}

const todo = rows.filter((r) => !seen.has(r.code) && (failed.get(r.code) ?? 0) < 2);
console.error(`${rows.length} lignes, ${seen.size} déjà relevées, ${todo.length} à faire`);

const save = () => {
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        quantity: QUANTITY,
        source: "rest/v2/public/added-costs, divulgation ex-ante MiFID de Trading212",
        convention:
          "taux du montant pour les lignes proportionnelles, montant fixe dans la devise de la ligne pour les autres ; achat et vente séparés",
        lines: seen.size,
        sweep:
          "achat relevé ligne à ligne sur les places dont le droit lève une taxe sur la transaction, " +
          "échantillonné ailleurs ; vente échantillonnée partout, voir venteRelevée",
        sweptInFull: [...TAXING_VENUES],
        byCode: Object.fromEntries(seen),
        failed: Object.fromEntries(failed),
      },
      null,
      2
    )
  );
};

let done = 0;
const started = Date.now();
for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  const orders = slice.flatMap((r) => (sellWanted.has(r.code) ? [orderFor(r, QUANTITY), orderFor(r, -QUANTITY)] : [orderFor(r, QUANTITY)]));
  let answers;
  try {
    answers = await disclose(orders);
  } catch (error) {
    console.error(`\nlot interrompu : ${String(error).slice(0, 120)}`);
    break;
  }

  // A refusal is the pace, not the instrument: back off and let the lot come round again.
  if (answers.some((a) => a?.status === 429)) {
    process.stderr.write(`\r429 — pause de 20 s puis reprise                    `);
    await sleep(20000);
    i -= BATCH;
    continue;
  }

  let cursor = 0;
  slice.forEach((row) => {
    const sides = { achat: answers[cursor++] };
    if (sellWanted.has(row.code)) sides.vente = answers[cursor++];
    if (sides.achat?.status !== 200 && sides.vente?.status !== 200) {
      failed.set(row.code, (failed.get(row.code) ?? 0) + 1);
      return;
    }
    const entry = { exchange: row.exchange, currency: row.currency, type: row.type };
    if (sellWanted.has(row.code)) entry.venteRelevée = true;
    for (const [side, a] of Object.entries(sides)) {
      if (!a) continue;
      const costs = a?.json?.costs ?? {};
      const value = Number(a?.json?.orderValue) || 0;
      for (const [name, amount] of Object.entries(costs)) {
        if (!Number(amount)) continue;
        // Proportional charges are stored as a rate so they survive a price change; flat ones
        // are stored as they come, with the quantity that triggered them, since a threshold
        // cannot be read off a single reading.
        entry[side] ??= {};
        entry[side][name] = { amount: Number(amount), ofValue: value ? Number((Math.abs(amount) / value).toPrecision(6)) : null };
      }
      if (value) entry.price = Number((value / QUANTITY).toPrecision(8));
    }
    seen.set(row.code, entry);
    failed.delete(row.code);
  });

  await sleep(PAUSE);
  done += slice.length;
  if (done % 100 < BATCH || i + BATCH >= todo.length) {
    save();
    const rate = done / ((Date.now() - started) / 1000);
    process.stderr.write(
      `\r${done}/${todo.length} — ${rate.toFixed(0)}/s — reste ${Math.round((todo.length - done) / Math.max(rate, 0.1))} s   `
    );
  }
}
save();
console.error("");

// A count by exchange and by charge, because the useful output is not the dump but which lines
// are taxed at all.
const tally = new Map();
for (const [, e] of seen) {
  for (const side of ["achat", "vente"]) {
    for (const name of Object.keys(e[side] ?? {})) {
      const key = `${e.exchange} · ${side} · ${name}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
}
const perExchange = new Map();
for (const [, e] of seen) perExchange.set(e.exchange, (perExchange.get(e.exchange) ?? 0) + 1);

console.log(`\n${seen.size} lignes relevées, ${failed.size} en échec\n`);
console.log("charges rencontrées :");
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
  const [exchange] = k.split(" · ");
  console.log(`  ${String(n).padStart(5)} / ${String(perExchange.get(exchange)).padStart(5)}   ${k}`);
}
console.log(`\nécrit dans parsed_json/taxes.json`);

await browser.disconnect();
