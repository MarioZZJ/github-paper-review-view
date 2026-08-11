import { useMemo, useState, useEffect, useCallback, useRef } from "react";
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
  useCommitMeta,
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
  const commitMetaQ = useCommitMeta(location);
  const filesQ = useChangedFiles(location);
  const commentableQ = useCommentableIndex(location);
  const threadsQ = useThreads(location);
  const pendingQ = usePendingReview(location);

  /** commit 视图：只读渲染该 commit 的 diff（评论禁用）。 */
  const commitMode = location.surface === "commits";
  const renderScope = useMemo(() => {
    if (commitMode && commitMetaQ.data) {
      return { baseSha: commitMetaQ.data.parentSha, headSha: commitMetaQ.data.sha };
    }
    if (metaQ.data) return { baseSha: metaQ.data.baseSha, headSha: metaQ.data.headSha };
    return undefined;
  }, [commitMode, commitMetaQ.data, metaQ.data]);

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

  const bibQ = useBibEntries(location, renderScope, filesQ.data);
  const macrosQ = useTexMacros(location, renderScope, filesQ.data, settings);
  const context = useMemo(
    () => buildParseContext(settings, macrosQ.data ?? {}, bibQ.data ?? {}, {}),
    [settings, macrosQ.data, bibQ.data],
  );
  const aligned = useAlignedDocument(
    location,
    renderScope,
    activeFile,
    context,
    !!activeFile && !!renderScope,
  );

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

  // 默认视图随设置同步（仅首次加载后）
  const initialViewApplied = useRef(false);
  useEffect(() => {
    if (loadedSettings && !initialViewApplied.current) {
      initialViewApplied.current = true;
      setViewMode(settings.viewMode);
    }
  }, [loadedSettings, settings.viewMode, setViewMode]);

  if (!loadedSettings || hasToken === null) {
    return (
      <div className="pr-app-shell pr-app-loading">
        <Spinner label="正在启动…" />
      </div>
    );
  }

  const title = metaQ.data ? `#${metaQ.data.number} ${metaQ.data.title}` : "";
  const badge =
    commitMode && location.rangeOid
      ? `commit ${location.rangeOid.slice(0, 7)}（只读）`
      : null;

  return (
    <div className="pr-app-shell" data-pr-theme={theme}>
      <Toolbar
        title={badge ? `${title} · ${badge}` : title}
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
          onComment={commitMode ? () => undefined : onComment}
          onThreadClick={onJumpToThread}
          readOnly={commitMode}
        />
        {!commitMode ? (
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
        ) : null}
      </div>

      {!commitMode ? (
        <SubmitReviewBar
          loc={location}
          pendingReviewId={pendingReviewId}
          threadCount={threads.filter((t) => t.reviewState === "PENDING" || t.reviewId === pendingReviewId).length}
          onSubmitted={() => {
            void threadsQ.refetch();
            void pendingQ.refetch();
          }}
        />
      ) : null}

      {settingsOpen ? <SettingsPanel /> : null}
    </div>
  );
}
