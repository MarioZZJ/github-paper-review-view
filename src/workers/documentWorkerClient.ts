import type { AlignTask, WorkerResponse } from "./document.worker";
import type { ParseFileTask } from "@/tex/types";
import type { ParsedManuscript } from "@/tex/types";
import type { ReviewDocument } from "@/revisions/buildReviewDocument";
import { scanDocument } from "@/tex/scanDocument";
import { buildReviewDocument } from "@/revisions/buildReviewDocument";

/**
 * 文档解析 Worker 客户端。
 * 若 Worker 构建产物不可用（如部分打包环境），自动降级为在主线程执行，
 * 保证功能可用性；解析任务全部在独立消息中执行，不阻塞渲染关键路径过长。
 */

let workerInstance: Worker | null = null;
let workerMode = true;
let workerWarned = false;

function tryCreateWorker(): Worker | null {
  try {
    const w = new Worker(new URL("./document.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onerror = (e) => {
      // 运行期错误：降级主线程，重放 pending 任务
      workerMode = false;
      workerInstance = null;
      if (!workerWarned) {
        workerWarned = true;
        console.warn("[Papers Review] worker 不可用，降级到主线程执行", e.message);
      }
      for (const { reject } of pending.values()) reject(new Error(e.message));
      pending.clear();
    };
    return w;
  } catch {
    return null;
  }
}

function getWorker(): Worker | null {
  if (workerInstance) return workerInstance;
  workerInstance = tryCreateWorker();
  if (!workerInstance && !workerWarned) {
    workerWarned = true;
    console.warn("[Papers Review] 无法创建解析 worker，降级到主线程");
  }
  return workerInstance;
}

export function terminateWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

const pending = new Map<
  number,
  { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }
>();
let seq = 0;

/** 主线程执行（降级路径）。 */
function runOnMainThread(
  req: ParseFileTask | AlignTask,
): Omit<WorkerResponse, "id"> {
  if (req.task === "parse") {
    const lines = req.lines.map((l) => ({
      number: l.number,
      raw: l.raw,
      blank: l.blank,
      newline: l.newline,
    }));
    const result = scanDocument(lines, {
      path: req.path,
      side: req.side,
      showTexComments: req.context.showTexComments,
      context: {
        bib: req.context.bibEntries,
        citationDisplay: "authorYear",
      },
    });
    return { task: "parse", result };
  }
  const result = buildReviewDocument(req.base, req.head);
  return { task: "align", result };
}

function post(req: ParseFileTask | AlignTask): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const runMain = () => {
      queueMicrotask(() => {
        try {
          resolve(runOnMainThread(req) as WorkerResponse);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    };
    if (!workerMode) {
      runMain();
      return;
    }
    const worker = getWorker();
    if (!worker) {
      runMain();
      return;
    }
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...req, id });
  });
}

function setupWorkerHandlers(): void {
  const worker = getWorker();
  if (!worker) return;
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const handler = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (!handler) return;
    if ("error" in e.data) {
      handler.reject(new Error(String(e.data.error)));
    } else {
      handler.resolve(e.data as WorkerResponse);
    }
  };
}

setupWorkerHandlers();

/** 解析单个文件单侧。 */
export async function parseInWorker(task: ParseFileTask): Promise<ParsedManuscript> {
  const res = await post(task);
  if (!("task" in res) || res.task !== "parse" || !("result" in res)) {
    throw new Error("worker 返回类型错误");
  }
  return (res as { task: "parse"; result: ParsedManuscript }).result;
}

/** 对齐 base/head。 */
export async function alignInWorker(
  base: ParsedManuscript,
  head: ParsedManuscript,
): Promise<ReviewDocument> {
  const res = await post({ task: "align", base, head });
  if (!("task" in res) || res.task !== "align" || !("result" in res)) {
    throw new Error("worker 返回类型错误");
  }
  return (res as { task: "align"; result: ReviewDocument }).result;
}
