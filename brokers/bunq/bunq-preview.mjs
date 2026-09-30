// Reads bunq's order preview, the screen it shows between « Next » and « Buy ».
// It prints the fee and the transaction tax for the amount typed, which is the
// only place either is quoted before money moves — and it renders on an empty
// account, so the reading costs nothing.
//
// The final « Buy » is never clicked. The script types an amount, advances one
// screen, reads it, and leaves.
//
//   node bunq/bunq-preview.mjs IT0003132476 ES0113900J37 --amount=100
//
// Needs web.bunq.com signed in on the Chrome at 9222.

import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = (n, d = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split("=").slice(1).join("=") : d;
};

const AMOUNT = flag("amount", "100");
const ISINS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ISINS.length) {
  console.error("usage : node bunq/bunq-preview.mjs <ISIN…> [--amount=100]");
  process.exit(2);
}

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null, protocolTimeout: 180000 });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("web.bunq.com")) || (await browser.newPage());

const uid = (page.url().match(/user\/(\d+)/) || [])[1];
if (!uid) {
  console.error("web.bunq.com n'est pas connecté : ouvre-le et scanne le QR");
  process.exit(1);
}

// The summary is a flat list of labels followed by their values, so a field is
// read as the line after its label rather than by a selector that would break
// on the next redesign.
const after = (lines, label) => {
  const i = lines.findIndex((x) => x.toLowerCase() === label.toLowerCase());
  return i >= 0 && i + 1 < lines.length ? lines[i + 1] : null;
};

console.log(`montant ${AMOUNT} €\n`);
console.log("ISIN".padEnd(14), "valeur".padEnd(22), "frais".padEnd(10), "taxe".padEnd(10), "total");

for (const isin of ISINS) {
  try {
    await page.goto(`https://web.bunq.com/user/${uid}/stocks/${isin}/buy`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(7000);
    await page.click('input[name="amount"]', { clickCount: 3 }).catch(() => {});
    await page.keyboard.type(String(AMOUNT), { delay: 130 });
    await sleep(2200);
    await page.evaluate(() => {
      const e = [...document.querySelectorAll("button")].find((x) => /^Next$/i.test((x.innerText || "").trim()));
      if (e) e.click();
    });
    await sleep(7000);

    const lines = await page.evaluate(() => {
      const all = (document.body.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
      const i = all.findIndex((x) => /^Order Summary$/i.test(x));
      return i >= 0 ? all.slice(i, i + 22) : [];
    });

    if (!lines.length) {
      console.log(isin.padEnd(14), "(pas de récapitulatif)".padEnd(22));
      continue;
    }
    console.log(
      isin.padEnd(14),
      String(after(lines, "Stock") || "?").slice(0, 21).padEnd(22),
      String(after(lines, "Fees") || "?").padEnd(10),
      String(after(lines, "Financial Transaction Tax") || "0").padEnd(10),
      String(after(lines, "Total") || "?")
    );
  } catch (err) {
    console.log(isin.padEnd(14), `erreur : ${String(err.message).slice(0, 50)}`);
  }
}

await browser.disconnect();
