import { z } from "zod";

/**
 * 从 GitHub 页面 script[data-target="react-app.embeddedData"] 中宽松提取
 * PR 相关数据。只作为启动优化与 fallback，API hydrate 后以 API 结果覆盖。
 */

const embeddedDataSchema = z.object({
  pullRequest: z
    .object({
      nodeId: z.string().optional(),
      number: z.number().int().positive().optional(),
      title: z.string().optional(),
      state: z.enum(["OPEN", "CLOSED", "MERGED"]).optional(),
      baseRefOid: z.string().optional(),
      headRefOid: z.string().optional(),
      viewerPermission: z.string().optional(),
      reviewDecision: z.string().nullable().optional(),
    })
    .optional(),
  comparison: z
    .object({
      baseOid: z.string().optional(),
      headOid: z.string().optional(),
      hasUpdate: z.boolean().optional(),
    })
    .optional(),
  diffSummaries: z
    .array(
      z.object({
        path: z.string(),
        status: z.string().optional(),
        additions: z.number().optional(),
        deletions: z.number().optional(),
      }),
    )
    .optional(),
});

export type EmbeddedPullRequestData = z.infer<typeof embeddedDataSchema>;

/** 递归寻找同时具备 PR 特征的对象（宽松提取）。 */
function findPrObject(root: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || typeof root !== "object" || root === null) return null;
  const obj = root as Record<string, unknown>;
  const hasPrFeature =
    typeof obj.pullRequest === "object" && obj.pullRequest !== null;
  const hasComparisonFeature = typeof obj.comparison === "object" && obj.comparison !== null;
  const hasDiffFeature = Array.isArray(obj.diffSummaries) || Array.isArray(obj.markers);
  if (hasPrFeature && (hasComparisonFeature || hasDiffFeature)) return obj;
  for (const value of Object.values(obj)) {
    if (typeof value !== "object" || value === null) continue;
    const found = findPrObject(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** 从文档中读取并解析 embeddedData。解析失败返回 null，不抛出。 */
export function extractEmbeddedData(doc: Document): EmbeddedPullRequestData | null {
  const script = doc.querySelector('script[data-target="react-app.embeddedData"]');
  if (!script?.textContent) return null;
  let json: unknown;
  try {
    json = JSON.parse(script.textContent);
  } catch {
    return null;
  }
  const found = findPrObject(json);
  if (!found) return null;
  const parsed = embeddedDataSchema.safeParse(found);
  return parsed.success ? parsed.data : null;
}

/** 嵌入数据的 DOM 位置（用于等待 SPA 渲染完成）。 */
export function embeddedDataScript(doc: Document): HTMLScriptElement | null {
  return doc.querySelector('script[data-target="react-app.embeddedData"]');
}
