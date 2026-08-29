// Where the brokers' catalogues live, now that each broker owns a folder and keeps its own
// file in it. One place to say so, because two scripts need to walk them — `spread.mjs` to
// know which listings to price, `spread-calibrate.mjs` to put a ticker beside an ISIN — and a
// layout described twice is a layout that will be described differently after the next move.
//
// The convention is the one the scrapers already follow: a folder per broker at the top level,
// holding `<broker>-parsed.json`. Anything shared by all of them — the order books, the German
// workbook, the American reports — stays in `parsed_json/` and is not a catalogue.

import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("./", import.meta.url);

// Folders that hold no broker: the shared data, the version control, the dependencies.
const NOT_A_BROKER = new Set(["parsed_json", "node_modules", ".git", ".cursor"]);

// Every catalogue on disk, as absolute paths, sorted so a run reads them in the same order
// twice. A folder without one is a broker whose scraper has never been run, which is normal
// and not worth reporting from here.
export function catalogueFiles() {
  const found = [];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || NOT_A_BROKER.has(entry.name) || entry.name.startsWith(".")) continue;
    const folder = new URL(`${entry.name}/`, ROOT);
    for (const file of fs.readdirSync(folder)) {
      if (file.endsWith("-parsed.json")) found.push(path.join(folder.pathname, file));
    }
  }
  return found.sort();
}

// The rows of every catalogue at once, each tagged with the broker whose folder it came from,
// for whoever wants the union rather than the files.
export function catalogueRows() {
  const rows = [];
  for (const file of catalogueFiles()) {
    const broker = path.basename(path.dirname(file));
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const row of Array.isArray(parsed) ? parsed : parsed.rows || []) rows.push({ ...row, broker });
  }
  return rows;
}
