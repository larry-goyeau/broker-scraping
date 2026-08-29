// Three passes over a session, then the calibration. One snapshot of a book is a draw
// rather than a measurement — the same fund moved by a factor of 1.7 within a session,
// another by 3 — so the published figure is a median, and a median needs the script to
// come back. This runs it at the hours worth sampling and gets out of the way.
//
//   node spread-session.mjs                      -- 11h, 13h, 15h, heure de Paris
//   node spread-session.mjs --at=11:30,14:00
//   node spread-session.mjs --now                -- one pass immediately, then stop
//   node spread-session.mjs --jobs=6
//
// Launch it the evening before or the morning of: it waits for each hour by watching the
// clock rather than by sleeping through it, so a machine that suspends in between wakes
// up to the right schedule instead of drifting by however long it was out.
//
// Mid-session on purpose, though less critically than it used to be. Deutsche Börse's
// half-hourly figures, read across all 3 650 of its ETF lines, put the dearest half hour
// at the open, 1.15 times the day's average, and the cheapest over lunch at 0.92; the
// spread between them is 1.25 for the median fund but 1.94 for EUNL, which follows New
// York and widens by half after 15:30. These three hours land at 0.95, 0.92 and 1.00 of
// the day, so left alone they would publish a cost slightly below the day's.
//
// `spread.mjs` now divides each reading by its own half hour's multiple, so the hour a
// pass runs at matters much less than the number of passes. What is still worth avoiding
// is running two at once: each pass opens its own tabs, and three overlapping passes at
// six, ten and four tabs is what once had Boerse Frankfurt answering 503 to everything.

import fs from "node:fs";
import { spawn } from "node:child_process";
import { catalogueFiles } from "./catalogues.mjs";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (m) return m[1];
  }
  return "";
};
const NOW_ONLY = process.argv.includes("--now");
const JOBS = Number(arg("jobs") || 4);
const SLOTS = (arg("at") || "11:00,13:00,15:00").split(",").map((s) => s.trim());
const STATE_PATH = "parsed_json/.spread-session.json";

// Paris rather than the machine's zone: the hours that matter are the exchanges', and
// three of the four places keep them. Compared as wall-clock minutes so that a suspend,
// a resume or a daylight-saving change cannot move a slot.
const SESSION_END = 17 * 60 + 30;
const parisNow = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    clock: `${String(Number(parts.hour) % 24).padStart(2, "0")}h${parts.minute}`,
  };
};
const asMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

// Which slots have already run, so relaunching after a crash or a closed laptop resumes
// instead of starting over. Keyed by date: tomorrow the same slots are due again.
const done = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) : {};
const markDone = (date, slot) => {
  (done[date] ||= []).push(slot);
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(done, null, 2));
};

// Every catalogue at once. A place's book is the same book whichever broker sells it, so
// pricing it once for all of them is both cheaper and the only way the figures stay
// consistent between brokers.
const rows = catalogueFiles().join(",");

const run = (script, args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });

const pass = () => run("spread.mjs", [`--rows=${rows}`, `--jobs=${JOBS}`]);

// Euronext decrypts its quotes in the page, so that quarter of the work needs the
// browser this connects to. Said once, at the start, rather than discovered as 824
// identical failures three hours in.
async function browserReady() {
  try {
    const res = await fetch("http://127.0.0.1:9222/json/version", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

if (!(await browserReady())) {
  console.error(
    "Chrome n'écoute pas sur 127.0.0.1:9222 : Euronext (824 cotations) échouera, les autres places passeront.\n" +
      "  Pour l'ouvrir : Chrome --remote-debugging-port=9222\n"
  );
}

if (NOW_ONLY) {
  process.exit(await pass());
}

console.error(
  `passes prévues à ${SLOTS.join(", ")} (Paris), ${rows.split(",").length} catalogues, ${JOBS} en parallèle.\n` +
    `Il est ${parisNow().clock}.\n`
);

for (const slot of SLOTS) {
  const target = asMinutes(slot);
  let announced = "";
  for (;;) {
    const now = parisNow();
    if ((done[now.date] || []).includes(slot)) {
      console.error(`${slot} : déjà fait le ${now.date}, passé`);
      break;
    }
    // Past the hour and the session still open: run, including several slots in a row
    // when the script starts mid-afternoon and has catching up to do.
    if (now.minutes >= target && now.minutes <= SESSION_END) {
      console.error(`\n===== passe de ${slot}, lancée à ${now.clock} =====\n`);
      const code = await pass();
      markDone(now.date, slot);
      if (code !== 0) console.error(`la passe de ${slot} est sortie en ${code}`);
      break;
    }
    // Otherwise the slot is still to come — later today, or after midnight when the
    // script was started in the evening. Waiting rather than declaring it missed is
    // what makes launching the night before work at all.
    const when = now.minutes > SESSION_END ? "demain" : "aujourd'hui";
    if (announced !== when) {
      console.error(`${slot} : attente de ${when}, il est ${now.clock}`);
      announced = when;
    }
    // Polled rather than slept through, so the wait survives a suspended machine.
    await new Promise((r) => setTimeout(r, 30000));
  }
}

console.error("\n===== calibration =====\n");
await run("spread-calibrate.mjs", ["--min-readings=2"]);
