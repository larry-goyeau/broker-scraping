// What one share costs, so that a fee expressed in percent can be turned into money.
// A fact about the instrument and not about any broker, so it sits at the root beside
// `fx.mjs` and `taxes.mjs`, and every `*_cost.mjs` reads the same figure.
//
// The source is EODHD, one vendor for the whole world, because the alternative is one
// scraper per venue and a price that only exists while that venue is open. Here the
// last close is served at any hour: a lookup at midnight in Paris answers for Tokyo,
// and nothing has to be timed against a session. The day's close is enough — these
// prices size an order, they do not fill one.
//
// One request per ISIN buys every listing of it at once: `/api/search/{ISIN}` answers
// with each venue, its currency and its last close, so a single call fills the euro
// line, the pence line and the dollar line together. That is why there is no symbol
// map here and no per-exchange download: the ISIN is the only key needed.
//
// The front calls `ensureFresh` on the instrument being looked at, so the repository
// pays for what somebody actually reads rather than for a catalogue of sixty-six
// thousand. `prices.mjs` run on its own sweeps the whole catalogue instead.
//
//   node prices.mjs                   balaie tout le catalogue
//   node prices.mjs --limit=200       s'arrête après deux cents instruments
//   node prices.mjs --isin=IE00B4L5Y983  un seul, pour voir
//   node prices.mjs --refresh         réinterroge même ce qui est frais
//   node prices.mjs --out=/tmp/p.json pour essayer sans écraser le vrai fichier
//   node prices.mjs --dry-run         dit ce que ça coûterait et ne demande rien
//   node prices.mjs --budget=50       ne dépense pas plus de cinquante appels
//   node prices.mjs --use-reserve     autorise à entamer la réserve non renouvelable
//
// The key lives in `.env` as EODHD_API_KEY, which `.gitignore` already keeps out of the
// repository.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    if (a === `--${name}`) return "";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return null;
};
const has = (name) => arg(name) !== null;

const HERE = fileURLToPath(new URL("./", import.meta.url));
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// `--out` is a thing the sweep is given; imported into the front there is no such flag
// and the real file is the only one meant.
const STORE_PATH = (IS_CLI && arg("out")) || path.join(HERE, "parsed_json/prices.json");

// ---------------------------------------------------------------- the key

// Missing on the front is not fatal: the page then serves whatever is already on disk
// and simply stops refreshing. Missing on a sweep is, since a sweep has nothing else
// to do.
function readKey() {
  if (process.env.EODHD_API_KEY) return process.env.EODHD_API_KEY.trim();
  const env = path.join(HERE, ".env");
  if (fs.existsSync(env)) {
    const m = fs.readFileSync(env, "utf8").match(/^\s*EODHD_API_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
const KEY = readKey();

// ---------------------------------------------------------------- the store

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
export const DAY = 86400000;

const UNIT =
  "prices[ISIN][devise] = { price, at, from } : la clôture du dernier jour de bourse, " +
  "dans la devise de cotation, pour convertir un nombre de parts en montant. Une même " +
  "ligne cotée sur plusieurs places dans la même devise garde sous `from` toutes ses " +
  "cotations ; `price` retient la place principale. Londres cote en pence, donc GBX et " +
  "GBP sont deux entrées, que `fx.mjs` sait distinguer. Ce n'est pas un prix temps " +
  "réel : il sert à dimensionner un ordre, pas à l'exécuter. `fetched` date la dernière " +
  "interrogation, y compris quand elle n'a rien trouvé, pour ne pas la refaire chaque jour.";

const store = fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) : {};
/** prices[ISIN][CCY] = { price, at, from } */
export const prices = (store.prices ||= {});
/** When each ISIN was last asked about, hit or miss. */
const fetched = (store.fetched ||= {});

// Rewriting the whole file on every lookup would cost more than the lookups do, so it
// lands on a timer and once more on the way out.
let dirty = false;
let timer = null;
function save() {
  if (!dirty) return;
  dirty = false;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source: "EODHD", unit: UNIT, fetched, prices },
      null,
      2
    )
  );
}
function scheduleSave() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    save();
  }, 2000);
  timer.unref?.();
}
process.on("exit", save);

/** True when this ISIN was asked about recently enough to be worth trusting. */
export function isFresh(isin, maxAge = DAY) {
  const at = Date.parse(fetched[String(isin || "").toUpperCase()] || 0);
  return Number.isFinite(at) && Date.now() - at < maxAge;
}

// ---------------------------------------------------------------- the vendor

const API = "https://eodhd.com/api";
let spent = 0;
let budget = Infinity;

async function get(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
        continue;
      }
      // Out of quota or outside the plan: worth saying once and out loud, since every
      // later call will fail the same way and the page would otherwise look merely slow.
      if (r.status === 402 || r.status === 403) {
        throw new Error(`HTTP ${r.status} — quota épuisé ou hors formule`);
      }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      if (/quota/.test(e.message)) throw e;
      if (i === tries - 1) return null;
      await new Promise((s) => setTimeout(s, 1000 * (i + 1)));
    }
  }
  return null;
}

// ---------------------------------------------------------------- one instrument

