#!/usr/bin/env node
// Audit agent docs for drift against the real codebase.
//
// Scope (in this order):
//   - CLAUDE.md
//   - .claude/rules/*.md
//   - .claude/skills/**/SKILL.md
//
// Checks:
//   1. Backtick-wrapped paths that look like real repo paths but don't exist on
//      disk. Heuristic: the first segment of the path must be an entry that
//      exists at the repo root (so placeholders like `path/to/file.spec.ts`
//      are ignored, but typos like `src/auth/missing.ts` are caught).
//   2. PascalCase identifiers ending in Service|Controller|Module|Guard|
//      Strategy|Filter|Interceptor|Dto|Response|Provider that don't appear
//      anywhere in `src/**/*.ts`. The src corpus includes import statements,
//      so identifiers from external packages (e.g. `JwtService`) are found.
//
// `auditIgnore` from .claude/doc-mappings.json is consulted for backtick paths.
// Exit code is non-zero if any issue is found.

import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const QUIET = args.has("--quiet");

const cwd = process.cwd();
const MAPPING = path.join(cwd, ".claude", "doc-mappings.json");
let auditIgnore = [];
if (fs.existsSync(MAPPING)) {
  try {
    auditIgnore = JSON.parse(fs.readFileSync(MAPPING, "utf8")).auditIgnore || [];
  } catch (e) {
    console.error(`audit-docs: failed to parse ${MAPPING}: ${e.message}`);
    process.exit(2);
  }
}

const isIgnored = (p) =>
  auditIgnore.some((i) => {
    if (i.endsWith("/")) return p === i.slice(0, -1) || p.startsWith(i);
    return p === i;
  });

// Top-level repo entries — first segment of a backtick path must be one of these.
const TOP_LEVEL = new Set(fs.readdirSync(cwd));

function* walk(dir, pred) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "coverage" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, pred);
    else if (pred(full)) yield full;
  }
}

// Collect doc files
const docFiles = [];
if (fs.existsSync("CLAUDE.md")) docFiles.push("CLAUDE.md");
for (const f of walk(".claude/rules", (p) => p.endsWith(".md"))) docFiles.push(f);
for (const f of walk(".claude/skills", (p) => p.endsWith("SKILL.md"))) docFiles.push(f);

// Build src corpus once. Imports preserve external identifier names verbatim,
// so this catches both project classes and third-party imports.
let srcText = "";
for (const f of walk("src", (p) => p.endsWith(".ts"))) {
  srcText += "\n" + fs.readFileSync(f, "utf8");
}

const BACKTICK_RE = /`([^`\n]+)`/g;
const SUFFIX_RE =
  /\b([A-Z][A-Za-z0-9]*(?:Service|Controller|Module|Guard|Strategy|Filter|Interceptor|Dto|Response|Provider))\b/g;

const issues = [];
let backtickPathsChecked = 0;
let identifiersChecked = 0;

function looksLikeRepoPath(s) {
  if (!s) return false;
  if (s.startsWith("http://") || s.startsWith("https://")) return false;
  if (s.startsWith("/")) return false;
  if (/[\s$()?,{}]/.test(s)) return false;
  if (s.startsWith("-")) return false;
  if (s.includes("*")) return false;
  const head = s.split("/")[0];
  return TOP_LEVEL.has(head);
}

for (const file of docFiles) {
  const txt = fs.readFileSync(file, "utf8");

  // 1. Backtick paths
  BACKTICK_RE.lastIndex = 0;
  let m;
  while ((m = BACKTICK_RE.exec(txt)) !== null) {
    const raw = m[1].trim();
    if (!looksLikeRepoPath(raw)) continue;
    // Strip optional line anchor: file.ts:42 or file.ts#L42
    const cleaned = raw.replace(/[:#].*$/, "");
    if (isIgnored(cleaned)) continue;
    backtickPathsChecked++;
    if (!fs.existsSync(cleaned)) {
      issues.push(`${file}: backtick path \`${raw}\` does not exist on disk`);
    }
  }

  // 2. PascalCase identifiers with known Nest-ish suffix
  SUFFIX_RE.lastIndex = 0;
  const seen = new Set();
  while ((m = SUFFIX_RE.exec(txt)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    identifiersChecked++;
    // Word-boundary scan in srcText to avoid substring false positives
    const re = new RegExp(`\\b${id}\\b`);
    if (!re.test(srcText)) {
      issues.push(`${file}: identifier ${id} not referenced anywhere in src/`);
    }
  }
}

if (issues.length === 0) {
  if (!QUIET) {
    console.log(
      `audit-docs: clean (${docFiles.length} docs, ${backtickPathsChecked} backtick paths, ${identifiersChecked} identifiers checked)`,
    );
  }
  process.exit(0);
}

console.error(`audit-docs: ${issues.length} issue(s) found:`);
for (const i of issues) console.error("  - " + i);
process.exit(1);
