# Stripe Demo Top-Up — Design Spec

**Date:** 2026-05-22
**Status:** Pending written-spec review
**Scope:** Add Stripe test-mode Checkout top-ups for Plinko demo credits.

---

## 1. Goals

Add a demo payment flow that lets an authenticated player buy demo credits through Stripe Checkout in test mode. The flow should look and behave like a production payment integration while making it explicit that no live gambling payments are being processed.

The backend owns Checkout Session creation, webhook verification, idempotent fulfillment, and balance updates. The frontend owns package selection, redirecting the player to Checkout, and refreshing the balance after the player returns.

## 2. Non-Goals

- Live-mode Stripe payments.
- Real-money gambling deposits, withdrawals, refunds, KYC, tax, or chargeback handling.
- Arbitrary top-up amounts.
- Subscriptions, invoices, saved cards, or customer portal.
- Crediting balance from the frontend success redirect.

## 3. Product Behavior

The game screen adds an `Add demo credits` action near the balance display. Opening it shows fixed packages:

| Package | Balance added | Test Checkout price |
|---|---:|---:|
| starter | 10,000 | USD 1.00 |
| standard | 50,000 | USD 5.00 |
| high_roller | 250,000 | USD 20.00 |

After the player chooses a package, the frontend calls the backend to create a Checkout Session and redirects to Stripe's hosted Checkout URL. In test mode, the player can use Stripe test cards, including the standard successful card flow.

When Stripe redirects back to the frontend success page, the frontend refreshes `GET /api/v1/users/me` and `GET /api/v1/payments/top-ups`. The frontend may show a short pending state because the webhook is the authority for fulfillment.

## 4. Credits and Balance Model

Use one domain currency throughout the app:

- `credits` is the user-facing name of the game currency.
- `User.balance` is the user's credit balance stored in minimal units.
- There is no separate "credit" ledger or second wallet currency in this scope.
- All balance-changing values use the existing fixed precision: 1 displayed credit equals `1_000_000` minimal units.
- API fields that represent wallet money are BigInt strings, matching existing bet and user responses.

For Stripe top-ups, separate the two money domains clearly:

- `creditAmount` is the amount added to `User.balance`, stored as minimal units.
- `checkoutAmountCents` and `checkoutCurrency` describe the Stripe test-mode charge.
- Frontend copy can say "Add demo credits", but backend invariants and DTOs should treat the result as a balance credit.

## 5. Backend Architecture

Add a `payments` module:

```text
src/payments/
  payments.module.ts
  payments.controller.ts
  payments.service.ts
  stripe.client.ts
  dto/
    create-checkout-session.dto.ts
    checkout-session.response.ts
    top-up.response.ts
    list-top-ups.query.ts
```

Responsibilities:

- Validate package selection.
- Create a Stripe Checkout Session in `payment` mode.
- Store a pending top-up before returning the Checkout URL.
- Verify Stripe webhook signatures using the raw request body.
- Fulfill paid Checkout Sessions exactly once.
- Update `User.balance` in the same database transaction that marks the top-up fulfilled.
- Expose a paginated top-up history for the current user.

The existing `wallet` service remains the only place that mutates balances. If its API is bet-specific, add a small transaction-aware credit helper rather than updating `User.balance` directly from `payments`.

## 6. Data Model

Add `PaymentTopUp` and `PaymentTopUpStatus` to Prisma:

```prisma
model PaymentTopUp {
  id                      String             @id @default(uuid())
  userId                  String
  packageKey              String
  creditAmount            BigInt
  checkoutAmountCents     Int
  checkoutCurrency        String             @default("usd")
  stripeCheckoutSessionId String             @unique
  stripePaymentIntentId   String?            @unique
  status                  PaymentTopUpStatus @default(PENDING)
  balanceAfter            BigInt?
  createdAt               DateTime           @default(now())
  fulfilledAt             DateTime?
  failedAt                DateTime?
  failureReason           String?

  user                    User               @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
}

enum PaymentTopUpStatus {
  PENDING
  FULFILLED
  FAILED
  EXPIRED
}
```

The `creditAmount` field uses the same minimal-unit convention as bets and balances. `balanceAfter` is set only after fulfillment and gives the frontend/audit trail the same post-mutation snapshot pattern used by `Bet.balanceAfter`.

## 7. API Surface

