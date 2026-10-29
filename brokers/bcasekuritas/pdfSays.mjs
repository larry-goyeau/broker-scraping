// Reads a broker's PDF (a RIPLAY product summary, an account-opening form)
// as plain text and stops the run when a sentence the catalogue or the fee
// rests on is gone. The PDF-side twin of ../bajaj/pageSays.mjs, used by the
// Indonesian scrapers whose fee is only printed in a PDF (BCA Sekuritas,
// MNC Sekuritas, Yugen). The text comes from python3's pypdf, as in
// ../airbank/airbank_scraping.mjs; runs of spaces and line breaks are
// folded to one space before the patterns are tried.
//
//   import { pdfSays } from "../bcasekuritas/pdfSays.mjs";
//   const text = await pdfSays(url, [/Online Trading Beli\/Buy : 0,1815%/i]);

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pdfBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/pdf,*/*" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} is not a PDF`);
        return bytes;
      }
      last = `${url} answered ${response.status}`;
    } catch (error) {
      if (/is not a PDF/.test(error.message)) throw error;
      last = `${url}: ${error.message}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

export function pdfText(bytes) {
  const file = path.join(os.tmpdir(), `pdfsays-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(file, bytes);
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "sys.stdout.write('\\n'.join((page.extract_text() or '') for page in reader.pages))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(result.stderr || "python3 could not read the PDF (pypdf)");
  return result.stdout.replace(/\s+/g, " ");
}

export async function pdfSays(url, patterns) {
  const text = pdfText(await pdfBytes(url));
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  return text;
}
