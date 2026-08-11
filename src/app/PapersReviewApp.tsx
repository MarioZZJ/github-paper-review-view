import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettingsStore } from "@/storage/settingsStore";
import { setKatexMacros } from "@/tex/renderMath";
import { AppShell } from "./AppShell";
import type { PullRequestLocation } from "@/domain/pullRequest";

export interface PapersReviewAppProps {
  location: PullRequestLocation;
  signal: AbortSignal;
  onBackToNative: () => void;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppInner(props: PapersReviewAppProps) {
  const settings = useSettingsStore((s) => s.settings);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (loaded) {
      // 从自定义安全宏构建 KaTeX macros
      const macros: Record<string, string> = {};
      for (const def of settings.customMacros) {
        const m = /^\\?([A-Za-z]+)\s*=\s*(.+)$/.exec(def.trim());
        if (m) macros[`\\${m[1]}`] = m[2]!;
      }
      setKatexMacros(macros);
    }
  }, [loaded, settings.customMacros]);

  // AbortSignal：卸载时中止进行中的请求
  useEffect(() => {
    const onAbort = () => {
      queryClient.cancelQueries();
    };
    props.signal.addEventListener("abort", onAbort);
    return () => props.signal.removeEventListener("abort", onAbort);
  }, [props.signal]);

  return <AppShell location={props.location} onBackToNative={props.onBackToNative} />;
}

export function PapersReviewApp(props: PapersReviewAppProps) {
  const load = useSettingsStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppInner {...props} />
    </QueryClientProvider>
  );
}
