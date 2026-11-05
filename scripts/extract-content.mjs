// Runs on a developer machine with pdftotext installed. Turns content/ (not in git) into
// data/knowledge/chunks.jsonl, which is committed and indexed on Railway.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CONTENT = "content";
const OUTPUT = "data/knowledge/chunks.jsonl";
const MIN_DOCUMENT_CHARS = 500;
const MIN_PAGE_CHARS = 40;
const CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 150;
const CONCURRENCY = 8;

const sha = (value) => createHash("sha1").update(value).digest("hex");

function listPdfs(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return listPdfs(path);
      return name.toLowerCase().endsWith(".pdf") ? [path] : [];
    })
    .sort();
}

function catalog() {
  const items = new Map();
  for (const file of ["juhendid/kataloog.json", "materjalid/kataloog.json"]) {
    const data = JSON.parse(readFileSync(join(CONTENT, file), "utf8"));
    for (const item of data.items) items.set(item.id, item);
  }
  return items;
}

function cleanPage(text) {
  return text
    .replace(/­\s*/g, "")
    // PostgreSQL text cannot hold NUL, and other control characters are PDF noise.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F�]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLong(text) {
  if (text.length <= CHUNK_CHARS) return [text];
  const parts = [];
  for (let start = 0; start < text.length; start += CHUNK_CHARS - OVERLAP_CHARS) {
    parts.push(text.slice(start, start + CHUNK_CHARS));
  }
  return parts;
}

function chunkPage(page) {
  const chunks = [];
  let current = "";
  let hasNewText = false;
  for (const paragraph of page.split(/\n\n+/).flatMap(splitLong)) {
    if (current && current.length + paragraph.length + 2 > CHUNK_CHARS) {
      chunks.push(current);
      current = current.slice(-OVERLAP_CHARS);
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
    hasNewText = true;
  }
  if (hasNewText && current.trim()) chunks.push(current);
  return chunks.filter((chunk) => chunk.trim().length >= MIN_PAGE_CHARS);
}

async function extractPages(path) {
  const { stdout } = await run("pdftotext", ["-q", "-enc", "UTF-8", path, "-"], {
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout.split("\f").map(cleanPage);
}

function factChunks() {
  const text = readFileSync(join(CONTENT, "teadmus/kinnitatud-faktid.md"), "utf8");
  return text
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [heading, ...lines] = block.split("\n");
      const id = heading.split(" ")[0];
      const body = lines.join("\n").split(/^## /m)[0].trim();
      const link = body.match(/\*\*Allikas:\*\*[^\n]*?\]\((https?:[^)\s]+)\)/);
      return {
        docId: id,
        manufacturer: "Kinnitatud fakt",
        title: heading.trim(),
        url: link?.[1] ?? null,
        page: null,
        language: "et",
        content: `${heading.trim()}\n${body}`,
      };
    });
}

async function main() {
  const items = catalog();
  const files = [
    ...listPdfs(join(CONTENT, "juhendid/failid")),
    ...listPdfs(join(CONTENT, "materjalid/failid")),
  ];

  const seen = new Set();
  const unique = files.filter((file) => {
    const hash = createHash("md5").update(readFileSync(file)).digest("hex");
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
  console.log(`${files.length} PDFs, ${files.length - unique.length} duplicates removed`);

  const results = new Array(unique.length);
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const index = next++;
      results[index] = await extractPages(unique[index]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const rows = [];
  let skipped = 0;
  unique.forEach((file, index) => {
    const pages = results[index];
    const docId = basename(file).split("_")[0];
    const item = items.get(docId);
    if (!item || pages.join("").length < MIN_DOCUMENT_CHARS) {
      skipped++;
      return;
    }
    pages.forEach((page, pageIndex) => {
      if (page.length < MIN_PAGE_CHARS) return;
      for (const content of chunkPage(page)) {
        rows.push({
          docId,
          manufacturer: item.manufacturer,
          title: item.title,
          url: item.url,
          page: pageIndex + 1,
          language: item.language,
          content,
        });
      }
    });
  });

  const all = [...rows, ...factChunks()].map((row) => ({
    id: sha(`${row.docId}|${row.page}|${row.content}`),
    ...row,
  }));
  const distinct = [...new Map(all.map((row) => [row.id, row])).values()];

  mkdirSync("data/knowledge", { recursive: true });
  writeFileSync(OUTPUT, `${distinct.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const chars = distinct.reduce((sum, row) => sum + row.content.length, 0);
  const docs = new Set(distinct.map((row) => row.docId)).size;
  console.log(`${docs} documents, ${skipped} skipped, ${distinct.length} chunks, ${chars} chars`);
}

await main();
