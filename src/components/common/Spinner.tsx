export function Spinner({ label }: { label?: string }) {
  return (
    <span className="pr-spinner-wrap" role="status" aria-label={label ?? "加载中"}>
      <span className="pr-spinner" />
      {label ? <span className="pr-spinner-label">{label}</span> : null}
    </span>
  );
}
