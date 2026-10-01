/** Formats integer minor units (cents) as dollars: 12345n -> "$123.45". */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const dollars = (abs / 100n).toLocaleString("en-US");
  const rest = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${rest}`;
}
