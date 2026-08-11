import { describe, expect, it } from "vitest";
import { parsePullRequestUrl, samePullRequest } from "@/bootstrap/githubUrl";

describe("parsePullRequestUrl", () => {
  it("解析 files 页面", () => {
    expect(parsePullRequestUrl("https://github.com/octo/repo/pull/42/files")).toEqual({
      owner: "octo",
      repo: "repo",
      number: 42,
      surface: "files",
    });
  });

  it("解析 changes 页面（含 query）", () => {
    expect(
      parsePullRequestUrl("https://github.com/octo/repo/pull/7/changes?diff=split"),
    ).toEqual({ owner: "octo", repo: "repo", number: 7, surface: "changes" });
  });

  it("解析带 range 的 files 页面", () => {
    const loc = parsePullRequestUrl(
      "https://github.com/octo/repo/pull/42/files/abc1234...def5678",
    );
    expect(loc?.owner).toBe("octo");
    expect(loc?.rangeOid).toBe("abc1234...def5678");
  });

  it("拒绝非 github.com 与非法路径", () => {
    expect(parsePullRequestUrl("https://example.com/octo/repo/pull/42/files")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/octo/repo/issues/42")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/octo/repo/pull/abc/files")).toBeNull();
    expect(parsePullRequestUrl("not a url")).toBeNull();
  });

  it("拒绝异常 owner/repo 字符", () => {
    expect(parsePullRequestUrl("https://github.com/o%20cto/repo/pull/1/files")).toBeNull();
  });
});

describe("samePullRequest", () => {
  it("相同 PR 返回 true", () => {
    const a = parsePullRequestUrl("https://github.com/o/r/pull/1/files");
    const b = parsePullRequestUrl("https://github.com/o/r/pull/1/files?diff=split");
    expect(samePullRequest(a, b)).toBe(true);
  });
  it("不同 PR 返回 false", () => {
    const a = parsePullRequestUrl("https://github.com/o/r/pull/1/files");
    const b = parsePullRequestUrl("https://github.com/o/r/pull/2/files");
    expect(samePullRequest(a, b)).toBe(false);
  });
});
