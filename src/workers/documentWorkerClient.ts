import type { AlignTask, WorkerRequest, WorkerResponse } from "./document.worker";
import type { ParseFileTask } from "@/tex/types";
import type { ParsedManuscript } from "@/tex/types";
import type { ReviewDocument } from "@/revisions/buildReviewDocument";

let workerInstance: Worker | null = null;

function getWorker(): Worker {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker(new URL("./document.worker.ts", import.meta.url), {
    type: "module",
  });
  workerInstance.onerror = (e) => {
    for (const { reject } of pending.values()) reject(new Error(e.message));
    pending.clear();
  };
  workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const handler = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (!handler) return;
    if ("error" in e.data) {
      handler.reject(new Error(String(e.data.error)));
    } else {
      handler.resolve(e.data as WorkerResponse);
    }
  };
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

function post(req: ParseFileTask | AlignTask): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...req, id } as WorkerRequest);
  });
}

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
