#!/usr/bin/env bash
# Enforces the source-↔-test coverage policy from .claude/skills/pre-commit/SKILL.md.
#
# Usage:
#   scripts/check-test-coverage.sh [base-ref]
#       Inspects `git diff --name-only --diff-filter=ACMR <base>...HEAD`.
#       <base> defaults to `main`.
#
# Policy:
#   If the diff touches any of
#     - src/**/*.ts (excluding *.spec.ts)
#     - prisma/schema.prisma
#     - prisma/migrations/**/*.sql
#   then at least one of these must also be in the diff:
#     - src/**/*.spec.ts
#     - test/e2e/**/*.ts
#   Otherwise we exit 1 and print the offending source files.
#
# This script does not run any tests; it only checks the diff shape. Combine it
# with scripts/run-related-tests.sh in pre-push.

set -euo pipefail

BASE="${1:-main}"
if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "check-test-coverage: base ref '$BASE' not found." >&2
  exit 2
fi

DIFF_FILES=$(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD)

if [ -z "$DIFF_FILES" ]; then
  echo "check-test-coverage: no changes vs $BASE, nothing to check."
  exit 0
fi

SOURCE_FILES=()
TEST_FILES=()

while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Test files (count toward coverage)
  if echo "$f" | grep -Eq '^src/.*\.spec\.ts$'; then
    TEST_FILES+=("$f")
    continue
  fi
  if echo "$f" | grep -Eq '^test/e2e/.*\.ts$'; then
    TEST_FILES+=("$f")
    continue
  fi
  # Source files (require a test change)
  if echo "$f" | grep -Eq '^src/.*\.ts$'; then
    SOURCE_FILES+=("$f")
    continue
  fi
  if [ "$f" = "prisma/schema.prisma" ]; then
    SOURCE_FILES+=("$f")
    continue
  fi
  if echo "$f" | grep -Eq '^prisma/migrations/.*\.sql$'; then
    SOURCE_FILES+=("$f")
    continue
  fi
done <<< "$DIFF_FILES"

if [ ${#SOURCE_FILES[@]} -eq 0 ]; then
  echo "check-test-coverage: no covered source changes vs $BASE."
  exit 0
fi

if [ ${#TEST_FILES[@]} -gt 0 ]; then
  echo "check-test-coverage: OK — ${#SOURCE_FILES[@]} source file(s) and ${#TEST_FILES[@]} test file(s) changed."
  exit 0
fi

echo "check-test-coverage: FAIL — source files changed without a matching *.spec.ts or test/e2e/**/*.ts change:" >&2
printf '  %s\n' "${SOURCE_FILES[@]}" >&2
echo "" >&2
echo "Add a unit spec next to the source, an e2e in test/e2e/, or document an explicit waiver in the commit body (e.g. 'Refactor: no behavior change')." >&2
exit 1
