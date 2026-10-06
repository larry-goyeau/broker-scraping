// Philippine cash touch from the exchange's public security page. Bid
// and ask are the best bid and the best offer. A last trade is never
// written in their place.
//
// The page says it is delayed by 15 minutes and stamps the quote in
// Manila time. Continuous matching is 09:30–12:00 and 13:00–14:45.
// Pre-close starts at 14:45. After the bell the page freezes the last
// two-sided quote at 15:00, and that print is kept. A stamp from
// another day is left out. The reading is pse-touch.json.
// spread.mjs copies it into spread.json (`--only=pse-touch`).
//
//   node spreads/pse-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./pse-touch.json", import.meta.url));
const PAGE = "https://frames.pse.com.ph/security/";
const AT_ONCE = 8;
const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const manila = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(when)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday,
    day: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const inSession = (minutes, day) => {
  if (!day) return false;
  const morning = minutes >= 9 * 60 + 30 && minutes < 12 * 60;
  const afternoon = minutes >= 13 * 60 && minutes < 14 * 60 + 45;
  return morning || afternoon;
};

// After the bell the page freezes the last two-sided quote at 15:00.
const usableStamp = (minutes, day) => inSession(minutes, day) || (day && minutes === 15 * 60);

const num = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text === "--" || text === "-") return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

// "As of October 06, 2026 09:23:47 AM" is the quote, already in Manila time.
const stampOf = (html) => {
  const match = html.match(
    /As of\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)/i
  );
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  let hour = Number(match[4]) % 12;
  if (match[7].toUpperCase() === "PM") hour += 12;
  const minute = Number(match[5]);
  return {
    date: `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutes: hour * 60 + minute,
  };
};

const touchOf = (html) => {
  const box = html.slice(html.indexOf("BEST BID"), html.indexOf("Market Statistics"));
  const prices = [...box.matchAll(/font-weight:\s*900;color:\s*#003579;">\s*([0-9,.]+)/g)].map((m) => num(m[1]));
  const bid = prices[0] ?? null;
  const ask = prices[1] ?? null;
  return { bid, ask, bp: bpFrom(bid, ask), at: stampOf(html) };
};

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://www.pse.com.ph/",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const body = await response.text();
        if (body.includes("BEST BID")) return body;
        last = "sans carnet";
      } else last = `${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last || url);
}

const onPse = (row) => {
  const exchange = norm(row.exchange);
  const isin = String(row.isin || "").toUpperCase();
  const currency = String(row.currency || "").toUpperCase();
  if (exchange === "xphs" || exchange.includes("philip") || exchange.includes("manila")) return true;
  // "PSE" is also Prague. A peso line or a Philippine ISIN is Manila.
  return exchange === "pse" && (currency === "PHP" || isin.startsWith("PH"));
};

function listings() {
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!onPse(row)) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !["STOCK", "ETF", "ETN", "ETC", "REIT"].includes(type)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const code = String(row.ticker || "")
      .trim()
      .toUpperCase()
      .replace(/^PSE:/, "")
      .replace(/\.PS$/, "");
    if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code)) continue;
    const counts = byCode.get(code) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(code, counts);
  }
  const jobs = [];
  let tied = 0;
  for (const [code, counts] of byCode) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      tied += 1;
      continue;
    }
    jobs.push({ code, isin: ranked[0][0] });
  }
  jobs.sort((a, b) => a.code.localeCompare(b.code));
  return { jobs, tied };
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, run));
  return out;
}

const now = manila();
if (!now.day || now.minutes < 9 * 60 + 30) {
  console.error(`hors séance, Manille ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Manille ${now.clock}. ISINs des catalogues…`);
const { jobs, tied } = listings();
console.error(`${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
if (!jobs.length) {
  console.error("aucun code du catalogue. Rien n'est écrit.");
  process.exit(1);
}

// The page lags the bell. During the session, wait until one liquid
// name is stamped inside it. After the close, read the frozen 15:00 quote.
let probe = null;
while (inSession(manila().minutes, manila().day)) {
  try {
    probe = touchOf(await text(`${PAGE}bdo`));
  } catch (error) {
    probe = null;
    console.error(`BDO : ${error.message}`);
  }
  const at = probe?.at;
  if (at && at.date === manila().date && usableStamp(at.minutes, true)) break;
  console.error(
    `BDO encore hors continu${at ? ` (${at.date} ${at.clock})` : ""}. Manille ${manila().clock}.`
  );
  probe = null;
  await sleep(20_000);
}

if (inSession(manila().minutes, manila().day) && !probe?.bp) {
  console.error(`aucune touche du continu. Manille ${manila().clock}. Rien n'est écrit.`);
  process.exit(1);
}
if (probe?.at) console.error(`BDO ${probe.bid}/${probe.ask}, daté ${probe.at.clock}.`);
console.error(`Lecture des ${jobs.length} codes…`);

const today = manila().date;
let stale = 0;
let noTouch = 0;
let failed = 0;
let done = 0;
const found = [];
await pool(jobs, async (job) => {
  let html = "";
  try {
    html = await text(`${PAGE}${encodeURIComponent(job.code.toLowerCase())}`);
  } catch {
    failed += 1;
  }
  done += 1;
  if (done % 80 === 0) console.error(`${done}/${jobs.length}`);
  if (!html) return;
  const touch = touchOf(html);
  if (!touch.at || touch.at.date !== today || !usableStamp(touch.at.minutes, true)) {
    stale += 1;
    return;
  }
  if (touch.bp == null) {
    noTouch += 1;
    return;
  }
  found.push({
    isin: job.isin,
    mic: "XPHS",
    code: job.code,
    bid: touch.bid,
    ask: touch.ask,
    bp: touch.bp,
    stamp: `${touch.at.date} ${touch.at.clock}`,
    url: `${PAGE}${encodeURIComponent(job.code.toLowerCase())}`,
  });
});

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error(`aucune touche du continu. Manille ${manila().clock}. Rien n'est écrit.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    { at: new Date().toISOString(), clock: manila().clock, rows: found, stale, noTouch, failed, tied },
    null,
    2
  )
);
console.error(
  `${found.length} touches, ${stale} hors séance, ${noTouch} sans bid et ask, ${failed} pages en échec. Écrit dans pse-touch.json.`
);
