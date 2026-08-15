export default function Rating({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold text-text ${
        size === "md" ? "text-sm" : "text-xs"
      }`}
      aria-label={`평점 ${value.toFixed(1)}점${count !== undefined ? `, 후기 ${count}개` : ""}`}
    >
      <span aria-hidden className="text-[#f0b429]">★</span>
      {value.toFixed(1)}
      {count !== undefined && (
        <span className="font-semibold text-text-faint">({count})</span>
      )}
    </span>
  );
}
