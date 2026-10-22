// What Tunisie Valeurs sells in shares, with no login. The broker's
// book is the Bourse de Tunis. It prints the whole share board each
// trading day in its "Physionomie" PDF: one line per share, in the
// continuous group and the fixing group ("Hors Continu"). The PDF gives
// names and prices only, so the rows come from the exchange's own
// referential, which gives the ticker and the ISIN. The four BVMT share
// groups are read: 11 (continuous), 12, 13 and 99 (fixing). The
// number of shares must equal the number of lines in the latest PDF.
// The PDF still prints suspended shares, so that count is taken on the
// whole board. Then the shares whose board status is "S" (quotation
// suspended by the exchange or the CMF) are dropped; "R" (reserved:
// price limit hit) is intraday only and stays. Any other status code
// stops the run. The bond (21) and rights (32) groups stay out. BVMT
// lists no ETF in any group. Every row is quoted in dinars. Fees: brokerage 0.80% a
// trade on the tariff page.
// The PDF text is read with PyMuPDF (`python3 -c "import fitz"`).
//
//   https://www.tunisievaleurs.com/nos-conditions-tarifaires/
//   https://www.tunisievaleurs.com/nos-publications/physionomie/
//   https://data.tunisievaleurs.com/ww2_publications.aspx?l=F&s=1000&t=f
//   https://www.tunisievaleurs.com/fr/physionomie/YYYYMMDD.pdf
//   https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99
//
//   node brokers/tunisievaleurs/tunisievaleurs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const INDEX = "https://data.tunisievaleurs.com/ww2_publications.aspx?l=F&s=1000&t=f";
const PDF = (date) => `https://www.tunisievaleurs.com/fr/physionomie/${date}.pdf`;
const BOARD = "https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99";
const GROUPS = new Set(["11", "12", "13", "99"]);
// Board statuses: blank trading, R reserved, S suspended.
const STATUSES = new Set(["", "R", "S"]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function get(url, encoding = "utf8") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "60", "-A", UA, url], { maxBuffer: 32_000_000, encoding });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

// The index lists the publication dates, newest first. A day can be
// announced before its file is up, so the next dates are tried.
async function latestPdf() {
  const dates = [...(await get(INDEX)).matchAll(/<Date>(\d{8})<\/Date>/g)].map((match) => match[1]);
  if (dates.length < 20) throw new Error(`Physionomie index printed ${dates.length} dates`);
  for (const date of dates.slice(0, 3)) {
    try {
      const bytes = await get(PDF(date), "buffer");
      if (bytes.subarray(0, 5).toString() === "%PDF-") return { date, bytes };
    } catch {}
  }
  throw new Error(`no Physionomie PDF for ${dates.slice(0, 3).join(", ")}`);
}

// Each share line has one day-change cell (+1,58%) in the board column.
// The summary boxes above the board hold changes too, so only cells below
// the "Variation" header and in its column are counted.
function pdfShareLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, re, sys
import fitz

doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
out = {"pages": len(doc), "header": None, "lines": 0}
for page in doc:
    words = page.get_text("words")
    head = [w for w in words if w[4] == "Variation"]
    if not head:
        continue
    head = head[0]
    out["header"] = [head[0], head[1]]
    for w in words:
        if w[1] > head[3] and abs(w[0] - head[0]) < 30 and re.fullmatch(r"[+-]\\d+,\\d\\d%", w[4]):
            out["lines"] += 1
json.dump(out, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 16 * 1024 * 1024 }
  );
  if (python.status !== 0) {
    const detail = python.stderr?.toString() || "";
    throw new Error(
      detail.includes("No module named 'fitz'")
        ? "PyMuPDF is missing: pip install pymupdf"
        : `Could not read the Physionomie PDF${detail ? `: ${detail.trim()}` : ""}`
    );
  }
  const result = JSON.parse(python.stdout.toString("utf8"));
  if (!result.header) throw new Error("Physionomie PDF has no Variation column");
  if (result.lines < 60) throw new Error(`Physionomie PDF printed ${result.lines} shares`);
  return result.lines;
}

function tunisShares(json) {
  const rows = JSON.parse(json)?.markets;
  if (!Array.isArray(rows) || rows.length < 60) throw new Error(`BVMT printed ${rows?.length ?? 0} shares`);
  const listings = [];
  const seen = new Set();
  for (const row of rows) {
    const ref = row.referentiel || {};
    const group = String(ref.valGroup || "").trim();
    if (!GROUPS.has(group)) throw new Error(`${ref.ticker} is in group ${group || "unmarked"}, not a share group`);
    const ticker = String(ref.ticker || "").trim().toUpperCase();
    const isin = String(ref.isin || row.isin || "").trim().toUpperCase();
    const name = String(ref.stockName || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(ref.ticker)}`);
    if (!/^TN[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    const status = String(row.status ?? "").trim().toUpperCase();
    if (!STATUSES.has(status)) throw new Error(`BVMT board gives ${ticker} status ${JSON.stringify(row.status)}, unknown to this scraper`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    listings.push({
      query: ticker,
      ticker,
      name,
      exchange: "Tunis",
      currency: "TND",
      type: "STOCK",
      isin,
      mic: "XTUN",
      status,
      raw: [ticker, name, "Tunis", isin, `group ${group}`, "STOCK"].join(" "),
    });
  }
  listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return listings;
}

const { date, bytes } = await latestPdf();
const lines = pdfShareLines(bytes);
const all = tunisShares(await get(BOARD));
if (all.length !== lines) {
  throw new Error(`BVMT has ${all.length} shares, the Physionomie of ${date} prints ${lines}`);
}
const suspended = all.filter((row) => row.status === "S").map((row) => row.ticker);
const listings = all.filter((row) => row.status !== "S").map(({ status, ...row }) => row);
fs.writeFileSync(new URL("tunisievaleurs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
console.error(
  `${listings.length} listings (${listings.length} STOCK, Tunis ${listings.length}; Physionomie ${date}); ` +
    `dropped ${suspended.length} suspended (BVMT status S: ${suspended.join(",") || "-"})`
);
