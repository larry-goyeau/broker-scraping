// Fills the order ticket that BoursoBank embeds in a quote page and stops on
// the confirmation panel, the only screen where it prints the all-in fee for
// the order it is about to send. Reading it settles what the brochure leaves
// implicit: the foreign card's ticket, the conversion margin on a non-euro
// line, and whether an ETF is a Boursomarkets product and so free on the buy.
//
// The TradingBoard carries the same ticket but pins it to the instrument of
// its own module, so a quote page is the way to aim it at a chosen line.
//
// The order is a limit far BELOW the last price: a buy limit above the market
// is not a probe but an order that fills, and BoursoBank refuses it outright.
// Nothing is sent either way — this clicks « Valider » once to reach the recap
// and stops. « Confirmer » is never clicked.
//
//   node boursobank/bourso-ticket.mjs --sym=MEDP --qty=3 --limit=75
//   node boursobank/bourso-ticket.mjs --sym=1rTCC4 --qty=40 --limit=5

import puppeteer from "puppeteer-core";

const flag = (n, d = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split("=").slice(1).join("=") : d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYM = flag("sym");
let QTY = flag("qty");
let LIMIT = flag("limit");
// `--target=` sizes the ticket from the last price instead of by hand: the
// limit lands well under the market and the quantity brings the order to the
// amount asked, which is how the 200 € floor on an ETF gets cleared.
const TARGET = flag("target") ? Number(flag("target")) : null;
const ATP = process.argv.includes("--atp");
if (!SYM || (!TARGET && !QTY) || (!ATP && !TARGET && !LIMIT)) {
  console.error("usage : node boursobank/bourso-ticket.mjs --sym=MEDP --qty=3 --limit=75\n" +
    "        node boursobank/bourso-ticket.mjs --sym=1rTCC4 --target=210");
  process.exit(2);
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
  protocolTimeout: 180000,
});
const page = await browser.newPage();

// Typed, not assigned. Writing to `.value` and firing an input event leaves the
// field marked invalid on some listings — the widget only trusts real keys.
async function setInput(name, value) {
  const sel = `input[name="${name}"]`;
  if (!(await page.$(sel))) return false;
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(String(value), { delay: 110 });
  return true;
}

const ticket = () =>
  page.evaluate(() => {
    const h = [...document.querySelectorAll("*")].find((x) => /^PASSAGE D.ORDRE$/i.test((x.innerText || "").trim()));
    if (!h) return { err: "ticket introuvable" };
    let box = h;
    for (let i = 0; i < 10 && box.parentElement; i++) {
      box = box.parentElement;
      if ((box.innerText || "").length > 300) break;
    }
    return {
      txt: (box.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean),
      fields: [...box.querySelectorAll("input,select")].map((e) => `${e.name}=${String(e.value).slice(0, 22)}`),
      buttons: [...box.querySelectorAll("button")].map((e) => (e.innerText || "").trim()).filter(Boolean),
    };
  });

try {
  await page.goto(`https://bourse.boursobank.com/cours/${SYM}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(7000);

  // The quote element, not the page text: a « valeurs consultées » widget sits
  // higher up and its price would be read instead.
  const head = await page.evaluate(() => {
    const el = document.querySelector(".c-instrument--last, [data-ist-last]");
    const face = document.querySelector(".c-faceplate__price");
    return {
      titre: document.title.slice(0, 90),
      dernier: el ? (el.getAttribute("data-ist-last") || el.innerText || "").trim() : null,
      devise: face ? (face.innerText || "").trim().slice(0, 24) : null,
    };
  });
  console.log("valeur  :", head.titre);
  console.log("dernier :", head.dernier);

  if (TARGET) {
    const last = Number(String(head.dernier || "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!(last > 0)) throw new Error(`cours illisible pour ${SYM} : ${head.dernier}`);
    LIMIT = (last * 0.93).toFixed(2);
    QTY = String(Math.max(1, Math.ceil(TARGET / Number(LIMIT))));
    const amount = QTY * Number(LIMIT);
    console.log(`taille  : ${QTY} × ${LIMIT} = ${amount.toFixed(2)} (limite 7 % sous le marché)`);
    if (amount > 245) console.log(`  attention : ${amount.toFixed(2)} dépasse la provision, le ticket sera refusé`);
  }

  const opened = await page.evaluate(() => {
    const e = [...document.querySelectorAll("a,button")].find((x) => (x.innerText || "").trim().toUpperCase() === "ACHETER");
    if (!e) return false;
    e.click();
    return true;
  });
  console.log("formulaire d'achat ouvert :", opened);
  await sleep(8000);

  // Some listings refuse a limit whatever its value, and then the market type is
  // the only way to reach the recap. It is no riskier here: the screen is the
  // stop either way, and « Confirmer » is never clicked.
  const kind = ATP ? "ATP" : "LIM";
  await page.select('select[name="orderType"]', kind).catch(() => {});
  await sleep(1200);
  await setInput("orderQuantity", QTY);
  await sleep(900);
  if (!ATP) {
    await setInput("orderPriceLimit", LIMIT);
    await sleep(2500);
  }

  const before = await ticket();
  console.log("\n=== ticket rempli ===");
  console.log("champs :", before.fields?.join("  "));

  console.log("\n>>> clic unique sur « Valider » — rien n'est envoyé");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Valider$/i.test((x.innerText || "").trim()));
    if (b) b.click();
  });
  await sleep(9000);

  const after = await ticket();
  console.log("\n=== écran obtenu ===");
  console.log("boutons (non cliqués) :", [...new Set(after.buttons || [])].join(" | "));
  for (const t of after.txt || []) console.log("  ", t.slice(0, 110));
} finally {
  await page.close();
  await browser.disconnect();
}
