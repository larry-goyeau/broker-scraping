// The URL that gives the spread for a listing, and the spread itself where it can be
// read. One adapter per data source, keyed on the triple (place, ISIN, devise) that
// `venues.mjs` resolves.
//
// Reporting one venue's number for another venue's book is the mistake this script
// exists to prevent, so a listing whose venue has no free source is left empty with
// a reason rather than filled from a neighbour.
//
// It describes exchanges, not brokers, so one file serves every broker parser:
// `parsed_json/spread.json`, holding what one round trip costs on each order book and
// nothing else. Everything derivable is derived instead of stored — the venue's name and
// hours from `venues.mjs`, the page behind the figure from `spreadUrl` — which leaves the
// file readable at a glance.
//
// Every European place is read at the touch of its own book, and the American one at the
// effective spread its brokers report, which is the same grandeur by construction; see
// `CROSSED`. Publishing two grandeurs in one field is the other mistake this script
// exists to prevent, and it took reading Xetra's book to notice it had crept back in.
//
// A touch also depends on the hour it was read, so each reading is divided by its own half
// hour's multiple before the median is taken, and what the file publishes is the cost at
// the average hour of the session. The multiples come from Deutsche Börse's intraday XLM
// and are published beside the figure, so an hour can be put back.
//
//   node spread.mjs                              -- listings from trading212-parsed.json
//   node spread.mjs --rows=parsed_json/xtb-parsed.json
//   node spread.mjs --rows=a.json,b.json         -- several brokers at once
//   node spread.mjs --refresh                    -- refetch instead of trusting the file
//   node spread.mjs --out=other.json             -- write somewhere else
//   node spread.mjs --min-gap=90                 -- minutes before a listing is resampled
//   node spread.mjs --jobs=8                     -- listings in flight at once
//   node spread.mjs --only=lse,six               -- one or more sources, the others left alone
//
// Run it a few times across a session and the published figure becomes a median of
// readings rather than one snapshot, which is what makes it worth costing a trade
// with. Out of hours it adds nothing and leaves the stored average alone.

import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { listingKey, sessionState, spreadUrl, VENUES } from "./venues.mjs";
import { monthlyXlm } from "./xlm-monthly.mjs";
import { monthlyEffectiveSpread } from "./rule605-monthly.mjs";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (m) return m[1];
  }
  return "";
};
const REFRESH = process.argv.includes("--refresh");
const STORE_PATH = arg("out") || "parsed_json/spread.json";
const ONLY = (arg("only") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ------------------------------------------------------------------- the listings

const rowFiles = (arg("rows") || "parsed_json/trading212-parsed.json").split(",").map((s) => s.trim());

const listings = new Map();

// Every row that cannot be priced, attributed to the one thing that blocks it, so the
// size of each hole is visible. A place with no free source blocks a row whatever else
// it says, which is why the place is tested first; only where the exchange could have
// answered does a missing currency become the reason.
//
// Rows are counted as distinct keys, like listings, so the same fund appearing in forty
// catalogues counts once. Attributing a row to no reason at all is what went wrong
// before: rows that named neither a sourceable place nor a currency fell out of the
// accounting entirely, and the report said 160 American listings against a true
// exposure of some nine thousand.
const gaps = {};
const gapKeys = new Map();
function noteGap(why, key, example) {
  const gap = (gaps[why] ||= { cotations: 0, exemples: [] });
  const keys = gapKeys.get(why) || gapKeys.set(why, new Set()).get(why);
  if (keys.has(key)) return;
  keys.add(key);
  gap.cotations = keys.size;
  if (gap.exemples.length < 3) gap.exemples.push(example);
}

for (const file of rowFiles) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  const broker = file.replace(/.*\/|-parsed\.json/g, "");
  for (const row of rows) {
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const { key, venue, assumed, unsourced } = listingKey(row);
    const ticker = String(row.ticker || row.symbol || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();

    if (!venue?.source) {
      const named = row.exchange || row.venue || row.exchangeName || "";
      const why = unsourced
        ? `${unsourced.name} : ${unsourced.why}`
        : `place non reconnue : "${named}"`;
      // Counted under the place's canonical name rather than the spelling the broker
      // used, or one American line would count once as "AMEX" and again as "ARCX".
      noteGap(why, `${unsourced?.name || named}|${isin}|${currency || "?"}`, `${ticker || isin} ${currency || "devise non dite"}`);
      continue;
    }
    // The currency is half of a book's identity: the same fund on the same exchange in
    // two currencies is two order books, 1.09 bp and 0.80 bp on the LSE for one of
    // them, so a row that omits it cannot be priced from either.
    if (!currency) {
      noteGap("devise absente du catalogue du broker", key, `${ticker || isin} chez ${broker}`);
      continue;
    }
    if (listings.has(key)) {
      listings.get(key).brokers.add(broker);
      continue;
    }
    listings.set(key, {
      key,
      isin,
      currency,
      ticker,
      name: row.name || "",
      mic: venue.mic,
      path: venue.path || venue.mic,
      exchange: venue.name,
      source: venue.source,
      venue,
      venueAssumed: assumed,
      brokers: new Set([broker]),
    });
  }
}

console.error(
  `${listings.size} cotations sourçables (place + ISIN + devise) dans ${rowFiles.length} fichier(s), ` +
    `${Object.values(gaps).reduce((n, g) => n + g.cotations, 0)} hors de portée`
);

// ---------------------------------------------------------------------- adapters

// The published answer: fund, place, devise, cost of one round trip. A number and
// nothing beside it, because everything else about a listing is either derivable or
// belongs in the log. A listing with no trustworthy figure is absent rather than null:
// absence cannot be mistaken for a free trade.
// The page the figure came from travels with it, in the same leaf, because a spread
// moves all day and a reader who wants to check one needs the live book. Stored rather
// than derived so that one lookup answers both questions and they cannot drift apart.
// Two passes at once cost more than twice as much: they open twice the tabs, which is how
// Boerse Frankfurt came to answer 503 to everything, and they both hold the whole file in
// memory, so the last to write silently undoes the other's readings. Both were observed.
// One writer at a time, then, enforced against the process table rather than against a
// promise to be careful.
const LOCK_PATH = `${STORE_PATH}.lock`;
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
if (fs.existsSync(LOCK_PATH) && !process.argv.includes("--force")) {
  const held = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  if (held.pid !== process.pid && alive(held.pid)) {
    console.error(
      `une passe écrit déjà dans ${STORE_PATH} (pid ${held.pid}, depuis ${held.since}).\n` +
        `  L'attendre, ou l'arrêter : kill ${held.pid}\n` +
        `  --force pour passer outre, au risque de perdre les relevés de l'une des deux.`
    );
    process.exit(1);
  }
}
fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
// Released on the way out however that happens, including the interrupt that stopping a
// long pass always takes.
const unlock = () => {
  try {
    if (JSON.parse(fs.readFileSync(LOCK_PATH, "utf8")).pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch {}
};
process.on("exit", unlock);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));

const store = fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) : {};
const spreads = (store.spreads ||= {});
const leafOf = (l) => spreads[l.isin]?.[l.mic]?.[l.currency] ?? null;
const bpOf = (l) => leafOf(l)?.bp ?? null;
// Two units, and the leaf says which. Europe publishes a percentage — XLM, or a touch
// divided by its own midpoint — so the cost scales with the amount and `bp` is the
// natural field. An American book is quoted in whole cents and its measure, the
// effective spread of Rule 605, comes in dollars per share; dividing it by a price to
// force it into basis points would mean inventing a price the source never gave, and
// would make the same book read differently after a split. So `perShare` is stored as
// published, and it is the cost scripts that fold each unit into its own coefficient.
const publish = (l, value) => {
  if (value == null) {
    delete spreads[l.isin]?.[l.mic]?.[l.currency];
    if (spreads[l.isin]?.[l.mic] && !Object.keys(spreads[l.isin][l.mic]).length) delete spreads[l.isin][l.mic];
    if (spreads[l.isin] && !Object.keys(spreads[l.isin]).length) delete spreads[l.isin];
    return;
  }
  (((spreads[l.isin] ||= {})[l.mic] ||= {})[l.currency] = { ...value, url: spreadUrl(l) });
};

