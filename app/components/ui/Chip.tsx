export default function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-primary-dark bg-primary-dark text-white"
          : "border-border text-text-muted hover:border-primary-dark hover:text-primary-dark"
      }`}
    >
      {children}
    </button>
  );
}
