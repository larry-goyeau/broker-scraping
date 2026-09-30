// What Tradegate was quoting at the minute an N26 order preview was taken.
//
// `N26_cost.mjs` charges the Tradegate book as the market part of a round trip,
// and that is the largest of its terms — on 1 000 € of an ETF the two tickets are
// 1,80 € and the book is about 4. It is also the one term never checked against
// reality: Upvest's ex-ante document prices only what Upvest charges, so a markup
// sitting inside the price the app shows would not appear anywhere on it.
//
// The crypto side is why that matters. The same app showed a bitcoin price that
// carried 0,28 % of Bitpanda markup over the market, disclosed nowhere. Whether
// the equity leg does the same is answerable only by reading the book at the
// minute a preview was on screen, and comparing.
//
// Deutsche Börse publishes Tradegate's pre-trade tape a minute at a time, fifteen
// minutes late, and keeps only the recent files. So a preview taken at T can be
// matched from about T+16 onwards, and not much later. `spread.mjs` reads the
// same tape for the whole sweep and keeps one quote per line; here every quote of
// the window is kept, since the question is about one minute in particular.
//
//   node N26/N26-book.mjs IE00B4L5Y983
//   node N26/N26-book.mjs IE00B4L5Y983 --at=14:57
//   node N26/N26-book.mjs IE00B4L5Y983 --at=14:57 --shown=112.34
//
// Times are Berlin time, as printed on the phone.

import { gunzipSync } from "node:zlib";

const TAPES = {
  tradegate: { product: "DGAT-pretrade", name: "Tradegate", mic: "XGAT" },
  quotrix: { product: "DQTX-pretrade", name: "Quotrix", mic: "XQTX" },
};

const UA = { "user-agent": "Mozilla/5.0", accept: "*/*" };
const MINUTES = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The archive answers 429 after a few dozen files in a row and forgets about it
// within seconds, so waiting is the whole fix. Thirty minutes of tape is thirty
// files and the window is worth more than the delay.
async function fetchOk(url, timeout = 60000) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(timeout) });
    if (res.ok) return res;
    if (res.status !== 429 || attempt >= 6) throw new Error(`HTTP ${res.status} sur ${url}`);
    await sleep(2000 * (attempt + 1));
  }
}

async function gunzipText(url) {
  const buf = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  try {
    return gunzipSync(buf).toString("utf8");
  } catch {
    return buf.toString("utf8");
  }
}

const berlin = (iso) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Every two-sided quote the tape carries for these ISINs, oldest first. */
async function quotes({ product, isins, minutes = MINUTES }) {
  const index = await (await fetchOk(`https://mfs.deutsche-boerse.com/api/${product}`)).json();
  const files = (index.CurrentFiles || []).slice(0, minutes);
  if (!files.length) throw new Error(`index ${product} vide`);

  const out = [];
  for (const file of files) {
    const text = await gunzipText(`https://mfs.deutsche-boerse.com/api/download/${file}`);
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const isin = String(o.instrumentIdentificationCode || "").toUpperCase();
      if (!isins.has(isin)) continue;
      const bid = Number(o.bestBid ?? o.bid);
      const ask = Number(o.bestAsk ?? o.ask);
      if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
      out.push({
        isin,
        currency: String(o.priceCurrency || "").toUpperCase(),
        bid,
        ask,
        at: o.updateDateAndTime || o.publicationDateAndTime || "",
      });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

const bp = (q) => (1e4 * (q.ask - q.bid)) / ((q.ask + q.bid) / 2);

function report({ venue, rows, at, shown }) {
  if (!rows.length) {
    console.log(`${venue.name} : rien sur cette ligne dans les ${MINUTES} dernières minutes publiées\n`);
    return;
  }
  const span = `${berlin(rows[0].at)} – ${berlin(rows[rows.length - 1].at)}`;
  console.log(`${venue.name} (${venue.mic}) — ${rows.length} cotations, ${span} heure de Berlin\n`);

  // The tape is a minute apart from the phone's clock at best, so the neighbours
  // of the asked minute say more than the single nearest quote.
  const picked = at ? rows.filter((q) => berlin(q.at).slice(0, 5) === at) : rows.slice(-6);
  const shownRows = picked.length ? picked : rows.slice(-6);
  if (at && !picked.length) console.log(`  aucune cotation à ${at} pile ; voici les dernières\n`);

  for (const q of shownRows) {
    console.log(
      `  ${berlin(q.at)}   bid ${q.bid.toFixed(4)}   ask ${q.ask.toFixed(4)}   ` +
        `mid ${((q.bid + q.ask) / 2).toFixed(4)}   ${bp(q).toFixed(2)} bp` +
        (shown ? `   |  aperçu ${shown} → ${(1e4 * (shown / q.ask - 1)).toFixed(1)} bp au-dessus de l'ask` : "")
    );
  }

  if (shown && shownRows.length) {
    const asks = shownRows.map((q) => q.ask);
    const mids = shownRows.map((q) => (q.bid + q.ask) / 2);
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    console.log(
      `\n  sur cette fenêtre : ask moyen ${avg(asks).toFixed(4)}, mid moyen ${avg(mids).toFixed(4)}\n` +
        `  le prix montré par N26 est ${(1e4 * (shown / avg(asks) - 1)).toFixed(1)} bp au-dessus de l'ask ` +
        `et ${(1e4 * (shown / avg(mids) - 1)).toFixed(1)} bp au-dessus du mid`
    );
  }
  console.log();
}

const flag = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};

const isins = new Set(
  process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .map((a) => a.toUpperCase())
);

if (!isins.size) {
  console.error(
    "usage : node N26/N26-book.mjs <ISIN...> [--at=HH:MM] [--shown=prix] [--venue=tradegate|quotrix]\n" +
      "  ex.  node N26/N26-book.mjs IE00B4L5Y983 --at=14:57 --shown=112.34"
  );
  process.exit(2);
}

const at = flag("at");
const shown = flag("shown") ? Number(flag("shown")) : null;
// Thirty files a venue is already close to what the archive will serve before it
// answers 429, so the second venue is asked for and not swept into by default.
const only = flag("venue") || "tradegate";

for (const [key, venue] of Object.entries(TAPES)) {
  if (only !== "both" && only !== key) continue;
  try {
    report({ venue, rows: await quotes({ product: venue.product, isins }), at, shown });
  } catch (e) {
    console.log(`${venue.name} : ${String(e.message || e).slice(0, 160)}\n`);
  }
}
