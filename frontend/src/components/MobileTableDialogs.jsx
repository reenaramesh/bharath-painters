import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogFooter } from "./ui/Dialog";

const interactiveSelector =
  "a, button, input, select, textarea, label, [role='button']";
const actionHeading = /^(action|actions|call|whatsapp|select)$/i;
const serialHeading = /^(sl\.?\s*(no\.?)?|serial\s*(no\.?)?|#)$/i;

function cleanText(element) {
  if (!element) return "";
  const copy = element.cloneNode(true);
  copy.querySelectorAll("select").forEach((select, index) => {
    const original = element.querySelectorAll("select")[index];
    select.replaceWith([...original.selectedOptions].map((option) => option.textContent).join(" "));
  });
  return copy.textContent?.replace(/\s+/g, " ").trim() || "";
}

export default function MobileTableDialogs() {
  const location = useLocation();
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const listeners = [];
    let frame = 0;
    const decorate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.querySelectorAll("main table").forEach((table) => {
          const cards = table.dataset.mobileTable === "cards";
          if (
            table.matches("[data-mobile-table='keep']") ||
            (!cards && table.querySelector(
              "input, select, textarea, [contenteditable='true']",
            ))
          ) {
            table.classList.add("bp-mobile-edit-table");
            return;
          }
          table.classList.add("bp-mobile-data-table");
          if (cards) table.classList.add("bp-mobile-card-table");
          const headings = [
            ...table.querySelectorAll("thead tr:first-child th"),
          ].map((item, index) => cleanText(item) || `Column ${index + 1}`);
          table.querySelectorAll("tbody > tr").forEach((row) => {
            if (row.dataset.mobileDialogReady === "true") return;
            const cells = [...row.children].filter(
              (cell) => cell.tagName === "TD",
            );
            if (
              !cells.length ||
              cells.some((cell) => Number(cell.colSpan) > 1)
            ) {
              row.classList.add("bp-mobile-empty-row");
              return;
            }
            row.dataset.mobileDialogReady = "true";
            row.classList.add("bp-mobile-record-row");
            cells.forEach((cell, index) => {
              cell.dataset.mobileLabel =
                headings[index] || `Column ${index + 1}`;
              if (serialHeading.test(headings[index] || ""))
                cell.dataset.mobileSerial = "true";
              if (actionHeading.test(headings[index] || ""))
                cell.dataset.mobileAction = "true";
            });
            const meaningful = cells.filter((cell, index) => {
              const heading = headings[index] || "";
              return (
                cleanText(cell) &&
                !serialHeading.test(heading) &&
                !actionHeading.test(heading)
              );
            });
            meaningful.slice(0, 3).forEach((cell, index) => {
              cell.dataset.mobilePriority = [
                "primary",
                "secondary",
                "tertiary",
              ][index];
            });
            const openOriginal =
              row.tabIndex >= 0 || row.classList.contains("cursor-pointer");
            const openDialog = (event) => {
              if (
                window.innerWidth >= 768 ||
                row.dataset.allowOriginalClick === "true"
              )
                return;
              if (event.target.closest(interactiveSelector)) return;
              event.preventDefault();
              event.stopPropagation();
              setDialog({
                title:
                  cleanText(meaningful[0]) ||
                  cleanText(cells[0]) ||
                  "Record details",
                row,
                openOriginal,
                fields: cells
                  .map((cell, index) => ({
                    label: headings[index] || `Column ${index + 1}`,
                    value: cleanText(cell),
                  }))
                  .filter(
                    (field) => field.value && !actionHeading.test(field.label),
                  ),
              });
            };
            row.addEventListener("click", openDialog);
            listeners.push([row, openDialog]);
          });
        });
      });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", decorate);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", decorate);
      listeners.forEach(([row, handler]) => {
        row.removeEventListener("click", handler);
        delete row.dataset.mobileDialogReady;
      });
    };
  }, [location.pathname, location.search]);

  function openRecord() {
    if (!dialog?.row) return;
    dialog.row.dataset.allowOriginalClick = "true";
    dialog.row.click();
    delete dialog.row.dataset.allowOriginalClick;
    setDialog(null);
  }

  if (!dialog) return null;
  return (
    <Dialog title={dialog.title} description="Record details" onClose={() => setDialog(null)} closeLabel="Close details" closeOnBackdrop size="md" className="bp-record-details-dialog">
        <dl className="bp-mobile-table-fields">
          {dialog.fields.map((field, index) => (
            <div key={`${field.label}-${index}`}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <button
            type="button"
            className="bp-mobile-table-close bp-ui-action"
            onClick={() => setDialog(null)}
          >
            Close
          </button>
          {dialog.openOriginal && (
            <button
              type="button"
              className="bp-mobile-table-open bp-ui-action"
              onClick={openRecord}
            >
              Open record <ArrowRight />
            </button>
          )}
        </DialogFooter>
    </Dialog>
  );
}
