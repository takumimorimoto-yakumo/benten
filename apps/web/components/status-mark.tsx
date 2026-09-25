export function StatusMark({ tone = "verified", children }: { tone?: "verified" | "neutral" | "attention"; children: React.ReactNode }) {
  return <span className={`status-mark status-mark--${tone}`}><span aria-hidden="true">●</span>{children}</span>;
}
