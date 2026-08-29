// Deutsche Boerse publishes XLM, the Xetra Liquidity Measure: the implicit cost in
// basis points of buying and immediately selling a standard volume on Xetra. It is
// the one spread figure that is free, per-instrument and available before trading,
// which makes it the only honest way to fill a spread section without placing orders.
//
// The measure belongs to the fund on Xetra, not to a broker, so the cache it builds
// is shared: any broker parser can read it.
//
//   node xlm.mjs                     -- ISINs from trading212/trading212-parsed.json
//   node xlm.mjs --isins=a.csv       -- ISINs from a CSV
//   node xlm.mjs IE00B4L5Y983 ...    -- ISINs on the command line
//   node xlm.mjs --refresh           -- refetch instead of trusting the cache

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CACHE_PATH = "parsed_json/xlm-cache.json";
const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (m) return m[1];
  }
  return "";
};
const REFRESH = process.argv.includes("--refresh");

function isinsFrom(text) {
  return [...new Set(text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/g) || [])];
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const isinsFile = arg("isins");
const isins = positional.length
  ? isinsFrom(positional.join(" "))
  : isinsFile
    ? isinsFrom(fs.readFileSync(isinsFile, "utf8"))
    : isinsFrom(fs.readFileSync("trading212/trading212-parsed.json", "utf8"));

if (!isins.length) throw new Error("No ISINs to look up.");

const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : {};
const todo = REFRESH ? isins : isins.filter((isin) => !cache[isin]);

console.error(`${isins.length} ISINs, ${todo.length} to fetch, ${isins.length - todo.length} cached`);

if (todo.length) {
  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: null,
    protocolTimeout: 240000,
  });
  for (const p of await browser.pages()) {
    if (/deutsche-boerse\.com/.test(p.url())) await p.close().catch(() => {});
  }

  const page = await browser.newPage();

  // The API signs its requests with an x-security header. Rather than forging that,
  // let the instrument page issue the call and read the response as it comes back.
  let inflight = {};
  page.on("response", async (res) => {
    const url = res.url();
    if (!/api\.live\.deutsche-boerse\.com\/v1\/data\//.test(url) || res.status() !== 200) return;
    const m = url.match(/isin=([A-Z0-9]+)/);
    if (!m) return;
    const kind = url.split("/v1/data/")[1].split("?")[0];
    try {
      (inflight[m[1]] ||= {})[kind] = await res.json();
    } catch {
      // A body that will not parse tells us nothing; the ISIN simply stays unfilled.
    }
  });

  for (const [index, isin] of todo.entries()) {
    inflight = {};
    let resolvedUrl = null;
    console.error(`[${index + 1}/${todo.length}] ${isin}`);
    try {
      // The ISIN path answers for every product type, ETCs included, and lands on a
      // readable slug.
      await page.goto(`https://live.deutsche-boerse.com/etf/${isin}`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
      // The landing URL carries a currency parameter from the session; drop it so
      // the stored link is stable.
      resolvedUrl = page.url().split("?")[0];
      await new Promise((r) => setTimeout(r, 2500));
    } catch {
      // A navigation that times out is treated the same as one that found nothing.
    }

    const params = inflight[isin]?.xetra_trading_parameter;
    const master = inflight[isin]?.etp_master_data;
    const fees = inflight[isin]?.fees_etp;
    cache[isin] =
      params?.xlm == null
        ? { isin, listedOnXetra: false, fetchedAt: new Date().toISOString() }
        : {
            isin,
            listedOnXetra: true,
            // XLM below is a snapshot of a figure that moves, so carry the page it
            // came from: a reader can see the live book there. The ISIN form is the
            // one to build links from — it redirects to the slug, which can change.
            url: `https://live.deutsche-boerse.com/etf/${isin}`,
            canonicalUrl: resolvedUrl,
            // Round trip cost in basis points: buying and immediately selling.
            xlmBp: params.xlm,
            // The obligation market makers accept, which bounds the spread rather
            // than describing it, and the size that obligation holds for.
            maxSpreadPct: params.maxSpread ?? null,
            minQuoteVolume: params.minQuoteVolume ?? null,
            minQuoteUnit: params.minQuoteUnit ?? null,
            minimumTradableUnit: params.minimumTradableUnit ?? null,
            // More market makers competing is what makes a spread hold up, so the
            // count is worth keeping beside the measure itself.
            designatedSponsors: (params.designatedSponsors || []).length || null,
            tradingModel: params.tradingModel?.originalValue ?? null,
            tradingCurrency: master?.tradingCurrency ?? null,
            ter: fees?.totalExpensePercent ?? null,
            fetchedAt: new Date().toISOString(),
          };

    fs.mkdirSync("parsed_json", { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  }

  await page.close();
  await browser.disconnect();
}

const found = isins.filter((i) => cache[i]?.listedOnXetra);
console.log(`\n${found.length}/${isins.length} ISINs carry an XLM on Xetra\n`);
console.log("ISIN           XLM (bp)  aller simple  spread max  volume coté  teneurs  TER");
console.log("-".repeat(82));
for (const isin of isins) {
  const c = cache[isin];
  if (!c?.listedOnXetra) {
    console.log(`${isin}  non coté sur Xetra`);
    continue;
  }
  console.log(
    `${isin}  ${String(c.xlmBp).padStart(8)}  ${String((c.xlmBp / 2).toFixed(2)).padStart(12)}  ` +
      `${String(c.maxSpreadPct ?? "?").padStart(10)}  ` +
      `${String(c.minQuoteVolume ?? "?").padStart(11)}  ` +
      `${String(c.designatedSponsors ?? "?").padStart(7)}  ${String(c.ter ?? "?").padStart(4)}`
  );
}
