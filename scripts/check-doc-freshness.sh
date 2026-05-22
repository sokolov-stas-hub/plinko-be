#!/usr/bin/env bash
# Verify that .claude/rules, .claude/skills, docs/modules, and .claude/doc-mappings.json
# still match the real code.
#
# Usage:
#   scripts/check-doc-freshness.sh [base-ref]    # default base: main
#
# Checks (in order):
#   1. Mapping integrity — every source/doc/skill/rule path in
#      .claude/doc-mappings.json exists on disk.
#   2. Rule frontmatter sanity — each .claude/rules/*.md has a YAML
#      `paths:` block, and the static prefix of every glob resolves to a
#      real directory.
#   3. CLAUDE.md size — warn if it grows past CLAUDE_MD_MAX_LINES.
#   4. Diff freshness — for each changed source file vs base, print the
#      docs/skills/rules the agent must re-read. Files under
#      docs/superpowers/{plans,specs}/ only emit a warning (this repo treats
#      them as durable project history; see Фаза 9 of the ai-workflow plan).
#   5. Doc audit — `node scripts/audit-docs.mjs --check` if Node is on PATH.
#
# Errors fail the script (exit 1). Warnings are reported but do not block.

set -euo pipefail

BASE="${1:-main}"
MAPPING=".claude/doc-mappings.json"
RULES_DIR=".claude/rules"
CLAUDE_MD="CLAUDE.md"
CLAUDE_MD_MAX_LINES=300
AUDIT_SCRIPT="scripts/audit-docs.mjs"

ERR=0
WARN=0

if [ ! -f "$MAPPING" ]; then
  echo "doc-freshness: ERROR — mapping file $MAPPING is missing" >&2
  exit 1
fi
if ! command -v node >/dev/null; then
  echo "doc-freshness: ERROR — node is required to parse $MAPPING" >&2
  exit 1
fi

# --- 1. Mapping integrity ----------------------------------------------------

if ! node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync(".claude/doc-mappings.json","utf8"));
  let errs = 0;
  const check = (p, role) => {
    if (p.endsWith("/")) {
      if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
        console.error(`  ${role}: missing directory ${p}`); errs++;
      }
    } else if (!fs.existsSync(p)) {
      console.error(`  ${role}: missing file ${p}`); errs++;
    }
  };
  for (const section of ["docs","skills","rules"]) {
    for (const [src, targets] of Object.entries(m[section]||{})) {
      check(src, `${section} source`);
      for (const t of targets) check(t, `${section} target`);
    }
  }
  for (const p of m.introOnlyDocs||[]) check(p, "introOnlyDocs");
  if (errs > 0) {
    console.error(`doc-freshness: mapping integrity FAILED (${errs} issue(s))`);
    process.exit(1);
  }
'; then
  ERR=$((ERR + 1))
fi

# --- 2. Rule frontmatter sanity ---------------------------------------------

if [ -d "$RULES_DIR" ]; then
  for f in "$RULES_DIR"/*.md; do
    [ -f "$f" ] || continue
    if ! node -e '
      const fs = require("fs");
      const file = process.argv[1];
      const txt = fs.readFileSync(file,"utf8");
      const fmMatch = txt.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) { console.error(`  ${file}: no YAML frontmatter`); process.exit(1); }
      const fm = fmMatch[1];
      const pathsMatch = fm.match(/paths:\s*\n((?:\s+-\s+.*\n?)+)/);
      if (!pathsMatch) { console.error(`  ${file}: no block-style paths: in frontmatter`); process.exit(1); }
      const globs = pathsMatch[1].split("\n").map(l => {
        const mm = l.match(/^\s+-\s+[\x27"]?([^\x27"]+?)[\x27"]?\s*$/);
        return mm ? mm[1].trim() : null;
      }).filter(Boolean);
      if (globs.length === 0) { console.error(`  ${file}: paths: list is empty`); process.exit(1); }
      let bad = 0;
      for (const g of globs) {
        // Strip first glob token onward to find a static prefix
        const staticPart = g.split(/[\*\?\[]/, 1)[0].replace(/\/$/,"");
        const dir = staticPart.includes("/") ? staticPart.split("/").slice(0,-1).join("/") : ".";
        if (dir && !fs.existsSync(dir)) {
          console.error(`  ${file}: glob ${g} -> base dir ${dir} does not exist`);
          bad++;
        }
      }
      process.exit(bad > 0 ? 1 : 0);
    ' "$f"; then
      ERR=$((ERR + 1))
    fi
  done
fi

# --- 3. CLAUDE.md size -------------------------------------------------------

if [ -f "$CLAUDE_MD" ]; then
  LINES=$(wc -l < "$CLAUDE_MD" | tr -d ' ')
  if [ "$LINES" -gt "$CLAUDE_MD_MAX_LINES" ]; then
    echo "doc-freshness: WARN — $CLAUDE_MD is $LINES lines (max $CLAUDE_MD_MAX_LINES); move subsystem detail into .claude/rules/." >&2
    WARN=$((WARN + 1))
  fi
fi

# --- 4. Diff freshness -------------------------------------------------------

if git rev-parse --verify --quiet "$BASE" >/dev/null; then
  DIFF=$(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD || true)
  if [ -n "$DIFF" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue

      # superpowers/{plans,specs} — warn only (durable project history)
      if echo "$f" | grep -Eq '^docs/superpowers/(plans|specs)/'; then
        echo "doc-freshness: WARN — $f is project history; agents must verify it is still applicable before relying on it." >&2
        WARN=$((WARN + 1))
        continue
      fi

      # Print the docs/skills/rules that the mapping says should be re-read.
      MATCHED=$(node -e '
        const fs = require("fs");
        const m = JSON.parse(fs.readFileSync(".claude/doc-mappings.json","utf8"));
        const file = process.argv[1];
        const targets = new Set();
        for (const section of ["docs","skills","rules"]) {
          for (const [src, ts] of Object.entries(m[section]||{})) {
            const hit = src.endsWith("/") ? file.startsWith(src) : file === src;
            if (hit) ts.forEach(t => targets.add(section.padEnd(6," ") + " " + t));
          }
        }
        for (const t of [...targets].sort()) console.log(t);
      ' "$f")

      if [ -n "$MATCHED" ]; then
        echo "doc-freshness: $f → re-read:"
        echo "$MATCHED" | sed 's/^/    /'
      fi
    done <<< "$DIFF"
  fi
else
  echo "doc-freshness: WARN — base ref '$BASE' not found; skipping diff freshness check." >&2
  WARN=$((WARN + 1))
fi

# --- 5. Doc audit ------------------------------------------------------------

if [ -f "$AUDIT_SCRIPT" ]; then
  if ! node "$AUDIT_SCRIPT" --check; then
    ERR=$((ERR + 1))
  fi
fi

# --- Summary ----------------------------------------------------------------

if [ "$ERR" -gt 0 ]; then
  echo "doc-freshness: FAIL ($ERR error(s), $WARN warning(s))." >&2
  exit 1
fi
echo "doc-freshness: OK ($WARN warning(s))."
exit 0
