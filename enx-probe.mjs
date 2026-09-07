import { resolveVenue } from "./venues.mjs";
const t = JSON.parse(await (await import("node:fs/promises")).readFile("trading212/trading212-parsed.json", "utf8"));
const rows = t.instruments || t.rows || t;
const want = new Map();
for (const r of rows) {
  const { venue } = resolveVenue(r);
  if (venue?.source !== "euronext") continue;
  want.set(`${r.isin}|${venue.mic}`, { isin: r.isin, mic: venue.mic, type: r.type, name: r.name });
}
const list = [...want.values()];
console.log(`${list.length} cotations Euronext dans le catalogue Trading212`);

const seen = new Map();
let done = 0;
const work = async () => {
  for (;;) {
    const l = list.shift();
    if (!l) return;
    let rowsJ = [];
    for (let a = 0; a < 3 && !rowsJ.length; a++) {
      try {
        const r = await fetch(`https://live.euronext.com/en/instrumentSearch/searchJSON?q=${l.isin}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
        rowsJ = await r.json();
      } catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    for (const e of rowsJ) {
      const href = /href='([^']+)'/.exec(e.label)?.[1];
      if (!href) continue;
      const family = href.split("/")[3];
      const key = `${l.mic} demandé -> ${e.mic} ${family}`;
      const s = seen.get(key) || { n: 0, ex: [] };
      s.n++;
      if (s.ex.length < 2) s.ex.push(`${l.name} (${l.type})`);
      seen.set(key, s);
    }
    if (++done % 100 === 0) console.log(`  ${done} faites`);
  }
};
await Promise.all(Array.from({ length: 5 }, work));
console.log("\nce que la recherche renvoie :");
for (const [k, v] of [...seen].sort((a, b) => b[1].n - a[1].n)) console.log(String(v.n).padStart(5), k, "  ex:", v.ex.join(", ").slice(0, 60));
