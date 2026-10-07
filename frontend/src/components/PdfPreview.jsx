import { lockBodyScroll } from "../utils/bodyScrollLock.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  LoaderCircle,
  Printer,
  Share2,
  X,
} from "lucide-react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import api, { pdfRequests } from "../api/client";
import { languages, useLanguage } from "../i18n/LanguageContext";
import useAuth from '../context/useAuth';

const PREVIEW_EVENT = "bharath-painters:preview-pdf";

export function previewPdf(blob, filename = "document.pdf") {
  window.dispatchEvent(
    new CustomEvent(PREVIEW_EVENT, { detail: { blob, filename } }),
  );
}

export default function PdfPreviewHost() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const viewerId = user?.id;
  const [preview, setPreview] = useState(null);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const generation = useRef(0);
  const [notice, setNotice] = useState("");
  const frameRef = useRef(null);
  const close = useCallback(() => {
    generation.current += 1;
    setChangingLanguage(false);
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);
  useEffect(() => { close(); }, [viewerId, close]);

  useEffect(() => {
    const open = (event) => {
      const { blob, filename } = event.detail || {};
      if (!blob) return;
      generation.current += 1;
      setNotice("");
      setPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          url: URL.createObjectURL(blob),
          blob,
          filename: filename || "document.pdf",
          request: pdfRequests.get(blob),
          language: pdfRequests.get(blob)?.params?.document_language || "en",
        };
      });
    };
    window.addEventListener(PREVIEW_EVENT, open);
    return () => window.removeEventListener(PREVIEW_EVENT, open);
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview, close]);

  async function changePdfLanguage(language) {
    if (!preview?.request) return;
    const requestId = ++generation.current;
    setChangingLanguage(true); setNotice("");
    try {
      const { data } = await api({ ...preview.request, params: { ...preview.request.params, document_language: language } });
      if (requestId !== generation.current) return;
      setPreview((current) => {
        if (!current) return null;
        URL.revokeObjectURL(current.url);
        return { ...current, blob: data, url: URL.createObjectURL(data), language,
          filename: current.filename.replace(/(?:-(en|kn|te|hi|ta))?\.pdf$/i, `-${language}.pdf`) };
      });
    } catch { if (requestId === generation.current) setNotice("The requested PDF language could not be generated. The previous PDF remains available."); }
    finally { if (requestId === generation.current) setChangingLanguage(false); }
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

  async function share() {
    if (!preview) return;
    const file = new File([preview.blob], preview.filename, {
      type: preview.blob.type || "application/pdf",
    });
    const shareData = {
      title: preview.filename,
      files: [file],
    };

    try {
      if (
        window.navigator.share &&
        (!window.navigator.canShare || window.navigator.canShare(shareData))
      ) {
        await window.navigator.share(shareData);
        return;
      }
      download();
      setNotice(
        "Direct sharing is not supported on this device. The PDF was downloaded so you can share it from your files.",
      );
    } catch (error) {
      if (error?.name !== "AbortError") {
        download();
        setNotice(
          "The share menu could not be opened. The PDF was downloaded instead.",
        );
      }
    }
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
        <header className="flex items-center gap-1 border-b border-slate-200 px-3 py-3 sm:gap-3 sm:px-5">
          <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white sm:grid">
            <Eye className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">PDF preview</p>
            <h2 className="truncate font-bold text-slate-950">{preview.filename}</h2>
          </div>
          <button
            type="button"
            onClick={print}
            disabled={changingLanguage}
            title="Print PDF"
            aria-label="Print PDF"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 p-0 text-sm font-bold text-slate-700 sm:w-auto sm:px-3"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button
            type="button"
            onClick={share}
            title="Share PDF"
            aria-label="Share PDF"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-0 text-sm font-bold text-emerald-700 sm:w-auto sm:px-3"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button
            type="button"
            onClick={download}
            disabled={changingLanguage}
            title="Download PDF"
            aria-label="Download PDF"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 p-0 text-sm font-bold text-white sm:w-auto sm:px-4"
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
        {preview.request && <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
          <label htmlFor="preview-pdf-language" className="text-sm font-semibold">{t("pdfLanguage")}</label>
          <select id="preview-pdf-language" value={preview.language} disabled={changingLanguage} onChange={(event) => changePdfLanguage(event.target.value)} className="min-h-11 rounded-lg border bg-white px-3 text-sm">
            {languages.map(([code, nativeName]) => <option key={code} value={code}>{nativeName}</option>)}
          </select>
          
          <span role="status" className="text-sm text-slate-600">{changingLanguage ? t("saving") : ""}</span>
        </div>}
        {notice && (
          <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800">
            {notice}
          </p>
        )}
        <iframe
          ref={frameRef}
          src={preview.url}
          title={`Preview ${preview.filename}`}
          className="hidden min-h-0 flex-1 bg-slate-100 md:block"
        />
        <MobilePdfPreview blob={preview.blob} />
      </section>
    </div>
  );
}

function MobilePdfPreview({ blob }) {
  const containerRef = useRef(null);
  const [enabled, setEnabled] = useState(() =>
    window.matchMedia("(max-width: 767px)").matches,
  );
  const [documentProxy, setDocumentProxy] = useState(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setEnabled(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const updateWidth = () => setWidth(Math.max(container.clientWidth - 24, 0));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let task;
    setDocumentProxy(null);
    setError("");

    Promise.all([blob.arrayBuffer(), import("pdfjs-dist")])
      .then(([data, pdfjs]) => {
        if (!active) return null;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        task = pdfjs.getDocument({ data });
        return task.promise;
      })
      .then((pdf) => {
        if (active && pdf) setDocumentProxy(pdf);
      })
      .catch(() => {
        if (active) setError("PDF preview could not be displayed.");
      });

    return () => {
      active = false;
      task?.destroy();
    };
  }, [blob, enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto bg-slate-200 p-3 md:hidden"
    >
      {!documentProxy && !error && (
        <div className="grid min-h-full place-items-center py-16 text-slate-600">
          <div className="text-center">
            <LoaderCircle className="mx-auto h-7 w-7 animate-spin" />
            <p className="mt-3 text-sm font-semibold">Preparing preview...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-white p-5 text-center shadow">
          <p className="font-bold text-slate-900">{error}</p>
          
        </div>
      )}
      {documentProxy && width > 0 && (
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {Array.from(
            { length: documentProxy.numPages },
            (_, index) => (
              <PdfCanvasPage
                key={index + 1}
                documentProxy={documentProxy}
                pageNumber={index + 1}
                availableWidth={width}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function PdfCanvasPage({ documentProxy, pageNumber, availableWidth }) {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let renderTask;
    setLoading(true);

    documentProxy.getPage(pageNumber).then((page) => {
      if (!active) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: cssScale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d", { alpha: false });

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform:
          outputScale === 1
            ? null
            : [outputScale, 0, 0, outputScale, 0, 0],
      });
      renderTask.promise
        .then(() => {
          if (active) setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [availableWidth, documentProxy, pageNumber]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-white shadow-md">
      {loading && (
        <div className="absolute inset-0 grid min-h-80 place-items-center bg-white">
          <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="block max-w-full"
        aria-label={`PDF page ${pageNumber}`}
      />
      <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-white">
        {pageNumber}
      </span>
    </div>
  );
}
