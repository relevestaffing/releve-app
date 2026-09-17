/* What a caller is allowed to be told when something throws.
   -----------------------------------------------------------
   Routes used to answer with `e.message` verbatim. For an error this codebase
   raised on purpose that is exactly right — "That invoice has already moved
   money", "Relève team only", a Stripe decline in Stripe's own words — and
   those should keep reaching the person, because they say what to do next.

   For an error Postgres raised it is not. Those name tables, columns,
   constraints and row-level-security policies, which is a free map of the
   schema to anyone signed in who sends a deliberately malformed body.

   The two are distinguishable: Postgres and PostgREST attach a `code`. The
   one Postgres code that is NOT leaky is P0001 — `raise exception`, which is
   how this schema's own guard functions speak ("nobody verifies their own
   paperwork"), and those messages are written for people. Stripe's codes are
   lowercase words, so they never match the pattern below. */

const LEAKY = /^(?:08|22|23|25|28|40|42|53|54|55|57|58|XX)/;

export function safeMessage(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code && (LEAKY.test(code) || code.startsWith('PGRST'))) {
    /* The detail still goes to the Netlify function log, where it is useful
       and where only Relève can read it. */
    console.error('[db]', code, err?.message);
    return 'That did not save. Please try again, or write to hello@relevestaffing.com if it keeps happening.';
  }
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  return msg || 'That did not save. Please try again.';
}