// Every venue the vendor knows for this ISIN, recorded under the currency each quotes
// in. The chosen figure is the primary listing where the vendor names one, otherwise
// the first it returns, which is its own order of relevance. The others stay under
// `from` so that a suspect price can be argued with rather than merely replaced.
function noteSearch(isin, rows) {
  for (const r of rows) {
    const ccy = String(r.Currency || "").trim().toUpperCase();
    const px = Number(r.previousClose);
    if (!ccy || !(px > 0)) continue;
    const leaf = ((prices[isin] ||= {})[ccy] ||= { price: null, at: null, from: {} });
    leaf.from[`${r.Exchange}:${r.Code}`] = {
      price: Number(px.toPrecision(8)),
      at: r.previousCloseDate || null,
      primary: !!r.isPrimary,
    };
    const best = Object.values(leaf.from).find((x) => x.primary) || Object.values(leaf.from)[0];
    leaf.price = best.price;
    leaf.at = best.at;
  }
}

const inflight = new Map();

/**
 * Make sure this ISIN has been priced within `maxAge`, asking the vendor if not.
 * Never throws at the caller: a page that cannot refresh still has to render.
 * Returns the per-currency map, which may be undefined if nothing is known.
 */
export async function ensureFresh(isin, maxAge = DAY) {
  const key = String(isin || "").trim().toUpperCase();
  if (!ISIN.test(key)) return undefined;
  if (isFresh(key, maxAge)) return prices[key];
  if (!KEY) return prices[key];
  // Two readers asking for the same instrument at once is one request, not two.
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    try {
      if (spent + 1 > budget) return prices[key];
      spent++;
      const rows = await get(`${API}/search/${encodeURIComponent(key)}?api_token=${KEY}&fmt=json&limit=30`);
      // A miss is dated too. Without that, an ISIN the vendor does not carry would be
      // asked about on every single page view.
      fetched[key] = new Date().toISOString();
      if (Array.isArray(rows)) noteSearch(key, rows.filter((r) => String(r.ISIN || "").toUpperCase() === key));
      scheduleSave();
      return prices[key];
    } catch (e) {
      console.error(`prix ${key} : ${e.message}`);
      return prices[key];
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

// ---------------------------------------------------------------- the sweep

async function main() {
  if (!KEY) {
    console.error("Pas de clé : mettre EODHD_API_KEY dans .env ou dans l'environnement.");
    process.exit(1);
  }
  const { catalogueRows } = await import("./catalogues.mjs");
  const one = arg("isin");
  const wanted = one
    ? [one.trim().toUpperCase()]
    : [
        ...new Set(
          catalogueRows()
            .map((r) => String(r.isin || "").trim().toUpperCase())
            .filter((i) => ISIN.test(i))
        ),
      ];
  const todo = has("refresh") ? wanted : wanted.filter((i) => !isFresh(i));
  console.error(`${wanted.length} ISIN au catalogue, ${todo.length} à interroger.`);

  const who = await get(`${API}/user?api_token=${KEY}&fmt=json`);
  if (who) {
    const used = Number(who.apiRequests) || 0;
    const daily = Math.max(0, (Number(who.dailyRateLimit) || 0) - used);
    const reserve = Number(who.extraLimit) || 0;
    // Two allowances that do not behave alike, and the vendor prints them side by side
    // as though they did. The daily one refills; the reserve drains and never comes
    // back, so spending it has to be asked for.
    budget = daily + (has("use-reserve") ? reserve : 0);
    console.error(
      `Formule « ${who.subscriptionType} » : ${daily} appels restants aujourd'hui ` +
        `(${used} sur ${who.dailyRateLimit} déjà faits), plus une réserve non renouvelable de ${reserve}` +
        (has("use-reserve") ? ", que --use-reserve autorise à entamer." : ", gardée intacte sans --use-reserve.")
    );
  }
  if (arg("budget")) budget = Math.min(budget, Number(arg("budget")));
  if (arg("limit")) todo.length = Math.min(todo.length, Number(arg("limit")));

  console.error(`Un appel par ISIN, soit ${todo.length} au total.`);
  if (todo.length > budget) {
    console.error(
      `\nLe quota n'y suffit pas : ${budget} appels disponibles pour ${todo.length} nécessaires.\n` +
        `La formule « EOD Historical Data — All World » (19,99 $/mois) porte la limite à 100 000 par jour.\n` +
        `Sinon le front se sert tout seul, un instrument à la fois, à mesure qu'on les consulte.`
    );
  }
  if (has("dry-run")) return;

  let done = 0;
  let hit = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length && spent < budget) {
      const isin = queue.shift();
      const got = await ensureFresh(isin, has("refresh") ? 0 : DAY);
      done++;
      if (got && Object.keys(got).length) hit++;
      if (done % 200 === 0) console.error(`  ${done}/${todo.length}, ${hit} cotés`);
    }
  };
  // Six at a time: enough to keep the link busy, far under what the vendor allows.
  await Promise.all(Array.from({ length: 6 }, worker));
  save();

  const priced = Object.keys(prices).length;
  console.error(
    `\n${hit} cotés sur ${done} interrogés. ${priced} ISIN ont un prix en tout. ` +
      `${spent} appels dépensés. Écrit dans ${STORE_PATH}.`
  );
}

if (IS_CLI) {
  main().catch((e) => {
    save();
    console.error(`\nArrêt : ${e.message}`);
    process.exit(1);
  });
}
