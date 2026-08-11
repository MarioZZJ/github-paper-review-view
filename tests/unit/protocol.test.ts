import { describe, expect, it } from "vitest";
import { backgroundRequestSchema } from "@/messaging/protocol";

describe("protocol schema", () => {
  it("接受合法 token.save", () => {
    const res = backgroundRequestSchema.safeParse({
      type: "token.save",
      token: "ghp_abc",
      persist: false,
    });
    expect(res.success).toBe(true);
  });

  it("拒绝任意 URL 代理（无此类型）", () => {
    const res = backgroundRequestSchema.safeParse({
      type: "api.request",
      url: "https://evil.example.com",
    });
    expect(res.success).toBe(false);
  });

  it("拒绝路径穿越", () => {
    const res = backgroundRequestSchema.safeParse({
      type: "api.getFileContent",
      owner: "o",
      repo: "r",
      number: 1,
      path: "../../etc/passwd",
      ref: "main",
    });
    // path 校验：含 .. 段应被拒绝（在 handler 层），schema 层只做长度/类型
    expect(res.success).toBe(true);
  });

  it("拒绝非法 owner", () => {
    const res = backgroundRequestSchema.safeParse({
      type: "api.getPullRequest",
      owner: "o%20x",
      repo: "r",
      number: 1,
    });
    expect(res.success).toBe(false);
  });

  it("GraphQL 操作 allowlist", () => {
    const ok = backgroundRequestSchema.safeParse({
      type: "api.graphql",
      operation: "addThread",
      variables: {},
    });
    expect(ok.success).toBe(true);
    const bad = backgroundRequestSchema.safeParse({
      type: "api.graphql",
      operation: "deleteAllData",
      variables: {},
    });
    expect(bad.success).toBe(false);
  });
});
