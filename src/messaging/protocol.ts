import { z } from "zod";

/**
 * content script → background 的跨上下文消息协议。
 * 所有请求必须通过 Zod 判别联合验证；background 侧对每个操作做 allowlist 校验，
 * 不提供任意 URL 代理。
 */

export const prLocSchema = z.object({
  owner: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  repo: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  number: z.number().int().positive(),
});

export const diffSideSchema = z.enum(["LEFT", "RIGHT"]);

/* ------------------------------ token 操作 ------------------------------ */

export const tokenStatusRequest = z.object({ type: z.literal("token.status") });
export const tokenVerifyRequest = z.object({
  type: z.literal("token.verify"),
  token: z.string().min(1).max(200),
});
export const tokenSaveRequest = z.object({
  type: z.literal("token.save"),
  token: z.string().min(1).max(200),
  persist: z.boolean(),
});
export const tokenForgetRequest = z.object({ type: z.literal("token.forget") });
export const tokenSwitchSessionRequest = z.object({
  type: z.literal("token.switchToSession"),
});

/* -------------------------------- API 操作 ------------------------------- */

const apiGetUser = z.object({ type: z.literal("api.getUser") });
const apiGetPullRequest = z.object({
  type: z.literal("api.getPullRequest"),
  ...prLocSchema.shape,
});
const apiGetPullFiles = z.object({
  type: z.literal("api.getPullFiles"),
  ...prLocSchema.shape,
  page: z.number().int().positive().max(100),
});
const apiGetFileContent = z.object({
  type: z.literal("api.getFileContent"),
  ...prLocSchema.shape,
  path: z.string().min(1).max(1024),
  ref: z.string().min(1).max(100),
});
const apiGetTree = z.object({
  type: z.literal("api.getTree"),
  ...prLocSchema.shape,
  sha: z.string().min(1).max(100),
});
const apiGetBlob = z.object({
  type: z.literal("api.getBlob"),
  ...prLocSchema.shape,
  blobSha: z.string().min(1).max(100),
});
const apiGetPullDiff = z.object({
  type: z.literal("api.getPullDiff"),
  ...prLocSchema.shape,
});
const apiGetThreads = z.object({
  type: z.literal("api.getThreads"),
  ...prLocSchema.shape,
});
const apiCreateReviewComment = z.object({
  type: z.literal("api.createReviewComment"),
  ...prLocSchema.shape,
  body: z.string().min(1).max(65536),
  commitId: z.string().min(1).max(100),
  path: z.string().min(1).max(1024),
  line: z.number().int().positive(),
  side: diffSideSchema,
  startLine: z.number().int().positive().optional(),
  startSide: diffSideSchema.optional(),
});
const apiUpdateReviewComment = z.object({
  type: z.literal("api.updateReviewComment"),
  ...prLocSchema.shape,
  commentId: z.number().int().positive(),
  body: z.string().min(1).max(65536),
});
const apiDeleteReviewComment = z.object({
  type: z.literal("api.deleteReviewComment"),
  ...prLocSchema.shape,
  commentId: z.number().int().positive(),
});
const apiGetRateLimit = z.object({ type: z.literal("api.rateLimit") });

/* ------------------------------- GraphQL -------------------------------- */

export const graphqlOperationSchema = z.enum([
  "viewerPendingReview",
  "reviewThreads",
  "addReview",
  "addThread",
  "addReply",
  "submitReview",
  "resolveThread",
  "unresolveThread",
  "updateComment",
  "deleteComment",
  "markFileViewed",
  "unmarkFileViewed",
]);

const apiGraphql = z.object({
  type: z.literal("api.graphql"),
  operation: graphqlOperationSchema,
  variables: z.record(z.unknown()),
});

/* ------------------------------ 请求联合类型 ----------------------------- */

export const backgroundRequestSchema = z.discriminatedUnion("type", [
  tokenStatusRequest,
  tokenVerifyRequest,
  tokenSaveRequest,
  tokenForgetRequest,
  tokenSwitchSessionRequest,
  apiGetUser,
  apiGetPullRequest,
  apiGetPullFiles,
  apiGetFileContent,
  apiGetTree,
  apiGetBlob,
  apiGetPullDiff,
  apiGetThreads,
  apiCreateReviewComment,
  apiUpdateReviewComment,
  apiDeleteReviewComment,
  apiGetRateLimit,
  apiGraphql,
]);

export type BackgroundRequest = z.infer<typeof backgroundRequestSchema>;

/* -------------------------------- 响应 -------------------------------- */

export const okResponseSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});
export const errorResponseSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  status: z.number().optional(),
  retryAfter: z.number().optional(),
  resetAt: z.number().optional(),
});
export const backgroundResponseSchema = z.discriminatedUnion("ok", [
  okResponseSchema,
  errorResponseSchema,
]);
export type BackgroundResponse = z.infer<typeof backgroundResponseSchema>;

/** content script 侧消息发送，返回结构化结果。 */
export function makeRequest(req: BackgroundRequest): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    void chrome.runtime.sendMessage(req).then(
      (raw: unknown) => {
        const parsed = backgroundResponseSchema.safeParse(raw);
        if (parsed.success) resolve(parsed.data);
        else
          resolve({
            ok: false,
            code: "BAD_RESPONSE",
            message: "后台返回了无法解析的响应",
          });
      },
      (err: unknown) => {
        resolve({
          ok: false,
          code: "CHANNEL_ERROR",
          message: err instanceof Error ? err.message : "消息通道错误",
        });
      },
    );
  });
}
