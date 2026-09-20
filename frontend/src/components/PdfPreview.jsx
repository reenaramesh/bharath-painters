import { useEffect, useRef, useState } from "react";
import { Download, Eye, Printer, X } from "lucide-react";

const PREVIEW_EVENT = "bharath-painters:preview-pdf";

export function previewPdf(blob, filename = "document.pdf") {
  window.dispatchEvent(
    new CustomEvent(PREVIEW_EVENT, { detail: { blob, filename } }),
  );
}

export default function PdfPreviewHost() {
  const [preview, setPreview] = useState(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const open = (event) => {
      const { blob, filename } = event.detail || {};
      if (!blob) return;
      setPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          url: URL.createObjectURL(blob),
          filename: filename || "document.pdf",
        };
      });
    };
    window.addEventListener(PREVIEW_EVENT, open);
    return () => window.removeEventListener(PREVIEW_EVENT, open);
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview]);

  function close() {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function download() {
    if (!preview) return;
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = preview.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function print() {
    if (!preview) return;
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) {
      frameWindow.focus();
      frameWindow.print();
    }
  }

  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-950/80 p-2 backdrop-blur-sm sm:p-5">
      <section className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            <Eye className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">PDF preview</p>
            <h2 className="truncate font-bold text-slate-950">{preview.filename}</h2>
          </div>
          <button
            type="button"
            onClick={print}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close PDF preview"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <iframe
          ref={frameRef}
          src={preview.url}
          title={`Preview ${preview.filename}`}
          className="min-h-0 flex-1 bg-slate-100"
        />
        <p className="border-t bg-slate-50 px-4 py-2 text-center text-xs text-slate-500 sm:hidden">
          If your phone cannot display the preview, use the download button above.
        </p>
      </section>
    </div>
  );
}
