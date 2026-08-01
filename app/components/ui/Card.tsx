export default function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>
      {children}
    </div>
  );
}
