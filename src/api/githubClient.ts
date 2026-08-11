import { ApiError } from "./errors";
import type { BackgroundResponse } from "@/messaging/protocol";

/** 把 background 响应转成 data 或抛 ApiError。 */
export function unwrap<T>(res: BackgroundResponse): T {
  if (res.ok) return res.data as T;
  const err = new ApiError(res.code as never, res.message, {
    status: res.status,
    resetAt: res.resetAt,
    retryAfter: res.retryAfter,
  });
  throw err;
}

/** 宽松提取一个字段，不抛错。 */
export function pick<T>(obj: unknown, key: string): T | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  return (obj as Record<string, unknown>)[key] as T | undefined;
}
