import { extractDomain } from './domain.js';

export const TAB_GROUP_ID_NONE = -1;

export function bucketByDomain(tabs, threshold) {
  const buckets = new Map();
  for (const t of tabs) {
    if (t.pinned) continue;
    if (t.groupId !== undefined && t.groupId !== TAB_GROUP_ID_NONE) continue;
    const domain = extractDomain(t.url);
    if (!domain) continue;
    if (!buckets.has(domain)) buckets.set(domain, []);
    buckets.get(domain).push(t);
  }
  for (const [domain, list] of buckets) {
    if (list.length < threshold) buckets.delete(domain);
  }
  return buckets;
}
