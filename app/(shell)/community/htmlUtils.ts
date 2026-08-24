export function stripHtml(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}
