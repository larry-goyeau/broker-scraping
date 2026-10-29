// OTC Markets' company profile of a few symbols, for a broker whose US
// list holds lines quoted over the counter (./adibsec_scraping.mjs). The
// profile names each security of the company with its symbol, CUSIP, tier
// and type; a symbol OTC Markets does not quote answers 404.
//
//   https://backend.otcmarkets.com/otcapi/company/profile/full/<symbol>?symbol=<symbol>
//
// otcmarkets.com answers plain HTTP clients with a "Temporarily
// Unavailable" page, so the calls are made from a headless Chrome page
// opened on the stock screener, as ../moomoous/moomoous_otc.mjs does. Each
// answer is kept in otc-profile-cache.json for PROFILE_DAYS, so a second
// run asks only for new symbols.
//
//   import { otcProfiles } from "./otcProfiles.mjs";
//   const map = await otcProfiles(["ABBNY", "DTNOY"]);
//   map: symbol -> { symbol, cusip, tier, type, name } or null (not quoted)

import fs from "node:fs";
import { createRequire } from "node:module";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SCREENER = "https://www.otcmarkets.com/research/stock-screener";
const PROFILE = "https://backend.otcmarkets.com/otcapi/company/profile/full/";
const CACHE = new URL("otc-profile-cache.json", import.meta.url);
const PROFILE_DAYS = 14;
const GAP = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readCache() {
  try {
    return fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  } catch {
    return {};
  }
}

async function puppeteer() {
  const require = createRequire(import.meta.url);
  let module;
  try {
    module = await import(require.resolve("puppeteer-core"));
  } catch {
    module = await import("puppeteer-core");
  }
  return module.default || module;
}

export async function otcProfiles(symbols) {
  const cache = readCache();
  const stale = (entry) => !entry || Date.now() - Date.parse(entry.at) > PROFILE_DAYS * 86_400_000;
  const wanted = [...new Set(symbols)].filter((symbol) => stale(cache[symbol]));
  if (wanted.length) {
    console.error(`OTC Markets profiles: ${wanted.length} to read`);
    const browser = await (await puppeteer()).launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
    try {
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.goto(SCREENER, { waitUntil: "domcontentloaded", timeout: 90_000 });
      let refused = 0;
      for (const symbol of wanted) {
        const url = `${PROFILE}${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}`;
        let [status, text] = [0, ""];
        for (let attempt = 0; attempt < 3; attempt += 1) {
          [status, text] = await page.evaluate(async (target) => {
            const response = await fetch(target);
            return [response.status, await response.text()];
          }, url);
          if (status === 200 || status === 404 || status === 400) break;
          await sleep(GAP * 4 * (attempt + 1));
        }
        let entry = null;
        if (status === 200) {
          const body = JSON.parse(text);
          const security = (body.securities || []).find((item) => item.symbol === symbol);
          if (security) {
            entry = {
              symbol,
              cusip: String(security.cusip || "").trim().toUpperCase(),
              tier: security.tierName || "",
              type: security.typeName || "",
              name: body.name || security.issueName || "",
            };
          }
          refused = 0;
        } else if (status === 403 && refused < 4) {
          refused += 1;
        } else if (status !== 404 && status !== 400) {
          throw new Error(`OTC Markets profile of ${symbol} answered ${status}`);
        }
        cache[symbol] = { at: new Date().toISOString(), entry };
        fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
        await sleep(GAP);
      }
    } finally {
      await browser.close();
    }
  }
  return new Map([...new Set(symbols)].map((symbol) => [symbol, cache[symbol]?.entry ?? null]));
}
