// The London Stock Exchange's own lines for one instrument, for brokers that
// name the LSE as their place but print no line: every main-market line of
// an ISIN (or of the ISIN behind a TIDM), each with its own TIDM and trading
// currency. The LSE quotes a line in GBX, GBP, USD or EUR; a broker keeps the
// lines its account can hold.
//
//   https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=<ISIN>
//   https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SEARCH = "https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=";
const LINE = "https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.json();
      // An unknown TIDM answers 404; that is an answer, not a failure.
      if (response.status === 404) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// One line, read from the LSE, or null when that TIDM is not a main-market line.
export async function lseLine(tidm) {
  const line = await json(LINE + encodeURIComponent(String(tidm || "").trim().toUpperCase()));
  if (!line || !ISIN.test(line.isin || "") || !/^MAINMARKET/.test(line.market || "")) return null;
  return { isin: line.isin, ticker: line.tidm, currency: String(line.currency || "").toUpperCase(), name: line.description || line.name || "" };
}

// Every main-market line of an ISIN. Turquoise and the other books the search
// also returns are not LSE lines.
export async function lseLines(isin) {
  const found = await json(SEARCH + encodeURIComponent(isin));
  const out = [];
  for (const item of found?.instruments || []) {
    if (item.code !== isin || item.islse !== true) continue;
    const line = await lseLine(item.tidm);
    if (line && line.isin === isin) out.push(line);
    await sleep(150);
  }
  return out;
}

// Pence are sterling for what an account holds.
export const heldAs = (currency) => (currency === "GBX" ? "GBP" : currency);