All routes are under `/api/v1`. The Checkout Session and history routes use the existing JWT guard. The webhook route is unauthenticated at the application layer and trusts only Stripe signature verification.

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| POST | `/payments/checkout-session` | JWT | `{ packageKey }` | `{ checkoutUrl, sessionId }` |
| GET | `/payments/top-ups` | JWT | `?limit=20&cursor=<id>` | `{ items, nextCursor }` |
| POST | `/payments/webhook` | Stripe signature | raw Stripe event body | `200` on accepted event |

`POST /payments/checkout-session` creates a pending `PaymentTopUp`, calls Stripe, stores the Checkout Session ID, and returns the hosted Checkout URL. The Stripe metadata includes `userId`, `topUpId`, `packageKey`, and `creditAmount`.

`POST /payments/webhook` handles:

- `checkout.session.completed`: fulfill when `payment_status` is paid.
- `checkout.session.async_payment_succeeded`: fulfill delayed successful payments.
- `checkout.session.async_payment_failed`: mark failed.
- `checkout.session.expired`: mark expired when still pending.

Webhook handling returns `200` for recognized already-processed events so Stripe retries do not cause duplicate fulfillment.

## 8. Fulfillment Invariants

- The frontend never credits a balance.
- A top-up can move from `PENDING` to `FULFILLED` only once.
- `stripeCheckoutSessionId` is unique.
- Fulfillment runs in one Prisma transaction:
  1. Lock/read the `PaymentTopUp`.
  2. If already fulfilled, return success without changing balance.
  3. Lock and credit the user's balance.
  4. Mark the top-up `FULFILLED` with `fulfilledAt` and `balanceAfter`.
- The credited amount comes from `PaymentTopUp.creditAmount`, which was derived from the server-side package definition, not from webhook metadata alone.
- Webhook signature verification uses `STRIPE_WEBHOOK_SECRET` and the exact raw body.

## 9. Configuration

Required environment variables:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:5173
STRIPE_DEMO_PAYMENTS_ENABLED=true
```

The app refuses to enable payments unless `STRIPE_SECRET_KEY` starts with `sk_test_`. This keeps the integration demo-only unless a future production design explicitly removes the guard.

`success_url`:

```text
${FRONTEND_URL}/wallet/success?session_id={CHECKOUT_SESSION_ID}
```

`cancel_url`:

```text
${FRONTEND_URL}/game?top_up=cancelled
```

## 10. Frontend Contract

The frontend adds:

- `Add demo credits` modal with the fixed packages.
- Loading state while creating the Checkout Session.
- Redirect to `checkoutUrl`.
- `/wallet/success` route that polls/refetches user balance and top-up history.
- Top-up history list showing package, balance added, resulting balance when fulfilled, status, and timestamp.

The success route must not claim credits were added until the backend reports either the updated balance or the fulfilled top-up.

## 11. Error Handling

| Case | Backend behavior | Frontend behavior |
|---|---|---|
| Payments disabled | `503` | Hide action or show unavailable toast |
| Unknown package | `400` | Inline package error |
| Stripe API failure | `502` | Toast and retry action |
| Webhook bad signature | `400` | No user-facing action |
| Success redirect before webhook | top-up remains `PENDING` | Show pending state and poll briefly |
| Duplicate webhook | `200`, no second credit | No user-facing action |

## 12. Testing

Backend:

- Unit test package validation and `creditAmount` conversion to minimal units.
- Unit test webhook service idempotency.
- Unit test bad-signature rejection if practical around the Stripe helper.
- E2E test authenticated Checkout Session creation with Stripe mocked.
- E2E test webhook fulfillment credits balance once.
- E2E test duplicate webhook does not double-credit.

Frontend:

- Package modal renders fixed packages.
- Creating a Checkout Session redirects to returned Checkout URL.
- Success page shows pending until balance/top-up history updates.
- Top-up history renders fulfilled and pending states, including balance-added and balance-after values.

Manual local demo:

1. Run the backend and frontend locally.
2. Run `stripe listen --forward-to localhost:3000/api/v1/payments/webhook`.
3. Set `STRIPE_WEBHOOK_SECRET` from the Stripe CLI output.
4. Start Checkout from the frontend.
5. Complete Checkout with Stripe test card data.
6. Confirm the webhook fulfilled the top-up and the user balance increased exactly once.

## 13. Compliance Boundary

This integration is for Stripe test mode only. The current Plinko app is gambling-adjacent, and live payment processing for gambling or casino-style products is subject to Stripe restricted/prohibited business review and legal constraints. A future live-money version requires a separate design covering licensing, KYC, jurisdiction controls, responsible-gaming limits, refunds, disputes, accounting, and Stripe approval.