// One round trip, in whichever unit the venue publishes, for a log line or a table.
const shown = (l) => {
  const leaf = leafOf(l);
  if (leaf?.bp != null) return `${leaf.bp} bp`;
  if (leaf?.perShare != null) return `${leaf.perShare} $/part`;
  return "—";
};

// What the script has to remember between runs to keep that number honest, kept apart
// from it: the readings the median is taken over, when the last one landed, and whether
// the exchange has already said it has no figure for this fund. Same file, so the
// evidence can never drift away from the conclusion it supports.
//
// Readings are kept as the exchange gave them, unconverted, so that changing the
// factors below re-derives the answer from the evidence instead of compounding on it.
const state = (store.state ||= {});
const stateKey = (l) => `${l.isin}|${l.mic}|${l.currency}`;

// The session profiles, keyed by fund and currency rather than by listing, because they
// come from the fund's own trading pattern and one copy serves its every European line.
// Kept from the previous file so that a run over a handful of listings does not drop the
// profiles of the rest.
const shapes = (store.session?.shapes && { ...store.session.shapes }) || {};

// ---------------------------------------------------------------- the one grandeur
//
// The fraction of a source's published figure that a retail order actually crosses, so
// that every venue lands on the same grandeur: the cost of one round trip at the size
// a private investor trades.
//
// Every source now publishes that grandeur directly, hence a table of ones. Four places
// are read at the touch, which is what an order crosses, and the American reports give
// an effective spread, which is twice the distance from the fill to the midpoint, so one
// leg pays half of it and a round trip pays the whole.
//
// It was not always a table of ones. Xetra used to come from the monthly XLM workbook,
// halved, and the halving was the weak point: it came from measured round trips of our
// own rather than from published data, and it stood in for a relation that is not
// constant. The workbook prices a 100 000 € order, a retail order sits inside the touch,
// and how far apart those two are depends on the depth of the book — reading 40 listings
// across the range put the touch between 0.47 and 1.00 of XLM at the quartiles, with
// EUNL, tick-bound at half a cent, down at 0.19. Measuring the touch removes both the
// private anchor and the extrapolation, at the cost of a page per listing.
//
// A source that ever needs a conversion again puts it here, where the whole table can
// be read at once. The per-share path below never multiplies by it.
const CROSSED = { xetra: 1, lse: 1, six: 1, euronext: 1, us605: 1 };

