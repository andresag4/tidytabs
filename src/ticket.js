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

// Tickets that share a tab title are linked (union-find), so tabs connected
// through any shared ID land in one group, named by its Jira IDs
// (e.g. "FE-3333 · FE-3334"), or its #NNNN refs if it has none.
// Keys are group titles; groups need 2+ tabs.
export const TICKET_SEP = ' · ';

// Title with Jira IDs only when any exist; GitHub #NNNN refs name the group only as a fallback.
const titleIds = (ids) => {
  const jira = ids.filter(id => id[0] !== '#');
  return jira.length ? jira : ids;
};

export function bucketByTicket(tabs) {
  const parent = new Map();
  const find = (t) => { while (parent.get(t) !== t) t = parent.get(t); return t; };
  const tagged = [];
  for (const tab of tabs) {
    const tickets = extractTickets(tab.title);
    if (tickets.length === 0) continue;
    tagged.push([tab, tickets]);
    for (const t of tickets) if (!parent.has(t)) parent.set(t, t);
    const root = find(tickets[0]);
    for (const t of tickets.slice(1)) parent.set(find(t), root);
  }

  const clusters = new Map(); // root → { tickets, tabs }
  for (const [tab, tickets] of tagged) {
    const root = find(tickets[0]);
    if (!clusters.has(root)) clusters.set(root, { tickets: new Set(), tabs: [] });
    const c = clusters.get(root);
    for (const t of tickets) c.tickets.add(t);
    c.tabs.push(tab);
  }

  const out = new Map();
  for (const c of clusters.values()) {
    if (c.tabs.length >= 2) out.set(titleIds([...c.tickets]).join(TICKET_SEP), c.tabs);
  }
  return out;
}
