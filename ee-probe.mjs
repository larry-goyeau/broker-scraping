import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
let page = pages.find((p) => p.url().includes("invest-now.apps.easyequities.io"));
const opened = !page;
if (!page) page = await browser.newPage();

let token = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  const auth = event.request.headers?.Authorization || event.request.headers?.authorization;
  if (auth && String(auth).startsWith("Bearer ")) token = String(auth).slice(7);
});

await page
  .goto("https://invest-now.apps.easyequities.io/instrument/diy/etfsexpanded", {
    waitUntil: "domcontentloaded",
  })
  .catch(() => {});
for (let waited = 0; waited < 40000 && !token; waited += 250) await sleep(250);
await sleep(4000);
if (!token) throw new Error("no token");

const API = "https://rest.synatic.openeasy.io/easyequities/investnow";

const norm = (t) => {
  let v = (t || "").trim().toUpperCase();
  if (v.includes(":")) v = v.split(":").pop();
  return v.split("/")[0].trim();
};
const tickers = [
  ...new Set(
    fs
      .readFileSync("stocks.csv", "utf8")
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((l) => norm(l.split(",")[0]))
      .filter((t) => /^[A-Z0-9.\-]{1,6}$/.test(t))
  ),
].slice(0, 300);

for (const [lanes, gap] of [[6, 120], [10, 60], [16, 30]]) {
  const t0 = Date.now();
  const r = await page.evaluate(
    async (api, auth, terms, lanes, gap) => {
      const queue = [...terms];
      const statuses = {};
      const harvested = new Set();
      let next = 0;
      const lane = async () => {
        while (queue.length) {
          const term = queue.shift();
          const now = Date.now();
          const slot = Math.max(now, next);
          next = slot + gap;
          if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
          try {
            const res = await fetch(`${api}/search`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${auth}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                searchValue: term.toLowerCase(),
                account_filter: "ALL",
                category: "equitiesexpanded",
                page: 1,
              }),
            });
            statuses[res.status] = (statuses[res.status] || 0) + 1;
            if (res.status === 200) {
              const j = await res.json();
              for (const row of j?.instruments || []) harvested.add(row.contractCode);
            }
          } catch {
            statuses.err = (statuses.err || 0) + 1;
          }
        }
      };
      await Promise.all(Array.from({ length: lanes }, lane));
      return { statuses, harvested: harvested.size };
    },
    API,
    token,
    tickers,
    lanes,
    gap
  );
  const ms = Date.now() - t0;
  console.log(
    `lanes=${lanes} gap=${gap}ms -> ${tickers.length} queries in ${(ms / 1000).toFixed(1)}s (${Math.round(ms / tickers.length)}ms each) statuses=${JSON.stringify(r.statuses)} harvested=${r.harvested}`
  );
}

if (opened) await page.close();
await browser.disconnect();
