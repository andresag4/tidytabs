const TICKET_RE = /\b[A-Z]{2,10}-\d{2,}\b/g;

export function extractTickets(title) {
  if (typeof title !== 'string') return [];
  const found = title.match(TICKET_RE);
  if (!found) return [];
  const seen = new Set();
  const out = [];
  for (const t of found) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