const CONVENTION =
  "coût d'un aller-retour, taille d'un particulier, à la touche, ramené à la moyenne de séance";
// The generation that measured the touch but published it at whatever hour it was read.
const AT_READING_HOUR = "coût d'un aller-retour, taille d'un particulier, mesuré à la touche";
// The generation that read Xetra from the monthly workbook and halved it.
const XLM_HALVED = "coût d'un aller-retour, taille d'un particulier, avec la page du carnet";
// The generation before that, which stored a bare number with no page beside it.
const NUMBERS_ONLY = "coût d'un aller-retour, taille d'un particulier";

// Older files are brought forward rather than discarded, because discarding would leave
// the snapshot venues blank until the next open session. Three generations exist: one
// that published each source's raw figure, which put two grandeurs in one field and made
// an XLM line read twice the cost of the same trade on a touch line; one that fixed that
// but kept the leaf a number with no page beside it; and one that carried Xetra as half
// its XLM.
//
// That last one is the only case where a stored figure has to go rather than be
// converted. Half an XLM is not a touch and no arithmetic turns it into one — the two
// differ by a factor that depends on the fund — so those leaves are dropped and the next
// pass reads the book instead. Only Xetra's are affected, and only until it next opens.
if (Object.keys(spreads).length && store.convention !== CONVENTION) {
  // Only the generation that halved an XLM has Xetra values that cannot be salvaged,
  // and only its Xetra values: dropping them on any convention change would throw away
  // touches already measured, which is the opposite of the intent.
  const halved = store.convention === XLM_HALVED;
  const convert = store.convention !== NUMBERS_ONLY && store.convention !== AT_READING_HOUR && !halved;
  let moved = 0;
  let dropped = 0;
  for (const [isin, byMic] of Object.entries(spreads))
    for (const [mic, byCurrency] of Object.entries(byMic)) {
      const venue = VENUES.find((v) => v.mic === mic);
      const g = CROSSED[venue?.source];
      for (const [currency, leaf] of Object.entries(byCurrency)) {
        const was = typeof leaf === "number" ? leaf : leaf?.bp;
        if (!(was > 0) || (convert && g == null)) continue;
        if (halved && venue?.source === "xetra") {
          delete byCurrency[currency];
          dropped++;
          continue;
        }
        byCurrency[currency] = {
          bp: Number((convert ? was * g : was).toFixed(2)),
          // The London page is keyed by ticker, which a stored line does not carry, so
          // its link arrives with the next pass rather than being guessed here.
          url: spreadUrl({ isin, currency, venue }),
        };
        moved++;
      }
    }
  if (moved || dropped) {
    console.error(
      `convention : ${moved} valeurs reprises${convert ? " et converties" : ""}` +
        `${dropped ? `, ${dropped} valeurs Xetra abandonnées, à relire au carnet` : ""}\n`
    );
  }
}

// Xetra's whole table, fetched once per month rather than per listing.
const { xlm, month: xlmMonth, slots: SLOTS = [] } = await monthlyXlm({ refresh: REFRESH });

// ------------------------------------------------------------------ the hour it was read
//
// A touch read at noon and the same touch read at half past three are not the same
// number, and until now the file published whichever hour the pass happened to run. The
// intraday XLM in the same monthly workbook says how much that matters: for the median
// fund the dearest half hour costs 1.25 times the cheapest, for EUNL 1.94, the open being
// the worst and lunchtime the best. Our passes at 11h, 13h and 15h all land on cheap
// hours, so an unnormalised median reads a few per cent below the day.
//
// So a reading is divided by its own half hour's multiple, which puts every figure on one
// footing: the cost of a round trip at the average hour of the session. The shape is
// published beside the value, so a front end that knows when its user trades can put the
// hour back.
//
// One shape serves the four European places. It comes from Xetra alone, but what makes a
// tracker widen at half past three is New York opening rather than anything German, and
// London, Zurich and Euronext keep the same 9 to 17:30 as Frankfurt to the minute in
// Berlin time. The alternative was to leave three quarters of the file unnormalised.
const shapeOf = (l) =>
  xlm[`${l.isin}|${l.currency}`]?.shape ??
  // A London line in sterling has no Xetra line of its own, and the shape belongs to the
  // fund's underlying rather than to the currency it is quoted in.
  xlm[Object.keys(xlm).find((k) => k.startsWith(`${l.isin}|`))]?.shape ??
  null;

// Which half hour a moment falls in, by the workbook's own labels, in Berlin time — the
// zone all four places keep their session in. Null outside the session, which a snapshot
// venue should never be, and which therefore goes unnormalised rather than guessed.
const SLOT_STARTS = SLOTS.map((s) => {
  const [h, m] = s.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
});
const slotOf = (when = new Date()) => {
  if (!SLOT_STARTS.length) return null;
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const minutes = (Number(at.hour) % 24) * 60 + Number(at.minute);
  let found = null;
  for (const [i, start] of SLOT_STARTS.entries()) if (minutes >= start) found = i;
  // Past the last bucket's end is out of session, not in the last bucket.
  return found != null && minutes < SLOT_STARTS.at(-1) + 30 ? found : null;
};
// The American one likewise: five firms' monthly reports, keyed by symbol.
const us605 = await monthlyEffectiveSpread({ refresh: REFRESH });

