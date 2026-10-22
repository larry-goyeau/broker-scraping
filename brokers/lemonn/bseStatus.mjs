// The BSE's own status of every equity-segment scrip: Active, Suspended
// or Delisted, with its ISIN and trading symbol. The list is the BSE scrip
// search (www.bseindia.com/corporates/List_Scrips.html) read through its
// API. Akamai answers 403 to a plain request, so the call carries the
// headers a browser on bseindia.com sends. In October 2026 the lists held
// about 5,100 Active, 1,200 Suspended and 4,600 Delisted scrips; a list
// far shorter than that, or in another shape, stops the scraper.
//
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Suspended
//
// Used by brokers/lemonn and brokers/chola.

const API = "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FLOOR = { Active: 4000, Suspended: 800, Delisted: 3500 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function statusList(status) {
  const url = `${API}?Group=&Scripcode=&industry=&segment=Equity&status=${status}`;
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.bseindia.com/",
          Origin: "https://www.bseindia.com",
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) {
        const list = JSON.parse(await response.text());
        if (!Array.isArray(list)) throw new Error(`BSE ${status} list is not a list`);
        if (list.length < FLOOR[status]) throw new Error(`BSE ${status} list has only ${list.length} scrips`);
        for (const scrip of list) {
          if (!("ISIN_NUMBER" in scrip) || !("scrip_id" in scrip) || scrip.Status !== status) throw new Error(`BSE ${status} list changed shape: ${JSON.stringify(scrip).slice(0, 200)}`);
        }
        return list;
      }
      last = `BSE ${status} list answered ${response.status}`;
      if (response.status === 403) break;
    } catch (error) {
      if (/changed shape|has only|is not a list/.test(error.message)) throw error;
      last = `BSE ${status} list: ${error.message}`;
    }
    await pause(2_000 * (attempt + 1));
  }
  throw new Error(last);
}

// A scrip is closed when its ISIN (or, with no ISIN, its symbol) is on the
// Suspended or Delisted list and on no Active line: a company that was
// relisted keeps its ISIN under a new, active scrip code.
export async function bseClosed() {
  const [active, suspended, delisted] = [await statusList("Active"), await statusList("Suspended"), await statusList("Delisted")];
  const key = (value) => String(value || "").trim().toUpperCase();
  const open = new Set();
  for (const scrip of active) {
    if (key(scrip.ISIN_NUMBER)) open.add(key(scrip.ISIN_NUMBER));
    if (key(scrip.scrip_id)) open.add(key(scrip.scrip_id));
  }
  const closed = new Map();
  for (const [status, list] of [["suspended", suspended], ["delisted", delisted]]) {
    for (const scrip of list) {
      for (const id of [key(scrip.ISIN_NUMBER), key(scrip.scrip_id)]) {
        if (id && !open.has(id) && !closed.has(id)) closed.set(id, status);
      }
    }
  }
  return {
    // The status of a BSE line, by ISIN first and symbol when it has none.
    statusOf(isin, symbol) {
      const id = key(isin);
      if (id) return open.has(id) ? "" : closed.get(id) || "";
      const ticker = key(symbol);
      return ticker && !open.has(ticker) ? closed.get(ticker) || "" : "";
    },
    counts: { active: active.length, suspended: suspended.length, delisted: delisted.length },
  };
}
