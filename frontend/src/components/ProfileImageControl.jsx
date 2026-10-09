import { useEffect, useRef, useState } from "react";
import { Camera, Move, RotateCcw, ZoomIn, ZoomOut, Trash2 } from "lucide-react";
import { lockBodyScroll } from "../utils/bodyScrollLock";
import { createPortal } from "react-dom";
import {
  DEFAULT_PROFILE_IMAGE_POSITION,
  normalizeProfileImagePosition,
  profileImageStyle,
} from "../utils/profileImagePosition";

export default function ProfileImageControl({
  label,
  file,
  existingUrl,
  position,
  shape = "square",
  fit = "cover",
  capture,
  className = "",
  compact = false,
  onFileChange,
  onPositionChange,
  onShapeChange,
  onRemove,
}) {
  const inputRef = useRef(null);
  const stageRef = useRef(null);
  const modalRef = useRef(null);
  const pointerRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draftShape, setDraftShape] = useState(shape);
  const [draft, setDraft] = useState(() => normalizeProfileImagePosition(position));
  const [previewUrl, setPreviewUrl] = useState("");
  const currentPosition = normalizeProfileImagePosition(position);
  const source = previewUrl || existingUrl;
  const hasImage = Boolean(file || existingUrl);
  const activeShape = editing && onShapeChange ? draftShape : shape;
  const frameShape = activeShape === "circle" ? "rounded-full" : activeShape === "rectangle" ? "rounded-xl" : "rounded-2xl";
  const previewFrame = shape === "rectangle" ? "h-12 w-20" : "h-16 w-16";
  const editorFrame = activeShape === "rectangle" ? "h-52 w-full max-w-[320px]" : "h-64 w-64";

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!editing) { setDraft(normalizeProfileImagePosition(position)); setDraftShape(shape); }
  }, [editing, position, shape]);

  useEffect(() => {
    if (!editing || !source) return;
    const previous = document.activeElement;
    const release = lockBodyScroll();
    const modal = modalRef.current;
    modal?.querySelector('button')?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') setEditing(false);
      if (event.key !== 'Tab') return;
      const nodes = [...(modal?.querySelectorAll('button, input, select, [tabindex="0"]') || [])].filter(node => !node.disabled);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { release(); document.removeEventListener('keydown', handleKey); previous?.focus?.(); };
  }, [editing, source]);

  const imageStyle = profileImageStyle(currentPosition);
  const draftStyle = profileImageStyle(draft);

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    if (selected) {
      onPositionChange({ ...DEFAULT_PROFILE_IMAGE_POSITION });
      onFileChange(selected);
      if (compact) { setDraft({ ...DEFAULT_PROFILE_IMAGE_POSITION }); setEditing(true); }
    }
    event.target.value = "";
  }

  function updateDraft(patch) {
    setDraft((current) => normalizeProfileImagePosition({ ...current, ...patch }));
  }

  function onPointerDown(event) {
    if (!stageRef.current) return;
    event.preventDefault();
    stageRef.current.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, position: draft };
  }

  function onPointerMove(event) {
    const start = pointerRef.current;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!start || !bounds) return;
    const scale = Math.max(start.position.zoom - 1, 0.25);
    updateDraft({
      x: start.position.x - ((event.clientX - start.x) / bounds.width) * (50 / scale),
      y: start.position.y - ((event.clientY - start.y) / bounds.height) * (50 / scale),
    });
  }

  function finishDrag() {
    pointerRef.current = null;
  }

  function moveByKeyboard(event) {
    const delta = event.shiftKey ? 5 : 1;
    const moves = {
      ArrowLeft: { x: draft.x - delta },
      ArrowRight: { x: draft.x + delta },
      ArrowUp: { y: draft.y - delta },
      ArrowDown: { y: draft.y + delta },
    };
    if (moves[event.key]) {
      event.preventDefault();
      updateDraft(moves[event.key]);
    }
  }

  function openEditor() {
    setDraft(currentPosition);
    setDraftShape(shape);
    setEditing(true);
  }

  function savePosition() {
    onPositionChange(normalizeProfileImagePosition(draft));
    onShapeChange?.(draftShape);
    setEditing(false);
  }

  function resetPosition() {
    setDraft({ ...DEFAULT_PROFILE_IMAGE_POSITION });
  }

  function removeImage() {
    if (file) {
      onFileChange(null);
      onPositionChange({ ...DEFAULT_PROFILE_IMAGE_POSITION });
    } else {
      onRemove?.();
    }
  }

  return (
    <div className={`profile-image-control min-w-0 rounded-xl border border-slate-200 bg-white p-3 ${className}`.trim()}>
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => source ? openEditor() : inputRef.current?.click()} aria-label={`View and adjust ${label}`} className={`grid ${previewFrame} shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50 ${frameShape}`}>
          {source ? <img data-profile-image-preview={label} src={source} alt={`${label} preview`} className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} style={imageStyle} /> : <Camera className="h-6 w-6 text-slate-400" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{label}</p>
          <p className="truncate text-xs text-slate-500" title={file?.name || existingUrl || ""}>{compact ? (hasImage ? 'Click image to view and adjust' : 'Choose an image') : file?.name || (existingUrl ? "Current image" : "No image selected")}</p>
          {!compact && <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{hasImage ? "Replace" : "Upload"}</button>
            {hasImage && <button type="button" onClick={openEditor} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"><Move className="h-3.5 w-3.5" />Adjust position</button>}
            {hasImage && onRemove && <button type="button" onClick={removeImage} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700">Remove</button>}
          </div>}
          <input ref={inputRef} type="file" accept="image/*" capture={capture} onChange={chooseFile} className="sr-only" aria-label={`Upload ${label}`} />
        </div>
        {compact && <button type="button" onClick={() => inputRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border" aria-label={`Change ${label}`} title={`Change ${label}`}><Camera size={18} /></button>}
      </div>
      {editing && source && createPortal(
        <div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-slate-950/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="profile-image-editor-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
          <section ref={modalRef} className={`profile-image-editor my-auto w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6 ${className ? `${className}-dialog` : ""}`.trim()}>
            <header className="flex items-start justify-between gap-4">
              <div><h2 id="profile-image-editor-title" className="text-lg font-bold text-slate-900">Adjust {label.toLowerCase()}</h2><p className="mt-1 text-xs text-slate-500">Drag the image or use arrow keys, then apply and save settings.</p></div>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Close</button>
            </header>
            {onShapeChange && <label className="mt-4 block text-sm font-semibold text-slate-800">Logo shape<select className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3" value={draftShape} onChange={event => setDraftShape(event.target.value)}><option value="circle">Round</option><option value="rectangle">Rectangle</option></select></label>}
            <div className="mt-5 flex justify-center rounded-xl bg-slate-100 p-5 sm:p-8">
              <div ref={stageRef} className={`${editorFrame} touch-none overflow-hidden border-2 border-dashed border-slate-400 bg-white ${frameShape}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={moveByKeyboard} tabIndex={0} role="application" aria-label={`Position ${label.toLowerCase()}; use arrow keys to move the image`}>
                <img src={source} alt="" draggable="false" className={`h-full w-full select-none ${fit === "contain" ? "object-contain" : "object-cover"}`} style={draftStyle} />
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <ZoomOut className="h-4 w-4 shrink-0 text-slate-500" />
              <input aria-label={`${label} zoom`} type="range" min="1" max="3" step="0.01" value={draft.zoom} onChange={(event) => updateDraft({ zoom: Number(event.target.value) })} className="w-full accent-slate-900" />
              <ZoomIn className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="w-12 text-right text-xs tabular-nums text-slate-500">{Math.round(draft.zoom * 100)}%</span>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4">
              <div className="flex gap-2"><button type="button" onClick={resetPosition} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4" />Center / reset</button>{compact && <button type="button" onClick={() => inputRef.current?.click()} className="grid h-11 w-11 place-items-center rounded-lg border" aria-label={`Change ${label}`} title="Change image"><Camera size={18} /></button>}{compact && onRemove && <button type="button" onClick={() => { removeImage(); setEditing(false); }} className="grid h-11 w-11 place-items-center rounded-lg border text-rose-700" aria-label={`Remove ${label}`} title="Remove image"><Trash2 size={18} /></button>}</div>
              <div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={savePosition} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Apply position</button></div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
