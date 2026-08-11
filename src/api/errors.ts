/** API 错误分类。 */
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "NETWORK"
  | "BAD_REQUEST"
  | "HEAD_CHANGED"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  /** 限流场景：可重试时间（epoch ms）。 */
  readonly resetAt: number | null;
  readonly retryAfter: number | null;
  /** GraphQL 用户可见错误信息。 */
  readonly userMessage: string | null;

  constructor(
    code: ApiErrorCode,
    message: string,
    opts: { status?: number; resetAt?: number; retryAfter?: number; userMessage?: string | null } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = opts.status ?? null;
    this.resetAt = opts.resetAt ?? null;
    this.retryAfter = opts.retryAfter ?? null;
    this.userMessage = opts.userMessage ?? null;
  }
}

/** 把 HTTP 状态码映射为 ApiError。 */
export function mapHttpError(
  status: number,
  body: unknown,
  opts: { retryAfter?: number; resetAt?: number } = {},
): ApiError {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message =
    typeof raw.message === "string" ? raw.message : `GitHub API 请求失败 (${status})`;
  switch (status) {
    case 401:
      return new ApiError("UNAUTHORIZED", "token 无效或已过期", { status });
    case 403: {
      if (opts.retryAfter !== undefined || status === 403 && (raw.documentation_url as string | undefined)?.includes("rate")) {
        return new ApiError("RATE_LIMITED", message, {
          status,
          retryAfter: opts.retryAfter ?? undefined,
          resetAt: opts.resetAt ?? undefined,
        });
      }
      return new ApiError("FORBIDDEN", "权限不足（可能缺少仓库权限、SSO 或速率限制）", { status });
    }
    case 404:
      return new ApiError("NOT_FOUND", "资源不存在或仓库不可见", { status });
    case 409:
      return new ApiError("CONFLICT", "状态冲突（head 已变化或 review 状态冲突）", { status });
    case 422:
      return new ApiError("UNPROCESSABLE", message, { status });
    case 429:
      return new ApiError("RATE_LIMITED", message, {
        status,
        retryAfter: opts.retryAfter ?? undefined,
        resetAt: opts.resetAt ?? undefined,
      });
    default:
      return new ApiError("BAD_REQUEST", message, { status });
  }
}

/** 把 GraphQL 响应错误映射为 ApiError。 */
export function mapGraphqlError(body: unknown): ApiError {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const errors = Array.isArray(raw.errors) ? (raw.errors as Array<Record<string, unknown>>) : [];
  const first = errors[0];
  const message = typeof first?.message === "string" ? first.message : "GraphQL 请求失败";
  const type = typeof first?.type === "string" ? first.type : "";
  const userMessage = typeof first?.userMessage === "string" ? first.userMessage : null;
  if (type === "FORBIDDEN") return new ApiError("FORBIDDEN", message, { userMessage });
  if (type === "NOT_FOUND") return new ApiError("NOT_FOUND", message, { userMessage });
  if (/rate limit/i.test(message)) return new ApiError("RATE_LIMITED", message, { userMessage });
  if (/head|commit|outdated/i.test(message) && /changed|no longer/i.test(message))
    return new ApiError("HEAD_CHANGED", message, { userMessage });
  if (type === "UNPROCESSABLE" || /outdated/i.test(message))
    return new ApiError("UNPROCESSABLE", message, { userMessage });
  if (type === "CONFLICT") return new ApiError("CONFLICT", message, { userMessage });
  return new ApiError("UNKNOWN", message, { userMessage });
}

/** 网络层错误。 */
export function mapNetworkError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(
    "NETWORK",
    err instanceof Error ? err.message : "网络请求失败",
  );
}
