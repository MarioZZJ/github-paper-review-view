import { useMemo, useState, useEffect, useCallback } from "react";
import { Toolbar } from "@/components/layout/Toolbar";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { ManuscriptView } from "@/components/manuscript/ManuscriptView";
import { CommentPanel } from "@/components/comments/CommentPanel";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { SubmitReviewBar } from "@/components/review/SubmitReviewBar";
import { Spinner } from "@/components/common/Spinner";
import {
  buildParseContext,
  isIgnoredPath,
  isTexPath,
  useAlignedDocument,
  useBibEntries,
  useChangedFiles,
  useCommentableIndex,
  usePendingReview,
  usePrMeta,
  useTexMacros,
  useThreads,
} from "@/app/queries";
import { useUiStore } from "@/app/uiStore";
import { useSettingsStore } from "@/storage/settingsStore";
import { useComposerStore } from "@/reviews/composerStore";
import { lineToAnchor } from "@/selection/selection";
import { makeRequest } from "@/messaging/protocol";
import type { PullRequestLocation } from "@/domain/pullRequest";
import type { ReviewThread } from "@/domain/review";

export interface AppShellProps {
  location: PullRequestLocation;
  onBackToNative: () => void;
}

export function AppShell({ location, onBackToNative }: AppShellProps) {
  const settings = useSettingsStore((s) => s.settings);
  const loadedSettings = useSettingsStore((s) => s.loaded);
  const openComposer = useComposerStore((s) => s.openComposer);
  const closeComposer = useComposerStore((s) => s.close);
  const composerOpen = useComposerStore((s) => s.open && !!s.anchor);
  const activeAnchor = useComposerStore((s) => s.anchor);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const requestScroll = useUiStore((s) => s.requestScroll);
  const setViewMode = useUiStore((s) => s.setViewMode);

  // token 状态
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  useEffect(() => {
    void makeRequest({ type: "token.status" }).then((res) => {
      if (res.ok) setHasToken((res.data as { hasToken: boolean }).hasToken);
      else setHasToken(false);
    });
  }, [settingsOpen]);

  const metaQ = usePrMeta(location);
  const filesQ = useChangedFiles(location);
  const commentableQ = useCommentableIndex(location);
  const threadsQ = useThreads(location);
  const pendingQ = usePendingReview(location);

  const texFiles = useMemo(() => {
    return (filesQ.data ?? [])
      .filter((f) => isTexPath(f.filename, settings) && !isIgnoredPath(f.filename, settings))
      .filter((f) => f.status !== "removed");
  }, [filesQ.data, settings]);

  const [activePath, setActivePath] = useState<string | null>(null);
  useEffect(() => {
    if (!activePath && texFiles.length > 0) setActivePath(texFiles[0]!.filename);
  }, [texFiles, activePath]);
  const activeFile = texFiles.find((f) => f.filename === activePath);

  const bibQ = useBibEntries(location, metaQ.data, filesQ.data);
  const macrosQ = useTexMacros(location, metaQ.data, filesQ.data, settings);
  const context = useMemo(
    () => buildParseContext(settings, macrosQ.data ?? {}, bibQ.data ?? {}, {}),
    [settings, macrosQ.data, bibQ.data],
  );
  const aligned = useAlignedDocument(location, metaQ.data, activeFile, context, !!activeFile);

  const threads = threadsQ.data ?? [];
  const pendingReviewId = pendingQ.data?.id ?? null;

  const onComment = useCallback(
    (side: "LEFT" | "RIGHT", line: number, quote?: string) => {
      if (!activeFile) return;
      const anchor = lineToAnchor(commentableQ.data, activeFile.filename, side, line, quote);
      if (!anchor) return;
      openComposer(anchor);
    },
    [activeFile, commentableQ.data, openComposer],
  );

  const onJumpToThread = useCallback(
    (t: ReviewThread) => {
      if (t.path !== activePath) setActivePath(t.path);
      requestScroll(t.path, t.diffSide ?? "RIGHT", t.line ?? 1);
    },
    [activePath, requestScroll, setActivePath],
  );

  // 错误状态
  const fatalError =
    (metaQ.error?.message ?? filesQ.error?.message ?? null) ||
    (metaQ.isError || filesQ.isError ? "加载失败" : null);
  const needsToken = hasToken === false;

  // 主题
  const theme = settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.prTheme = theme;
  }, [theme]);

  // 默认视图随设置同步（仅首次）
  useEffect(() => {
    if (loadedSettings) setViewMode(settings.viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSettings]);

  if (!loadedSettings || hasToken === null) {
    return (
      <div className="pr-app-shell pr-app-loading">
        <Spinner label="正在启动…" />
      </div>
    );
  }

  const title = metaQ.data ? `#${metaQ.data.number} ${metaQ.data.title}` : "";

  return (
    <div className="pr-app-shell" data-pr-theme={theme}>
      <Toolbar
        title={title}
        stats={aligned.doc?.stats ?? null}
        fileCount={texFiles.length}
        hasToken={hasToken}
        onBack={onBackToNative}
        onOpenTokenSettings={toggleSettings}
      />

      {needsToken ? (
        <div className="pr-banner pr-banner-warn">
          <span>尚未配置 GitHub Token — 无法加载 PR 数据。</span>
          <button className="pr-btn pr-btn-primary pr-btn-sm" onClick={toggleSettings}>
            去配置
          </button>
        </div>
      ) : null}
      {fatalError && hasToken ? (
        <div className="pr-banner pr-banner-error">
          <span>{fatalError}</span>
          <button className="pr-btn pr-btn-sm" onClick={toggleSettings}>
            检查设置
          </button>
        </div>
      ) : null}

      <div className="pr-layout">
        <LeftSidebar
          files={texFiles}
          activePath={activePath}
          outline={aligned.headParsed?.outline ?? null}
          onSelectFile={setActivePath}
          statsByPath={
            aligned.doc
              ? new Map([[aligned.doc.path, aligned.doc.stats]])
              : new Map()
          }
          doc={aligned.doc}
        />
        <ManuscriptView
          path={activeFile?.filename ?? ""}
          doc={aligned.doc}
          baseParsed={aligned.baseParsed}
          headParsed={aligned.headParsed}
          commentableIndex={commentableQ.data}
          threads={threads}
          loading={aligned.loading}
          error={aligned.error}
          onComment={onComment}
          onThreadClick={onJumpToThread}
        />
        <CommentPanel
          loc={location}
          threads={threads}
          pendingReviewId={pendingReviewId}
          pullRequestId={metaQ.data?.id ?? ""}
          headSha={metaQ.data?.headSha ?? ""}
          activeAnchor={activeAnchor}
          composerOpen={composerOpen}
          onCloseComposer={closeComposer}
          onJumpToThread={onJumpToThread}
          onMutated={() => {
            void threadsQ.refetch();
            void pendingQ.refetch();
          }}
        />
      </div>

      <SubmitReviewBar
        loc={location}
        pendingReviewId={pendingReviewId}
        threadCount={threads.filter((t) => t.reviewState === "PENDING" || t.reviewId === pendingReviewId).length}
        onSubmitted={() => {
          void threadsQ.refetch();
          void pendingQ.refetch();
        }}
      />

      {settingsOpen ? <SettingsPanel /> : null}
    </div>
  );
}
