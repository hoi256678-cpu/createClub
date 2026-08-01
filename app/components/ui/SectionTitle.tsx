export default function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 text-lg font-extrabold text-text">
      {children}
      {action && <span className="ml-auto text-sm font-semibold text-primary-dark">{action}</span>}
    </div>
  );
}
