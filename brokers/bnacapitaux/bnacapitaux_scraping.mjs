// What BNA Capitaux (the Banque Nationale Agricole's broker on the Bourse
// de Tunis) sells in shares, with no login. Its site says it "Offre un
// service de bourse en ligne permettant le passage d'ordres en temps réel
// et en toute sécurité" (BNAC On Line, bnac-online.com.tn, and the BNAC
// app: "Le passage des commandes en ligne : achat/vente", on "la bourse de
// Tunis (BVMT)"). The account-opening form offers an "Abonnement courtage
// en ligne". No page names a list or leaves out a group, so the book is
// every share of the Bourse de Tunis (./bvmtBook.mjs: groups 11, 12, 13
// and 99, without lines whose quotation is suspended; bonds and rights are
// other groups). The BVMT lists no ETF. Every row is quoted in dinars.
// broker-list.json gives the same single place.
//
// Fees: the account convention the site generates (article 5,
// "Rémunération de l'Intermédiaire", "Commissions HT"): "Commission de
// Courtage 0,8% min 0,500 dt", "Frais de Tenue de Compte 0.15% / 20,000 dt
// minimum", "Encaissement de coupons - Titre de capital (actions) 0.2% min
// 0.500 dt". The site is an Angular app: the convention text sits in one
// of its scripts, which are searched at run time (the https certificate
// does not match the host, so the site is read over http).
//
//   http://www.bnacapitaux.com.tn/ (offer; fees in the account convention)
//   https://www.bnac-online.com.tn/
//   https://play.google.com/store/apps/details?id=com.nas.mmc.bnac
//   https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99
//
//   node brokers/bnacapitaux/bnacapitaux_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bvmtBook } from "./bvmtBook.mjs";
import fs from "node:fs";

const SITE = "http://www.bnacapitaux.com.tn/";
const PLAY = "https://play.google.com/store/apps/details?id=com.nas.mmc.bnac&hl=fr";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function text(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

// Every script the app loads, starting from its index page.
async function siteScripts() {
  const queue = [...new Set((await text(SITE)).match(/(?:main|chunk)-[A-Z0-9]+\.js/g) || [])];
  const scripts = new Map();
  while (queue.length && scripts.size < 200) {
    const name = queue.shift();
    if (scripts.has(name)) continue;
    const body = await text(SITE + name);
    scripts.set(name, body);
    for (const next of body.match(/chunk-[A-Z0-9]+\.js/g) || []) if (!scripts.has(next)) queue.push(next);
  }
  return [...scripts.values()].join("\n").replace(/\\xE9/g, "é").replace(/\\xE8/g, "è").replace(/\\u2019/g, "'");
}

const site = await siteScripts();
for (const pattern of [
  /Offre un service de bourse en ligne permettant le passage d'ordres/,
  /Abonnement courtage en ligne/,
  /text:"Commission de Courtage",bold:!0\},"0,8% min 0,500 dt"/,
]) {
  if (!pattern.test(site)) throw new Error(`the BNA Capitaux site no longer says ${pattern}`);
}
const play = await text(PLAY);
if (!/passage des commandes en ligne/.test(play) || !/BVMT/.test(play)) throw new Error("the BNAC app page no longer sells online orders on the BVMT");

const { rows, suspended, byGroup } = await bvmtBook();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bnacapitaux-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
console.error(`${kept.length} listings (${kept.length} STOCK, Tunis ${kept.length}; groups ${JSON.stringify(byGroup)}); suspended left out: ${suspended.join(", ") || "none"}`);