// A crossed book means the feed is confused, not that the trade is profitable, so it
// yields nothing rather than a negative cost.
const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  return ((ask - bid) / ((ask + bid) / 2)) * 1e4;
};

// A single snapshot is a poor estimate of what a trade will cost: the same fund was
// measured moving by a factor of 1.7 within a session, and another by 3. So readings
// accumulate and the published figure is their median, which is what Deutsche Boerse
// does to build XLM. The median rather than the mean because one wide print during a
// thin minute should not move the answer.
//
// Keeping the history is also what lets the figure survive the close: an evening run
// adds nothing and leaves yesterday's average standing.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const READING_DAYS = 90;
const READING_KEEP = 24;
const MIN_GAP_MIN = Number(arg("min-gap") || 30);

// Two of the five sources want a browser, for opposite reasons: Euronext decrypts its
// quotes in the page, one listing at a time, so it sets the pace of a run; Xetra wants one
// tab for the whole pass, to hold the origin its socket and its token service check, and
// then answers thousands of instruments through it in seconds. One connection, and one tab
// per worker, opened only if that worker ever meets a listing that needs one.
const CONCURRENCY = Math.max(1, Number(arg("jobs") || 4));
const pages = [];
// Memoising the promise rather than the connection is what makes this safe to call
// from several workers at once: the assignment happens before anyone awaits, so they
// all share one connection. Storing the resolved browser instead let four workers
// each open their own, and the three nobody closed kept the process alive for ever.
let connecting = null;
const connect = () =>
  (connecting ||= puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: null,
    protocolTimeout: 240000,
  }));

async function tab() {
  const p = await (await connect()).newPage();
  // Only one tab can be in front, and Chrome throttles the rest: with four working at
  // once, twelve of fifty Xetra pages ran out of time purely from being backgrounded.
  // Declaring the lifecycle state active exempts them.
  await p
    .createCDPSession()
    .then((s) => s.send("Page.setWebLifecycleState", { state: "active" }))
    .catch(() => {});
  pages.push(p);
  return p;
}

// ------------------------------------------------------- Xetra, in bulk over the socket
//
// The socket wants a token, good for seven minutes, and the service that mints it only
// answers the application: the request carries an `X-Security` digest the bundle computes,
// and without it the answer is an empty object — asked from Node, and asked with a plain
// fetch from inside the page, both times.
//
// Reproducing that digest would mean reading their minified bundle and re-reading it after
// every deployment. Reading their answer instead costs nothing and cannot go stale, so the
// page is made to ask — which it only does when it holds no valid token, hence the emptied
// storage — and the response body is taken off the wire.
//
// The socket itself is opened from inside the page too, where the origin and the handshake
// are the browser's business rather than ours.
const XETRA_WS = "wss://api.live.deutsche-boerse.com/v1/mds/ws";
const XETRA_TOKEN = "https://api.live.deutsche-boerse.com/v1/mdstokenservice/token";
const XETRA_ORIGIN = "https://live.deutsche-boerse.com";
// One instrument to land on for the origin; any product page will do.
const XETRA_ANY = "https://www.boerse-frankfurt.de/etf/IE00B4L5Y983";
// Batches, because one message carrying every instrument would be a single point of
// failure and a queue nothing can be read out of until it ends. Eight hundred answered in
// four seconds in testing, so five hundred leaves room without costing round trips.
const XETRA_BATCH = 500;

const xetraQuotes = new Map();
let xetraTrouble = null;

async function xetraToken(p, cdp) {
  let token = null;
  const onResponse = async ({ requestId, response }) => {
    if (token || !response.url.startsWith(XETRA_TOKEN) || response.status !== 200) return;
    try {
      const { body } = await cdp.send("Network.getResponseBody", { requestId });
      token = (String(body).match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/) || [])[0] || null;
    } catch {
      // The body can be gone by the time it is asked for; another load will bring another.
    }
  };
  cdp.on("Network.responseReceived", onResponse);
  try {
    for (let attempt = 0; attempt < 3 && !token; attempt++) {
      await cdp
        .send("Storage.clearDataForOrigin", { origin: XETRA_ORIGIN, storageTypes: "all" })
        .catch(() => {});
      await p.goto(XETRA_ANY, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      for (let i = 0; i < 24 && !token; i++) await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    cdp.off("Network.responseReceived", onResponse);
  }
  return token;
}

// Asks for a batch and resolves when the server says it is done. Everything happens in
// the page: `WebSocket` there carries the origin the server expects.
const xetraAsk = (p, token, queries) =>
  p.evaluate(
    (ws, token, queries, budget) =>
      new Promise((resolve) => {
        const socket = new WebSocket(ws);
        const quotes = [];
        socket.onopen = () => {
          socket.send(JSON.stringify({ subscribeAuthentication: { token }, requestId: "auth" }));
          socket.send(JSON.stringify({ heartbeat: { period: 30 }, requestId: "beat" }));
          socket.send(
            JSON.stringify({ listMarketstates: { marketstateQueries: queries }, requestId: "bulk" })
          );
        };
        socket.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.requestId !== "bulk") return;
          const d = msg.dataMarketstate;
          if (d) {
            quotes.push({
              id: d.marketstateId,
              bid: d.bid?.value ?? null,
              ask: d.ask?.value ?? null,
              currency: d.currency ?? null,
            });
          }
          if (msg.isComplete) {
            socket.close();
            resolve({ quotes, error: null });
          }
        };
        socket.onerror = () => resolve({ quotes, error: "le socket a rendu une erreur" });
        socket.onclose = () => resolve({ quotes, error: "le socket s'est fermé avant la fin" });
        setTimeout(() => {
          socket.close();
          resolve({ quotes, error: `pas de fin de réponse en ${budget / 1000} s` });
        }, budget);
      }),
    XETRA_WS,
    token,
    queries,
    60000
  );

