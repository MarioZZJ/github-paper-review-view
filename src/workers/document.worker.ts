import { scanDocument } from "@/tex/scanDocument";
import { buildReviewDocument } from "@/revisions/buildReviewDocument";
import type { ParseFileTask } from "@/tex/types";
import type { ParsedManuscript } from "@/tex/types";
import type { ReviewDocument } from "@/revisions/buildReviewDocument";

export interface AlignTask {
  task: "align";
  base: ParsedManuscript;
  head: ParsedManuscript;
}

export type WorkerRequest = (ParseFileTask | AlignTask) & { id: number };

export type WorkerResponse =
  | ({ task: "parse"; result: ParsedManuscript } | { task: "align"; result: ReviewDocument } | { error: string })
  & { id: number };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const respond = (payload: Omit<WorkerResponse, "id">) => {
    (self as unknown as Worker).postMessage({ ...payload, id: req.id });
  };
  try {
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
      respond({ task: "parse", result });
    } else if (req.task === "align") {
      const result = buildReviewDocument(req.base, req.head);
      respond({ task: "align", result });
    }
  } catch (err) {
    respond({ error: err instanceof Error ? err.message : String(err) });
  }
};
