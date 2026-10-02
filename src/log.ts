type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * One JSON object per line, so the host's log viewer can filter by field.
 * Never pass secrets, signatures or full event payloads.
 */
export function log(event: string, fields: Fields = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}