async function xetraBulk(lines, ownTab) {
  const p = await ownTab();
  const cdp = await p.createCDPSession();
  await cdp.send("Network.enable");
  let fresh = await xetraToken(p, cdp);
  if (!fresh) {
    xetraTrouble = "le service de jeton de Boerse Frankfurt n'a rien rendu";
    console.error(`    ${xetraTrouble}\n`);
    return;
  }
  // The token dies after seven minutes; a batch takes seconds, so it is renewed between
  // batches rather than refreshed mid-flight.
  let born = Date.now();

  const batches = [];
  for (let i = 0; i < lines.length; i += XETRA_BATCH) batches.push(lines.slice(i, i + XETRA_BATCH));
  let answered = 0;
  for (const [i, batch] of batches.entries()) {
    if (Date.now() - born > 5 * 60000) {
      fresh = (await xetraToken(p, cdp)) || fresh;
      born = Date.now();
    }
    const queries = batch.map((l) => `DELAYED[${l.isin},${l.currency}@ETR>STX]`);
    const { quotes, error } = await xetraAsk(p, fresh, queries);
    for (const q of quotes) {
      // "IE00B4L5Y983,EUR@ETR" — the line asked for, echoed back, which is what makes one
      // message for hundreds of instruments safe to unpick.
      const [isin, rest] = String(q.id).split(",");
      const currency = (rest || "").split("@")[0];
      if (isin && currency) xetraQuotes.set(`${isin}|${currency}`, { ...q, currency: q.currency || currency });
    }
    answered += quotes.length;
    if (error) xetraTrouble = error;
    console.error(
      `    Xetra, lot ${i + 1}/${batches.length} : ${quotes.length}/${batch.length} cotations` +
        `${error ? ` — ${error}` : ""}`
    );
  }
  console.error(`    Xetra : ${answered} cotations sur ${lines.length} demandées\n`);
}

