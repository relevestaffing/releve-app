/* CSV, written safely.
   --------------------
   Small enough to look trivial and consequential enough not to be: these two
   functions decide what a payments file says. A beneficiary name carrying a
   comma — "Dela Cruz, Maria" — splices an extra column into that row and
   shifts every value after it by one, which in a Wise batch means an amount
   landing in the wrong field, or in somebody else's. Floating point does the
   quieter version of the same damage: 1799.99 * 100 is 179998.99999999997,
   and rounding it the wrong way pays somebody a cent less than they earned,
   every month, until they notice.

   Kept in their own file so they can be tested directly rather than only
   through an HTTP route that needs a signed-in admin and live payroll data. */

/* One CSV cell. Quotes are doubled, and the value is wrapped whenever it
   carries a comma, a quote, or a newline — the three characters that can
   break the shape of a row. */
export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* Integer cents to the plain decimal string a payments file wants: "1799.99",
   never "1799.9899999" and never "1,799.99". Works off the integer rather
   than dividing into a float, so the value written is the value stored. */
export function centsToAmount(cents: number): string {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/* A whole file, CRLF-terminated the way spreadsheet tools expect. */
export function csvFile(headers: readonly string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
