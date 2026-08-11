import type { ReactNode } from "react";
import { renderMath } from "./renderMath";
import type { InlineNode } from "./types";

function MathNode({ tex, display }: { tex: string; display: boolean }) {
  const { html, failed } = renderMath(tex, display);
  if (failed || !html) {
    return (
      <span className="pr-math-fallback" title="公式渲染失败">
        {display ? `$$\n${tex}\n$$` : `$${tex}$`}
      </span>
    );
  }
  return (
    <span
      className={display ? "pr-math-display" : "pr-math"}
      // KaTeX 输出为本地打包代码生成的静态 HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderNode(node: InlineNode, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return <span key={key}>{node.text}</span>;
    case "math":
      return <MathNode key={key} tex={node.tex} display={node.display} />;
    case "cite":
      return (
        <span key={key} className="pr-cite" title={node.keys.join(", ")}>
          [{node.display}]
        </span>
      );
    case "ref":
      return (
        <span key={key} className="pr-ref" title={`\\ref{${node.label}}`}>
          {node.display}
        </span>
      );
    case "url":
      return (
        <a key={key} className="pr-url" href={node.href} target="_blank" rel="noreferrer">
          {node.text}
        </a>
      );
    case "footnote":
      return (
        <span key={key} className="pr-fn" title={node.text}>
          <sup>†</sup>
          <span className="pr-fn-body">{node.text}</span>
        </span>
      );
    case "styled":
      if (node.style === "bold") return <strong key={key}>{<InlineRenderer nodes={node.children} />}</strong>;
      if (node.style === "italic") return <em key={key}>{<InlineRenderer nodes={node.children} />}</em>;
      if (node.style === "underline") return <u key={key}>{<InlineRenderer nodes={node.children} />}</u>;
      return <code key={key}>{<InlineRenderer nodes={node.children} />}</code>;
    case "code":
      return <code key={key}>{node.text}</code>;
    case "texcomment":
      return (
        <span key={key} className="pr-texcomment">
          {node.text}
        </span>
      );
    default:
      return null;
  }
}

export function InlineRenderer({ nodes }: { nodes: readonly InlineNode[] }): ReactNode {
  return <>{nodes.map((n, i) => renderNode(n, i))}</>;
}