const adapters = {
  // Xetra's own book, asked for over the socket the page itself uses. Reading it in the
  // DOM worked and was hopeless at this size: a page load and a wait for the quote to
  // stream in ran at four listings a minute, so a first pass over three thousand of them
  // needed a working day, and three overlapping passes trying to catch up had Boerse
  // Frankfurt answering 503 to everything. The same socket takes a whole array of
  // instruments in one message and answers two hundred a second, which turns the pass
  // from hours into seconds and asks the exchange for a fraction of what the pages cost
  // it.
  //
  // Every listing is asked for before the loop starts, in `prefetch`, and the per-listing
  // call below is a lookup. Quotes come fifteen minutes delayed, as they do in the page —
  // that is what a book looked like a quarter of an hour ago, and the figure published
  // here is a median over many readings.
  //
  // Asking `@ETR` names the Xetra book itself, which is better than the page could do:
  // there the Frankfurt floor and Xetra sit on two tabs and the wrong one being in front
  // would widen every German figure in the file, so the tab label had to be read back.
  //
  // The monthly workbook stays, for the one thing neither page nor socket says plainly:
  // which currency lines the fund actually has on Xetra. Ask for a line that does not
  // exist and the answer is a quote from the line that does, so without that guard a
  // broker's imaginary dollar line would be published carrying the euro book's spread.
  xetra: {
    measure: "touche du carnet, différé de 15 min",
    async prefetch(lines, ownTab) {
      const wanted = lines.filter((l) => xlm[`${l.isin}|${l.currency}`]);
      if (!wanted.length) return;
      await xetraBulk(wanted, ownTab);
    },
    async fetch(l) {
      const line = xlm[`${l.isin}|${l.currency}`];
      if (!line) {
        // The fund can be on Xetra without being on this line of it: another currency is
        // another order book, and borrowing its figure is the error this file prevents.
        const elsewhere = Object.keys(xlm)
          .filter((k) => k.startsWith(`${l.isin}|`))
          .map((k) => k.split("|")[1]);
        return {
          spreadBp: null,
          settled: true,
          note: elsewhere.length
            ? `coté sur Xetra en ${elsewhere.join(" et ")}, pas en ${l.currency}`
            : "absent des statistiques Xetra",
        };
      }

      const quote = xetraQuotes.get(`${l.isin}|${l.currency}`);
      if (!quote) return { spreadBp: null, note: xetraTrouble || "pas de réponse du socket Xetra" };
      const bp = bpFrom(quote.bid, quote.ask);
      // No two-sided quote is a book with one side or none — before the open, or a line
      // nobody is making a price in. Neither is a cost, and both come back tomorrow.
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, tradingCurrency: quote.currency };
    },
  },

  // The American reports say what a retail order actually paid rather than what the book
  // was showing, price improvement included, which on these funds applied to 95% of the
  // shares filled. Keyed by symbol, in dollars per share, and averaged over a month, so
  // like Xetra it costs no request per listing and survives the close.
  //
  // The size bucket the figure comes from is 100 to 499 shares — the smallest the legacy
  // format has. Orders below a hundred shares became reportable only with the 2024
  // amendments, which this host has yet to publish, so a twenty-share order is outside
  // the sample rather than inside it at a different price.
  us605: {
    measure: "spread effectif 605, aller-retour, moyenne mensuelle",
    local: true,
    unit: "perShare",
    async fetch(l) {
      if (!l.ticker) return { perShare: null, note: "symbole manquant, clé de la table 605" };
      // The table is keyed by symbol, and a symbol is only unique within its own market.
      // A European line a broker happened to label "NASDAQ" would otherwise be answered
      // with the figures of whatever American security shares its ticker, which is the
      // one error this venue can make silently. An American listing carries an American
      // ISIN, so that is the guard.
      if (!l.isin.startsWith("US")) {
        return {
          perShare: null,
          settled: true,
          note: `ISIN ${l.isin.slice(0, 2)} sur une place américaine : ligne non américaine, symbole non fiable`,
        };
      }
      const line = us605.symbols[l.ticker.toUpperCase()];
      if (!line) {
        return {
          perShare: null,
          settled: true,
          note: `absent des rapports 605 de ${us605.month}`,
        };
      }
      return { perShare: line.perShare };
    },
  },

  // The LSE answers on a plain unauthenticated endpoint keyed by TIDM, and the TIDM is
  // per currency line, which is exactly the granularity a spread needs.
  lse: {
    dataUrl: (l) => `https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/${l.ticker}`,
    measure: "touche du carnet, différé 15 min",
    async fetch(l) {
      if (!l.ticker) return { spreadBp: null, note: "ticker manquant, clé de recherche du LSE" };
      const res = await fetch(adapters.lse.dataUrl(l), {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { spreadBp: null, note: `LSE a répondu ${res.status}` };
      const j = await res.json();
      // A ticker that resolves to another fund would silently poison the row, so the
      // ISIN the exchange returns has to agree with the one we asked about.
      if (j.isin && j.isin.toUpperCase() !== l.isin) {
        return { spreadBp: null, note: `le ticker ${l.ticker} pointe sur ${j.isin}` };
      }
      return {
        spreadBp: bpFrom(Number(j.bid), Number(j.offer)),
        bid: Number(j.bid) || null,
        ask: Number(j.offer) || null,
        tradingCurrency: j.currency || null,
      };
    },
  },

  // SIX returns one row per trading currency for a given ISIN, so the currency picks
  // the line without needing a symbol at all.
  six: {
    dataUrl: (l) =>
      `https://www.six-group.com/fqs/snap.json?select=ISIN,ValorSymbol,BidPrice,AskPrice,TradingCurrency,ValorId&where=ISIN=${l.isin}`,
    measure: "touche du carnet, différé 15 min",
    async fetch(l) {
      const res = await fetch(adapters.six.dataUrl(l), {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { spreadBp: null, note: `SIX a répondu ${res.status}` };
      const j = await res.json();
      const cols = j.colNames || [];
      const rows = (j.rowData || []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
      const line = rows.find((r) => String(r.TradingCurrency).toUpperCase() === l.currency);
      if (!line) {
        return {
          spreadBp: null,
          note: rows.length
            ? `pas de ligne en ${l.currency} (SIX propose ${rows.map((r) => r.TradingCurrency).join(", ")})`
            : "ISIN absent de SIX",
        };
      }
      return {
        spreadBp: bpFrom(Number(line.BidPrice), Number(line.AskPrice)),
        bid: Number(line.BidPrice) || null,
        ask: Number(line.AskPrice) || null,
        tradingCurrency: line.TradingCurrency,
      };
    },
  },

  // Euronext encrypts its quote endpoint and decrypts it in the page, so the rendered
  // book is the accessible form. One adapter covers Paris, Amsterdam, Brussels, Lisbon
  // and Milan, which share the platform.
  euronext: {
    measure: "touche du carnet, clôture ou différé",
    async fetch(l, ownTab) {
      const p = await ownTab();
      try {
        await p.goto(spreadUrl(l), { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 3000));
      } catch {
        return { spreadBp: null, note: "page Euronext non chargée" };
      }
      const found = await p.evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\u00a0/g, " ");
        const grab = (label) => {
          const m = text.match(new RegExp(`${label}\\s*([\\d.,]+)`, "i"));
          return m?.[1] ? Number(m[1].replace(/,/g, "")) : null;
        };
        return { bid: grab("Best Bid"), ask: grab("Best Ask"), notFound: /instrument not found/i.test(text) };
      });
      if (found.notFound) return { spreadBp: null, note: `non coté sur ${l.mic}` };
      return { spreadBp: bpFrom(found.bid, found.ask), bid: found.bid, ask: found.ask };
    },
  },
};

// ------------------------------------------------------------------------- resolve

// Worth visiting when there is no figure yet, or when the last reading is old enough
// that another one would add something. Xetra publishes an average already, so once
// read it needs no resampling.
function worthVisiting(l) {
  if (!l.source) return false;
  // A place can be off limits for reasons outside this file — a page that has started
  // answering 503, say — and then the others should still be readable without it.
  if (ONLY.length && !ONLY.includes(l.source)) return false;
  if (REFRESH) return true;
  // A table already in hand costs nothing to consult, so it is consulted every run.
  // That is how a new month's figures reach the file without anyone asking.
  if (adapters[l.source].local) return true;
  const seen = state[stateKey(l)];
  if (!seen) return true;
  // A fund the exchange said it does not measure stays answered; anything else that
  // came back empty is worth another attempt.
  if (seen.settled) return false;
  return Date.now() - (Date.parse(seen.at) || 0) > MIN_GAP_MIN * 60000;
}

const todo = [...listings.values()].filter(worthVisiting);
console.error(`${todo.length} à visiter, ${listings.size - todo.length} à jour\n`);

// The profiles come from a table already in hand, so every listing that has a value gets
// one, whether or not this run visits it. Nothing is pruned: a run given one broker's
// rows knows nothing about the funds only the other broker sells.
for (const l of listings.values()) {
  const shape = leafOf(l) && shapeOf(l);
  if (shape) shapes[`${l.isin}|${l.currency}`] = shape;
}

// Rewriting thousands of entries after every single listing costs more than the lookups
// do, so it lands in batches and once more at the end.
let done = 0;
const notes = new Map();
const flush = () => {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        unit: "spreads[ISIN][place][devise] = { bp, url } ou { perShare, url } : le coût d'un achat suivi d'une revente immédiate, pour un ordre de particulier. bp -> montant * bp / 10000 (places européennes, mesure en pourcentage). perShare -> parts * perShare (places américaines, spread effectif des rapports 605, en dollars par part, amélioration de prix comprise). url mène à la source. Le double pour le cas pessimiste (ordre internalisé, ou fonds peu liquide).",
        convention: CONVENTION,
        // The value above is the cost at the average hour of the session. Multiply it by
        // `session.shapes[ISIN|devise][i]` to get the cost during `session.slots[i]`,
        // which for a fund tracking American shares is worth doing: the last hours of the
        // German session overlap New York's open and cost half again as much.
        session: {
          slots: SLOTS,
          note: "multiple du coût moyen de la séance, par tranche de trente minutes, heure de Berlin. Source : iXLM mensuel de Deutsche Börse, mesuré sur Xetra et appliqué aux quatre places européennes, qui partagent la même séance. null quand le mois n'a pas assez de transactions dans la tranche.",
          shapes,
        },
        spreads,
        state,
      },
      null,
      2
    )
  );
};

