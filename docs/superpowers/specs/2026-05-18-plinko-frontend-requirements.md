# Plinko Frontend — Requirements Document

**Date:** 2026-05-18
**Status:** Draft
**Scope:** Web frontend for the Plinko iGaming demo. Backend is already deployed at https://plinko-be-stanish.fly.dev.
**Backend spec:** `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
**Swagger:** https://plinko-be-stanish.fly.dev/docs (JSON: `/docs-json`)

---

## 1. Goals

Deliver a polished, single-page Plinko game client that:

- Authenticates against the existing backend (JWT access + refresh).
- Lets a player place bets and watch a ball drop along the exact path the backend returns.
- Shows live balance, recent results, and the bottom multiplier bar derived from the game config.
- Exposes the provably-fair lifecycle (commitment, rotation, reveal, verification).
- Provides a bet history screen with filters and cursor pagination.

## 2. Non-goals (MVP)

- Real-money payments / deposit / withdrawal flows.
- KYC, age verification, geoblocking, responsible-gambling tooling.
- Multi-language (English-only on launch).
- Native mobile apps (responsive web only).
- Social features (chat, leaderboard).
- Server-side rendering or SEO — this is an authenticated game client.

## 3. Tech stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript (`strict`) |
| Build | Vite 5 |
| Styling | Tailwind CSS 3, `clsx` for class composition |
| Animation | Framer Motion (ball/peg/bucket), CSS transitions for hover/focus |
| Server state | TanStack Query v5 |
| Client state | Zustand (single store: auth + UI) |
| HTTP | `axios` with request/response interceptors |
| Forms | `react-hook-form` + `zod` resolver |
| Routing | React Router v6 |
| Testing | Vitest (unit) + React Testing Library + Playwright (e2e on staging) |
| Linter / formatter | ESLint + Prettier (match backend config) |
| Package manager | `pnpm` |

Hosted on Vercel or Fly.io (static — separate from the backend).

## 4. Information architecture

```
/                  → redirects to /game if authed, /login otherwise
/login             → email + password, link to /register
/register          → email + password (8+ chars, letter+digit)
/game              → main Plinko screen (authed)
/history           → bet history (authed)
/fair              → modal-style route, shows seed lifecycle (authed)
*                  → 404 page
```

Auth-gated routes redirect to `/login` when no valid access token. After login, redirect to the originally requested route.

## 5. Functional requirements

### 5.1 Authentication

- **Register:** `POST /api/v1/auth/register { email, password }`.
  - Client-side validation: email format, password ≥ 8 chars, must contain a letter and a digit.
  - On 409 → inline error "Email already registered".
  - On success → store tokens, redirect to `/game`.
- **Login:** `POST /api/v1/auth/login`.
  - On 401 → inline error "Invalid credentials".
- **Refresh:** axios response interceptor on any 401 → `POST /api/v1/auth/refresh { refreshToken }` exactly once → retry original request with the new access token. On refresh failure → clear session, redirect to `/login`.
- **Logout:** `POST /api/v1/auth/logout { refreshToken }` then clear local state.
- **Token storage:**
  - `accessToken`: in-memory (Zustand) only.
  - `refreshToken`: httpOnly cookie when backend supports it; until then, `localStorage` with a note in the threat model.
- All authed requests carry `Authorization: Bearer <access>`.

### 5.2 Game screen (`/game`)

#### Left sidebar (~320px wide on desktop, full-width bottom sheet on <768px)

- **Manual / Auto** tabs at the top.
- **Bet amount** input:
  - Label "Bet Amount" with current balance to the right (e.g. "4,593.24").
  - Numeric input, decimal allowed (up to 6 places — backend stores 6-decimal fixed-point).
  - Quick-set chips: `1/2`, `2X`, `MAX`. `MAX` clamps to `min(balance, maxBet)`.
- **Risk:** three-pill segmented control: Low (green), Medium (yellow), High (red).
- **Rows:** slider 8..16; current value chip above the slider.
- **Bet button:**
  - Manual mode: large green primary button.
  - Auto mode: "Start" / "Stop" toggle.
- Fullscreen + Settings icon buttons in the bottom left.

#### Right region (game board)

- **Peg grid** rendered as triangular pattern: row `i` (0-indexed) has `i+1` pegs.
- **Multiplier bar** at the bottom: `rows+1` cells, values from `payoutTables[risk][rows]`. Cells use the color scale below.
- **Recent results** stacked on the right edge: latest 4 multipliers, newest at top, animated slide-in.
- **Provably Fair badge** in the bottom right: pill with checkmark icon, opens the Fair modal.

#### Bet behavior

1. User clicks Bet → POST `/api/v1/bets` `{ amount, rows, risk }`.
2. Disable Bet button until animation completes.
3. Backend returns `{ path: "LRLRRLLRLR" (length === rows), bucketIndex, multiplier, payout, balanceAfter, seed: { serverSeedHash, clientSeed, nonce } }`.
4. Spawn ball at row 0 center; for each character in `path`, animate to next peg with bounce and offset (L = -0.5 column, R = +0.5 column).
5. Land at bucket index, flash that bucket cell, push result chip to recent stack.
6. Set displayed balance to `balanceAfter` (string-safe, never client-recomputed).
7. Re-enable Bet button.

Animation total duration ≈ 1500 ms for 10 rows (scales with rows).

#### Auto mode

- Inputs: Number of bets (1..1000, or ∞), Stop on profit (currency), Stop on loss (currency), On win: reset / increase by %, On loss: reset / increase by %.
- "Start" runs bets sequentially, awaiting each animation + response. "Stop" pauses after the current bet finishes.
- Auto stops on: configured stop conditions, insufficient balance, server error.

### 5.3 Provably-fair screens

- **Active seed view** (in Fair modal): GET `/api/v1/seeds/active` → display `serverSeedHash` (commitment), `clientSeed`, `nonce`.
- **Set client seed:** input + Save button → POST `/api/v1/seeds/client { clientSeed }`. Save button is disabled when `nonce > 0`, with a tooltip "Rotate the seed first".
- **Rotate seed:** confirmation modal → POST `/api/v1/seeds/rotate { newClientSeed? }`. On success show the revealed `serverSeed` once with a "Copy" action.
- **Verify past bet:** input the revealed `serverSeed`, `clientSeed`, `nonce`, and `rows`; compute HMAC-SHA256 in the browser and reproduce the path. Use `crypto.subtle` or a JS HMAC library. Show the reconstructed path next to the bet's stored path so the player can compare.
- **Past seeds list:** if backend later supports listing revealed seeds. For MVP, allow the player to paste a seed ID to fetch via GET `/api/v1/seeds/:id`.

### 5.4 Bet history (`/history`)

- Filters: Risk dropdown (All / LOW / MEDIUM / HIGH), Rows dropdown (All / 8..16).
- Table columns: timestamp (relative + absolute on hover), risk badge, rows, multiplier, bet amount, payout, balance after. Win rows tinted green, loss rows tinted red.
- Pagination: cursor-based via `?cursor=<lastId>`. "Load more" button at the bottom, disabled when `nextCursor` is null.
- Row click → opens a bet details drawer with the path, bucket index, seed hash, and a "Verify" action.

## 6. Data and integration

### 6.1 BigInt-as-string

The backend serializes BigInt as JSON strings. The frontend MUST:

- Treat `amount`, `payout`, `balanceAfter`, `minBet`, `maxBet`, and `User.balance` as `string`.
- Never call `Number(...)` on them — use a `bigint`-based formatter:

```ts
export function formatCredits(raw: string): string {
  const v = BigInt(raw);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${frac}`;
}

export function parseCredits(input: string): bigint {
  const [w, f = ''] = input.replace(/[, ]/g, '').split('.');
  const whole = BigInt(w || '0') * 1_000_000n;
  const frac = BigInt((f + '000000').slice(0, 6));
  return whole + frac;
}
```

- 1 credit = `1_000_000` minimal units. `MIN_BET = 1_000_000n` (= 1 credit), `MAX_BET = 1_000_000_000_000n` (= 1M credits).

### 6.2 Multiplier color scale

```ts
function multiplierColor(m: number): string {
  if (m >= 10) return 'bg-red-500';
  if (m >= 3)  return 'bg-orange-500';
  if (m >= 1)  return 'bg-yellow-500';
  if (m >= 0.5) return 'bg-green-500';
  return 'bg-green-800';
}
```

### 6.3 API endpoints used

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /api/v1/auth/register | — | 409 on duplicate |
| POST | /api/v1/auth/login | — | 401 on bad creds |
| POST | /api/v1/auth/refresh | — | rotates refresh |
| POST | /api/v1/auth/logout | Bearer | 204 |
| GET  | /api/v1/users/me | Bearer | balance as string |
| GET  | /api/v1/game/config | — | rows[], risks[], min/maxBet, payoutTables |
| POST | /api/v1/bets | Bearer | full bet result |
| GET  | /api/v1/bets | Bearer | cursor pagination |
| GET  | /api/v1/bets/:id | Bearer | single bet |
| GET  | /api/v1/seeds/active | Bearer | hash + clientSeed + nonce |
| POST | /api/v1/seeds/client | Bearer | only at nonce=0 |
| POST | /api/v1/seeds/rotate | Bearer | reveals old + creates new |
| GET  | /api/v1/seeds/:id | Bearer | revealed seed |

Full schemas: `/docs-json`.

### 6.4 Error handling

| HTTP | UX |
|---|---|
| 400 | Inline field error or toast with `message` |
| 401 | Auto-refresh once; if refresh fails → redirect to /login |
| 402 | Toast "Not enough credits"; do not re-enable Bet for the spam click |
| 403 | Toast "Forbidden" and refresh balance |
| 404 | Inline empty state ("Bet not found") |
| 409 | Inline error (auth) |
| 5xx | Toast "Server error, try again" + retry-once for idempotent reads |
| network | Toast "Connection lost" + offline indicator in header |

## 7. State management

- `useAuthStore` (Zustand): `{ user, accessToken, status, login, logout, hydrateFromStorage }`.
- `useGameStore` (Zustand): `{ recentResults, currentBet, isPlaying, addResult, startBet, finishBet }`.
- Server state via TanStack Query keys:
  - `['me']` — user + balance.
  - `['game', 'config']` — payout tables (stale: Infinity).
  - `['bets', filters, cursor]` — history pages.
  - `['seeds', 'active']` — current commitment.

After a successful bet, `queryClient.invalidateQueries({ queryKey: ['me'] })` and prepend to the `['bets', ...]` cache instead of refetching.

## 8. Animation requirements

- Ball: 14px circle, white with subtle glow, `mix-blend-screen`.
- Peg hit: peg scale 1 → 1.15 → 1 in 120 ms with white ring fade-out.
- Drop step: 80 ms ease-out per row, total ~`rows × 80 + 200` ms.
- Bucket flash: scale 1 → 1.1 → 1 + glow in the multiplier color, 300 ms.
- Result chip: slide-in from the right, 200 ms, queue length capped at 4.
- All animations use `prefers-reduced-motion: reduce` to skip to final state.

## 9. Non-functional requirements

- **Performance:** Lighthouse desktop ≥ 90 Performance / Accessibility / Best Practices. First contentful paint ≤ 1.5 s on Vercel edge.
- **Responsive:** breakpoints at 1280 / 1024 / 768 / 375. Below 768 px sidebar moves to a bottom sheet.
- **Accessibility:** keyboard navigable, focus rings on all interactive elements, ARIA labels on icons, contrast AA, `prefers-reduced-motion` honored.
- **Browser support:** last 2 versions of Chrome, Edge, Firefox, Safari.
- **Bundle:** initial JS ≤ 200 KB gz, code-split routes.
- **Security:** no `dangerouslySetInnerHTML`; CSP allows backend origin only; tokens never logged; refresh token preferably httpOnly cookie.
- **Observability:** Sentry on production; report unhandled rejections, network failures (sampled), and bet error rates.

## 10. Testing

- **Unit (Vitest):** `formatCredits`/`parseCredits`, multiplier color util, HMAC verification util, bet animation reducer, Zustand stores.
- **Component (Testing Library):** form validation states, bet button disabled while playing, recent-results queue cap, sidebar collapse on mobile.
- **E2E (Playwright against staging):**
  1. Register → land on game → place bet → balance decreases / increases correctly → bet appears in history.
  2. Refresh-token rotation: force a 401 by tampering access, observe one refresh + retry.
  3. Provably fair: place bet → note hash/nonce → rotate → reveal → verify in-browser HMAC matches stored path.

## 11. Deployment

- Hosted on Vercel (preview per PR, production on `main`).
- Env vars at build time:
  - `VITE_API_BASE` — defaults to `https://plinko-be-stanish.fly.dev`
  - `VITE_SENTRY_DSN` (prod only)
- Backend has CORS gap currently (`enableCors` not wired). Coordinate with backend to add the FE origin before launch.

## 12. Open questions / dependencies on backend

1. **CORS:** backend needs `app.enableCors({ origin: <FE_URL>, credentials: true })`. Blocks browser integration today.
2. **Top-up endpoint:** no way to add credits except direct SQL. For demo, add a dev-only endpoint behind a feature flag.
3. **Refresh token cookie:** backend currently returns refresh token in JSON. For httpOnly cookie storage, backend needs to set the cookie on `/auth/login` and `/auth/refresh` and read it on `/auth/refresh`.
4. **List revealed seeds:** no endpoint to enumerate past revealed seeds for a user; either add or keep the manual paste-id UI.
5. **Pagination filters:** if FE needs date-range filters on history, backend needs the `from`/`to` query params.
6. **Currency display:** confirm we render `credits` literally; if a brand currency name is needed, add to env.

## 13. Acceptance criteria

- All routes load with no console errors on Chrome stable.
- A registered user can place at least 100 bets in 10 minutes without unexpected logouts.
- Balance displayed always equals the latest `balanceAfter` from the server (verifiable via DevTools network).
- Ball path 1:1 matches `path` returned by the server for any bet (verifiable by single-stepping the animation).
- Provably-fair page reproduces the path for at least one historical bet using in-browser HMAC.
- History pagination loads at least 200 bets without UI jank.
- Lighthouse desktop ≥ 90 across all four categories on `/game`.
- Logout invalidates the refresh token (verifiable: subsequent refresh attempt returns 401).
