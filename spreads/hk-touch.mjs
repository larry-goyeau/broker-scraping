// Hong Kong cash touch from Sina. Bid and ask are the quote. A last trade
// is never written in their place. The renminbi counter is 8 plus the
// rest of the Hong Kong dollar code, and its name ends in -R. The US
// dollar counter is 9 plus that rest, and its name ends in -U. Each is
// its own book, kept even when no catalogue lists the code.
//
// The continuous session is 09:30–12:00 and 13:00–16:00 Hong Kong time.
// A quote from either of those windows is kept. The closing auction
// starts at 16:00. A stamp from the auction, from lunch, or from another
// day is left out.
//
// Launched before the open, it waits for 13:15, the middle of the
// continuous time. Launched during a session, it reads then. A machine
// that suspends still reads on the next weekday. The reading is
// hk-touch.json. spread.mjs copies it into spread.json (`--only=hk-touch`).
//
//   node spreads/hk-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./hk-touch.json", import.meta.url));
const HK = new Set(["hkex", "sehk", "hongkong", "hks", "xhkg"]);
const LISTS = ["../assets/stocks.csv", "../assets/etfs.csv"].map((name) => fileURLToPath(new URL(name, import.meta.url)));
const TARGET = 13 * 60 + 15;
const STOP = 15 * 60 + 50;
const BATCH = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hongKong = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
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
    date: `${parts.year}/${parts.month}/${parts.day}`,
  };
};

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

const stampMinutes = (time) => {
  const [h, m] = String(time || "").split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

// 09:30 opens the morning book, 13:00 the afternoon book. 16:00 is the auction.
const liveStamp = (date, time, today) => {
  if (date !== today) return false;
  const minutes = stampMinutes(time);
  if (minutes == null) return false;
  const morning = minutes >= 9 * 60 + 30 && minutes < 12 * 60;
  const afternoon = minutes >= 13 * 60 && minutes < 16 * 60;
  return morning || afternoon;
};

const inSession = (at) => at.day && liveStamp(at.date, at.clock, at.date);

function codeOf(ticker) {
  const digits = String(ticker || "").split(":").pop().replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const code = digits.padStart(5, "0");
  return code.length === 5 ? code : "";
}

function listings() {
  const byCode = new Map();
  const ccyOf = new Map();
  const add = (code, isin, currency) => {
    if (!code || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return;
    const counts = byCode.get(code) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(code, counts);
    const ccy = String(currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(ccy)) return;
    const votes = ccyOf.get(code) || new Map();
    votes.set(ccy, (votes.get(ccy) || 0) + 1);
    ccyOf.set(code, votes);
  };
  for (const row of catalogueRows()) {
    if (!HK.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !["STOCK", "ETF", "ETN", "ETC"].includes(type)) continue;
    add(codeOf(row.ticker), String(row.isin || "").toUpperCase(), row.currency);
  }
  for (const file of LISTS) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n").slice(1)) {
      const [ticker, exchange, isin] = line.split(",");
      if (!HK.has(norm(exchange))) continue;
      add(codeOf(ticker), String(isin || "").trim().toUpperCase(), "");
    }
  }
  const jobs = [];
  let tied = 0;
  for (const [code, counts] of byCode) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      tied += 1;
      continue;
    }
    const votes = [...(ccyOf.get(code) || new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const currency = !votes.length || (votes.length > 1 && votes[0][1] === votes[1][1]) ? "HKD" : votes[0][0];
    jobs.push({ code, isin: ranked[0][0], currency: currency === "CNY" ? "CNH" : currency });
  }
  jobs.sort((a, b) => a.code.localeCompare(b.code));
  return { jobs, tied };
}

async function text(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.sina.com.cn/" },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function quotes(body) {
  const out = [];
  for (const match of body.matchAll(/hq_str_hk(\d+)="([^"]*)"/g)) {
    const fields = match[2].split(",");
    if (fields.length < 19) continue;
    out.push({
      code: match[1].padStart(5, "0"),
      name: fields[0] || "",
      bid: num(fields[9]),
      ask: num(fields[10]),
      date: fields[17],
      time: fields[18],
    });
  }
  return out;
}

