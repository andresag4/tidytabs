// Matches Jira-style (FE-3333, TIDYTABS-12) and GitHub-style (#1234) ticket IDs.
// 2+ digits required on both to skip noise like FE-3 or #1.
const TICKET_RE = /\b[A-Z]{2,10}-\d{2,}\b|#\d{2,}\b/g;

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

export function bucketByTicket(tabs) {
  // Pass 1: candidate buckets — each tab in all of its tickets.
  const candidates = new Map(); // ticketId → Tab[]
  const tabTickets = new Map(); // tab.id → ticketId[]
  for (const tab of tabs) {
    const tickets = extractTickets(tab.title);
    if (tickets.length === 0) continue;
    tabTickets.set(tab.id, tickets);
    for (const t of tickets) {
      if (!candidates.has(t)) candidates.set(t, []);
      candidates.get(t).push(tab);
    }
  }

  // Pass 2: resolve multi-ticket tabs to a single primary ticket.
  const primary = new Map(); // ticketId → Tab[]
  for (const tab of tabs) {
    const tickets = tabTickets.get(tab.id);
    if (!tickets || tickets.length === 0) continue;
    if (tickets.length === 1) {
      const t = tickets[0];
      if (!primary.has(t)) primary.set(t, []);
      primary.get(t).push(tab);
      continue;
    }
    // Multi-ticket: pick largest cluster, ties → lex smallest.
    let bestTicket = null, bestSize = -1;
    for (const t of tickets) {
      const size = candidates.get(t).length;
      if (size > bestSize || (size === bestSize && t < bestTicket)) {
        bestTicket = t;
        bestSize = size;
      }
    }
    if (!primary.has(bestTicket)) primary.set(bestTicket, []);
    primary.get(bestTicket).push(tab);
  }

  // Pass 3: drop buckets below threshold (< 2).
  for (const [t, list] of primary) {
    if (list.length < 2) primary.delete(t);
  }
  return primary;
}