async function visit(l, ownTab) {
  const adapter = adapters[l.source];
  console.error(`[${++done}/${todo.length}] ${l.ticker || l.isin} ${l.currency} @ ${l.exchange}`);

  const seen = state[stateKey(l)] || {};
  // Xetra's XLM is a monthly average and can be read any time; a touch snapshot only
  // means something while the book is open, so outside the session there is nothing
  // to gain by asking and the stored average simply stands.
  const snapshot = adapter.measure.startsWith("touche");
  const session = sessionState(l.venue);

  let measured;
  if (snapshot && session.open === false) {
    measured = { spreadBp: null, note: `marché fermé (${session.why}), non interrogé` };
  } else {
    try {
      measured = await adapter.fetch(l, ownTab);
    } catch (e) {
      measured = { spreadBp: null, note: `échec : ${String(e.message || e).slice(0, 80)}` };
    }
  }
  // A currency the exchange disagrees with means the line measured is not the line
  // the broker sells. Pence and pounds are the same book quoted two ways, so only a
  // real disagreement counts.
  const said = measured.tradingCurrency?.toUpperCase();
  const sterling = new Set(["GBP", "GBX"]);
  const mismatch =
    said && said !== l.currency && !(sterling.has(said) && sterling.has(l.currency)) ? said : null;

  // Per-share sources are rounded finer because their whole range lives in thousandths
  // of a dollar: two decimals would round IAU's 0.0018 to nothing.
  const byShare = adapter.unit === "perShare";
  const raw = byShare ? measured.perShare : measured.spreadBp;
  const reading = raw == null ? null : Number(raw.toFixed(byShare ? 5 : 2));
  // A zero spread is an auction or a locked book, not a free trade, so it is not
  // allowed into the history. A non-positive effective spread says the month's fills
  // averaged at or better than the midpoint, which is a real thing to observe and still
  // not a cost to publish.
  const keep = reading != null && reading > 0;

  // Snapshot readings are values without dates, and only the last few are kept: enough
  // for a steady median, cheap enough to carry for thousands of listings. Their span is
  // bounded from the other end instead — a history nobody has added to in months
  // describes a book that has moved on, so it goes rather than averaging stale prints
  // into today's answer. An exchange that publishes its own average needs none of this.
  //
  // The half hour each reading came from travels beside it, in a parallel array rather
  // than folded into the value, so that the evidence stays as the exchange gave it and a
  // change to the shape re-derives the answer instead of compounding on it.
  const stale = Date.parse(seen.at) < Date.now() - READING_DAYS * 86400000;
  const readings = snapshot && !stale ? [...(seen.bp || [])] : [];
  const slots = snapshot && !stale ? [...(seen.slot || [])] : [];
  // A history from before the slots were recorded gets nulls rather than a guess, which
  // simply leaves those readings unnormalised.
  while (slots.length < readings.length) slots.unshift(null);
  if (snapshot && keep) {
    readings.push(reading);
    slots.push(slotOf());
  }
  while (readings.length > READING_KEEP) {
    readings.shift();
    slots.shift();
  }

  // What the source says: a median of in-session readings for the snapshot venues, the
  // published average for the monthly ones. Each reading is first brought back to the
  // average hour of the session by its own half hour's multiple, so that three readings
  // taken at noon and one at half past three describe the same day rather than four
  // different ones. Converted on the way out and only there, so the history above stays
  // comparable with the exchange's own page.
  const shape = snapshot ? shapeOf(l) : null;
  const atAverageHour = (v, i) => {
    const factor = shape?.[slots[i]];
    return factor > 0 ? v / factor : v;
  };
  const average = snapshot
    ? readings.length
      ? median(readings.map(atAverageHour))
      : null
    : reading;
  const cost =
    average == null || average <= 0
      ? null
      : byShare
        ? { perShare: Number(average.toFixed(5)) }
        : { bp: Number((average * CROSSED[l.source]).toFixed(2)) };
  publish(l, cost ?? (stale ? null : leafOf(l)));
  if (shape) shapes[`${l.isin}|${l.currency}`] = shape;

  const remember = {
    bp: readings.length ? readings : undefined,
    // Parallel to `bp`: which half hour of the session each of those readings came from.
    slot: slots.some((s) => s != null) ? slots : undefined,
    // Dates the reading, not the attempt: stamping this with the moment a fetch failed
    // would both read as freshness and hold off the retry that is due.
    at: keep ? new Date().toISOString() : seen.at,
    // Marks an empty answer the venue itself gave, as opposed to one we failed to
    // obtain, so no retry is spent on it.
    settled: measured.settled || seen.settled || undefined,
  };
  // A listing there is nothing to remember about — asked while the book was shut, say —
  // leaves no trace, rather than an empty object to be scrolled past.
  if (Object.values(remember).some((v) => v !== undefined)) state[stateKey(l)] = remember;
  else delete state[stateKey(l)];

  // Notes belong to the attempt, so they are reported and not written: kept in the file
  // they would sit beside a good average describing something else entirely.
  if (measured.note) notes.set(l.key, measured.note);
  console.error(
    `    ${shown(l)}` +
      `${snapshot && readings.length ? ` (médiane de ${readings.length} relevé${readings.length > 1 ? "s" : ""})` : ""}` +
      `  ${measured.note || ""}${mismatch ? ` (la bourse dit ${mismatch})` : ""}`
  );

  if (done % 25 === 0) flush();
}

