import { idbGet, idbPut } from "./idb";
import type { SourceLine } from "@/domain/source";

/**
 * 文档缓存：key = owner/repo/baseSha/headSha/path。
 * head SHA 改变立即失效（key 不同即自然失效）。
 */
export interface CachedDocument {
  key: string;
  baseText: string | null;
  headText: string | null;
  baseLines: SourceLine[] | null;
  headLines: SourceLine[] | null;
  cachedAt: number;
}

export function documentCacheKey(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  path: string,
): string {
  return `${owner}/${repo}/${baseSha}/${headSha}/${path}`;
}

export async function getCachedDocument(key: string): Promise<CachedDocument | undefined> {
  return idbGet<CachedDocument>("documents", key);
}

export async function putCachedDocument(doc: CachedDocument): Promise<void> {
  await idbPut("documents", doc);
}
