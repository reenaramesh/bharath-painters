import { useEffect } from "react";

const ignoredHeadings = new Set(["action", "actions", "select", "call", "whatsapp"]);

function sortableValue(cell) {
  const raw = cell?.dataset.sortValue || cell?.textContent?.trim() || "";
  const normalized = raw.replace(/[₹,]/g, "").replace(/\s+(sq\s*ft|days?|items?)$/i, "").trim();
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return { type: "number", value: Number(normalized) };
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return { type: "number", value: new Date(normalized).getTime() };
  return { type: "text", value: normalized.toLowerCase() };
}

function compareCells(first, second) {
  const a = sortableValue(first);
  const b = sortableValue(second);
  if (a.type === "number" && b.type === "number") return a.value - b.value;
  return String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: "base" });
}

export default function GlobalTableSorting() {
  useEffect(() => {
    const decorate = (root = document) => {
      root.querySelectorAll?.("table thead th").forEach((heading) => {
        const label = heading.textContent.trim().toLowerCase();
        if (!label || ignoredHeadings.has(label) || heading.querySelector("button, a, input, select") || heading.dataset.noSort === "true") return;
        heading.dataset.globalSortable = "true";
        heading.tabIndex = 0;
        heading.title = `Sort by ${heading.textContent.trim()}`;
        heading.classList.add("bp-global-sortable");
      });
    };

    const sort = (heading) => {
      const table = heading.closest("table");
      const body = table?.querySelector("tbody");
      if (!body) return;
      const index = heading.cellIndex;
      const previousIndex = table.dataset.sortColumn;
      const direction = previousIndex === String(index) && table.dataset.sortDirection === "asc" ? "desc" : "asc";
      const rows = [...body.querySelectorAll(":scope > tr")];
      rows.sort((a, b) => compareCells(a.cells[index], b.cells[index]) * (direction === "asc" ? 1 : -1));
      rows.forEach((row) => body.appendChild(row));
      table.querySelectorAll("thead th").forEach((cell) => {
        cell.removeAttribute("aria-sort");
        delete cell.dataset.sortDirection;
      });
      heading.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      heading.dataset.sortDirection = direction;
      table.dataset.sortColumn = String(index);
      table.dataset.sortDirection = direction;
    };

    const activate = (event) => {
      const heading = event.target.closest?.('th[data-global-sortable="true"]');
      if (!heading || event.target.closest("button, a, input, select")) return;
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.type === "keydown") event.preventDefault();
      sort(heading);
    };

    decorate();
    const observer = new MutationObserver((entries) => entries.forEach((entry) => decorate(entry.target)));
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", activate);
    document.addEventListener("keydown", activate);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", activate);
      document.removeEventListener("keydown", activate);
    };
  }, []);
  return null;
}