// A source that can answer for many listings at once does so here, before the loop, and
// its per-listing call becomes a lookup. Xetra is the only one so far, and the difference
// is a pass of seconds against a pass of hours.
const prepared = new Set();
for (const l of todo) {
  const adapter = adapters[l.source];
  if (!adapter.prefetch || prepared.has(l.source)) continue;
  prepared.add(l.source);
  const mine = todo.filter((x) => x.source === l.source);
  console.error(`${l.venue.name} : ${mine.length} cotations demandées d'un coup`);
  let bulkTab = null;
  await adapter.prefetch(mine, async () => (bulkTab ||= await tab()));
}

// Each worker keeps its own tab, opened on first need, so a run that touches only the
// HTTP sources never starts a browser at all.
const queue = todo[Symbol.iterator]();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
    let mine = null;
    const ownTab = async () => (mine ||= await tab());
    for (const l of queue) await visit(l, ownTab);
  })
);
flush();

for (const p of pages) await p.close().catch(() => {});
if (connecting) await (await connecting).disconnect();

// -------------------------------------------------------------------- the summary

const sourced = [...listings.values()];
const withBp = sourced.filter((l) => leafOf(l) != null);
const thin = sourced.filter((l) => state[stateKey(l)]?.bp?.length === 1);

console.log(
  `\n${withBp.length}/${sourced.length} cotations sourçables ont une valeur` +
    `${thin.length ? `, dont ${thin.length} sur un seul relevé` : ""}\n`
);
console.log("ticker   dev   place                       coût a-r relevés  source");
console.log("-".repeat(118));
for (const l of sourced.sort((a, b) => a.exchange.localeCompare(b.exchange))) {
  const leaf = leafOf(l);
  console.log(
    `${String(l.ticker || l.isin).padEnd(8)} ${l.currency.padEnd(5)} ` +
      `${l.exchange.slice(0, 24).padEnd(25)} ` +
      `${shown(l).padStart(13)}  ` +
      `${String(state[stateKey(l)]?.bp?.length ?? "moy.").padStart(7)}  ` +
      `${leaf ? leaf.url : notes.get(l.key) || "jamais relevé"}`
  );
}

const unsourced = Object.values(gaps).reduce((n, g) => n + g.cotations, 0);
if (unsourced) {
  console.log(`\nsans source (${unsourced}) :`);
  for (const [why, g] of Object.entries(gaps).sort((a, b) => b[1].cotations - a[1].cotations)) {
    console.log(`  ${String(g.cotations).padStart(4)}x  ${why}   ex. ${g.exemples.join(", ")}`);
  }
}

console.log(
  `\n${STORE_PATH} : ${Object.keys(spreads).length} ISIN, ` +
    `${(fs.statSync(STORE_PATH).size / 1024).toFixed(0)} Ko`
);
