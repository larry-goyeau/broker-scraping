// Reads a broker page as plain text and stops the run when a sentence the
// catalogue rests on is gone. Shared by the Turkish, Romanian, Polish,
// Balkan and Central Asian scrapers whose catalogue is a shared exchange
// book plus the broker's own words (denizyatrm, a1capital, interdealer ...).
//
// Unlike ../bajaj/pageSays.mjs it decodes every HTML entity (numeric, hex
// and the named ones these sites use: &uuml; &ccedil; &#351; ...), so a
// pattern can be written in the page's own language.
//
// A site behind a Cloudflare browser check ("Just a moment...") cannot be
// read by a script. With { wayback: true } such a page is read from its
// newest Internet Archive capture instead (as ../moneybox does), and the
// capture date is returned so the scraper can print it.
//
//   import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";
//   const { text, source } = await says(url, [/binde 5/], { wayback: true });
//   await pdfAnswers(url);   // the fee PDF is still published

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", euro: "€", deg: "°",
  uuml: "ü", Uuml: "Ü", ouml: "ö", Ouml: "Ö", ccedil: "ç", Ccedil: "Ç", auml: "ä", Auml: "Ä",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", eacute: "é", Eacute: "É", egrave: "è",
  scaron: "š", Scaron: "Š", zcaron: "ž", Zcaron: "Ž", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú",
};

export function plain(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED[name] ?? whole)
    .replace(/[ \s]+/g, " ");
}

const challenged = (status, body) => status === 403 || status === 503 || /<title>[^<]*(Just a moment|Attention Required)/i.test(body);

async function get(url, ua = UA) {
  let last = "";
  let wait = 1500;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt) await sleep(wait * attempt);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,application/pdf,*/*", "Accept-Language": "en,tr;q=0.8" },
        signal: AbortSignal.timeout(60_000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (response.ok || challenged(response.status, body.toString("utf8", 0, 4000))) return { status: response.status, body, url: response.url };
      last = `${url} answered ${response.status}`;
      // The Internet Archive answers 429 to quick repeats: wait longer.
      if (response.status === 429) wait = 15_000;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
  }
  throw new Error(last);
}

// The page, or its newest Internet Archive capture when the live site
// answers with a browser check and { wayback: true } is given.
export async function page(url, { wayback = false } = {}) {
  const live = await get(url);
  const head = live.body.toString("utf8", 0, 4000);
  if (live.status < 300 && !challenged(live.status, head)) return { body: live.body, source: "live" };
  if (!wayback) throw new Error(`${url} answered ${live.status} (browser check)`);
  // The Archive answers 429 to a browser User-Agent sent by a script, so
  // the request says what it is.
  const archived = await get(`https://web.archive.org/web/29991231235959id_/${url}`, "broker-scraping catalogue check (Node fetch)");
  const stamp = (archived.url.match(/\/web\/(\d{14})id_\//) || [])[1];
  if (archived.status >= 300 || !stamp) throw new Error(`no Internet Archive capture of ${url}`);
  return { body: archived.body, source: `Internet Archive ${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}` };
}

// Throws unless every pattern is found in the page's plain text (or in its
// HTML with { raw: true }, for a link kept in an attribute).
export async function says(url, patterns, options = {}) {
  const { body, source } = await page(url, options);
  const text = options.raw ? body.toString("utf8") : plain(body.toString("utf8"));
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} (${source}) no longer says ${pattern}`);
  return { text, source };
}

// Throws unless the URL still serves a PDF (a scanned or image tariff that
// has no text to match).
export async function pdfAnswers(url, options = {}) {
  const { body, source } = await page(url, options);
  if (body.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error(`${url} (${source}) is no longer a PDF`);
  return { bytes: body.length, source };
}
