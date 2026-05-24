#!/usr/bin/env bash
# Diff-aware test runner for plinko-be.
#
# Usage:
#   scripts/run-related-tests.sh staged
#       Inspects `git diff --cached --name-only --diff-filter=ACMR`.
#   scripts/run-related-tests.sh push [base-ref]
#       Inspects `git diff --name-only --diff-filter=ACMR <base>...HEAD`.
#       <base> defaults to `origin/main`, falls back to `HEAD~1` if origin/main
#       can't be resolved.
#
# Behaviour, in order:
#   1. If any "global trigger" file is in the diff (build config / schema), run
#      the full unit suite via `npm test`. The flag also short-circuits the
#      per-file pass, since `npm test` covers everything.
#   2. For changed src/** or test/** TS/JS files that are NOT e2e specs, run
#      `npm test -- --findRelatedTests <files>`.
#   3. If any `test/e2e/*.e2e-spec.ts` file changed, run `npm run test:e2e`.
#   4. If none of (1)-(3) fire, exit 0 silently.
#
# Exit code is non-zero if any executed test command fails.

set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  staged)
    DIFF_FILES=$(git diff --cached --name-only --diff-filter=ACMR)
    ;;
  push)
    BASE="${2:-origin/main}"
    if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
      echo "run-related-tests: base ref '$BASE' not found, falling back to HEAD~1" >&2
      BASE="HEAD~1"
    fi
    DIFF_FILES=$(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD)
    ;;
  *)
    echo "Usage: $0 staged" >&2
    echo "       $0 push [base-ref]   # default base: origin/main" >&2
    exit 2
    ;;
esac

if [ -z "$DIFF_FILES" ]; then
  echo "run-related-tests: no changed files, nothing to do."
  exit 0
fi

# --- Classify changed files --------------------------------------------------

# Global triggers: any change here invalidates targeted selection, so run the
# whole unit suite.
GLOBAL_TRIGGER_PATTERN='^(package\.json|package-lock\.json|jest\.config\.ts|jest\.e2e\.config\.ts|tsconfig\.json|tsconfig\.build\.json|nest-cli\.json|prisma/schema\.prisma|prisma/migrations/)'

GLOBAL_TRIGGERED=0
HAS_E2E_CHANGE=0
RELATED_FILES=()

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if echo "$f" | grep -Eq "$GLOBAL_TRIGGER_PATTERN"; then
    GLOBAL_TRIGGERED=1
  fi
  if echo "$f" | grep -Eq '^test/e2e/.*\.e2e-spec\.ts$'; then
    HAS_E2E_CHANGE=1
    continue
  fi
  if echo "$f" | grep -Eq '^(src|test)/.*\.(ts|js)$'; then
    RELATED_FILES+=("$f")
  fi
done <<< "$DIFF_FILES"

# --- Decide what to run ------------------------------------------------------

EXIT=0

if [ "$GLOBAL_TRIGGERED" -eq 1 ]; then
  echo "run-related-tests: global trigger detected, running full unit suite (npm test)..."
  npm test || EXIT=$?
elif [ ${#RELATED_FILES[@]} -gt 0 ]; then
  echo "run-related-tests: running unit tests related to ${#RELATED_FILES[@]} file(s)..."
  printf '  %s\n' "${RELATED_FILES[@]}"
  npm test -- --findRelatedTests "${RELATED_FILES[@]}" --passWithNoTests || EXIT=$?
else
  echo "run-related-tests: no unit-relevant source/test changes."
fi

if [ "$HAS_E2E_CHANGE" -eq 1 ]; then
  echo "run-related-tests: e2e spec change detected, running npm run test:e2e..."
  npm run test:e2e || EXIT=$?
fi

if [ "$GLOBAL_TRIGGERED" -eq 0 ] && [ ${#RELATED_FILES[@]} -eq 0 ] && [ "$HAS_E2E_CHANGE" -eq 0 ]; then
  echo "run-related-tests: no relevant files matched, nothing to run."
fi

exit $EXIT
