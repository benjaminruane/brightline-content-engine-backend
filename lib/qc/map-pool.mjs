/**
 * Bounded concurrency pool. Same helper Stage 2 has used since the cap of 24.
 * mapPoolPaced waits until the live remaining window can accept the next item.
 */

import { waitUntilTokensFit } from "./request-budget.mjs";

export async function mapPool(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export async function mapPoolPaced(items, concurrency, mapper, { tokensPerItem } = {}) {
  const per = Math.max(0, Math.floor(Number(tokensPerItem) || 0));
  return mapPool(items, concurrency, async (item, index) => {
    if (per > 0) await waitUntilTokensFit(per);
    return mapper(item, index);
  });
}