async function readBook(jobs) {
  const found = [];
  let auction = 0;
  let stale = 0;
  let noTouch = 0;
  const today = hongKong().date;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const byCode = new Map(batch.map((job) => [job.code, job]));
    let body = "";
    let error = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        body = await text(`https://hq.sinajs.cn/list=${batch.map((job) => `hk${job.code}`).join(",")}`);
        error = null;
        break;
      } catch (e) {
        error = e;
        await sleep(1000);
      }
    }
    if (error) throw error;
    for (const quote of quotes(body)) {
      const job = byCode.get(quote.code);
      if (!job) continue;
      const minutes = stampMinutes(quote.time);
      if (quote.date === today && minutes != null && minutes >= 16 * 60) {
        auction += 1;
        continue;
      }
      if (!liveStamp(quote.date, quote.time, today)) {
        stale += 1;
        continue;
      }
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) {
        noTouch += 1;
        continue;
      }
      found.push({
        isin: job.isin,
        mic: "XHKG",
        code: quote.code,
        currency: job.currency || "HKD",
        name: quote.name,
        bid: quote.bid,
        ask: quote.ask,
        bp,
        stamp: `${quote.date} ${quote.time}`,
        url: `https://stock.finance.sina.com.cn/hkstock/quotes/${quote.code}.html`,
      });
    }
    if (i + BATCH < jobs.length) await sleep(200);
  }
  return { found, auction, stale, noTouch };
}

let announced = "";
for (;;) {
  const now = hongKong();
  if (inSession(now)) break;
  if (now.day && now.minutes >= TARGET && now.minutes < STOP) break;
  const when = !now.day || now.minutes >= STOP ? "le prochain jour de bourse" : "aujourd'hui";
  const mark = `${now.date}|${when}`;
  if (announced !== mark) {
    console.error(`13:15 : attente ${when}, Hong Kong ${now.weekday} ${now.clock}`);
    announced = mark;
  }
  await sleep(30000);
}

console.error(`Hong Kong ${hongKong().clock}. ISINs des catalogues et des listes…`);
const { jobs, tied } = listings();
const known = new Set(jobs.map((job) => job.code));
const twins = [];
for (const job of jobs) {
  if (!job.code.startsWith("0")) continue;
  for (const [prefix, currency, suffix] of [["8", "CNH", "-R"], ["9", "USD", "-U"]]) {
    const code = `${prefix}${job.code.slice(1)}`;
    if (known.has(code)) continue;
    known.add(code);
    twins.push({ code, isin: job.isin, currency, base: job.code, suffix });
  }
}
console.error(`${jobs.length} codes, ${twins.length} contreparties à vérifier, ${tied} codes à ISIN partagé laissés de côté.`);

let book = { found: [], auction: 0, stale: 0, noTouch: 0 };
while (hongKong().minutes < STOP) {
  book = await readBook(jobs);
  const names = new Map(book.found.map((row) => [row.code, row.name]));
  const accepted = twins.filter((twin) => {
    const base = String(names.get(twin.base) || "").toUpperCase();
    return base.length > 1;
  });
  if (accepted.length) {
    const extra = await readBook(accepted.map(({ code, isin, currency }) => ({ code, isin, currency })));
    const baseName = new Map([...names.entries()].map(([code, name]) => [code, String(name || "").toUpperCase()]));
    for (const row of extra.found) {
      const twin = accepted.find((item) => item.code === row.code);
      const base = baseName.get(twin?.base || "") || "";
      const name = String(row.name || "").toUpperCase();
      if (!base || !name.startsWith(base) || !name.endsWith(twin.suffix)) continue;
      book.found.push(row);
    }
    book.noTouch += extra.noTouch;
    book.stale += extra.stale;
  }
  console.error(
    `${book.found.length} touches, ${book.auction} enchères, ${book.stale} hors séance, ${book.noTouch} sans bid et ask. Hong Kong ${hongKong().clock}.`
  );
  if (book.found.length) break;
  await sleep(30000);
}

if (!book.found.length) {
  console.error(`aucune touche du continu. Hong Kong ${hongKong().clock}. Rien n'est écrit.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      clock: hongKong().clock,
      rows: book.found,
      auction: book.auction,
      stale: book.stale,
      noTouch: book.noTouch,
      tied,
    },
    null,
    2
  )
);
console.error(`${book.found.length} touches écrites dans hk-touch.json.`);
