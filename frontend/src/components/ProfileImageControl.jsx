import { useEffect, useRef, useState } from "react";
import { Camera, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
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
  onFileChange,
  onPositionChange,
  onRemove,
}) {
  const inputRef = useRef(null);
  const stageRef = useRef(null);
  const pointerRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => normalizeProfileImagePosition(position));
  const [previewUrl, setPreviewUrl] = useState("");
  const currentPosition = normalizeProfileImagePosition(position);
  const source = previewUrl || existingUrl;
  const hasImage = Boolean(file || existingUrl);
  const frameShape = shape === "circle" ? "rounded-full" : shape === "rectangle" ? "rounded-xl" : "rounded-2xl";
  const previewFrame = shape === "rectangle" ? "h-12 w-20" : "h-16 w-16";
  const editorFrame = shape === "rectangle" ? "h-52 w-full max-w-[320px]" : "h-64 w-64";

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
    if (!editing) setDraft(normalizeProfileImagePosition(position));
  }, [editing, position]);

  const imageStyle = profileImageStyle(currentPosition);
  const draftStyle = profileImageStyle(draft);

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    if (selected) {
      onPositionChange({ ...DEFAULT_PROFILE_IMAGE_POSITION });
      onFileChange(selected);
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
    setEditing(true);
  }

  function savePosition() {
    onPositionChange(normalizeProfileImagePosition(draft));
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
        <div className={`grid ${previewFrame} shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50 ${frameShape}`}>
          {source ? <img data-profile-image-preview={label} src={source} alt={`${label} preview`} className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} style={imageStyle} /> : <Camera className="h-6 w-6 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{label}</p>
          <p className="truncate text-xs text-slate-500" title={file?.name || existingUrl || ""}>{file?.name || (existingUrl ? "Current image" : "No image selected")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{hasImage ? "Replace" : "Upload"}</button>
            {hasImage && <button type="button" onClick={openEditor} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"><Move className="h-3.5 w-3.5" />Adjust position</button>}
            {hasImage && onRemove && <button type="button" onClick={removeImage} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700">Remove</button>}
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture={capture} onChange={chooseFile} className="sr-only" aria-label={`Upload ${label}`} />
        </div>
      </div>
      {editing && source && createPortal(
        <div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-slate-950/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="profile-image-editor-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
          <section className={`profile-image-editor my-auto w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6 ${className ? `${className}-dialog` : ""}`.trim()}>
            <header className="flex items-start justify-between gap-4">
              <div><h2 id="profile-image-editor-title" className="text-lg font-bold text-slate-900">Adjust {label.toLowerCase()}</h2><p className="mt-1 text-sm text-slate-500">Drag the image to position it, then zoom to fit the frame.</p></div>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Close</button>
            </header>
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
              <button type="button" onClick={resetPosition} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4" />Center / reset</button>
              <div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={savePosition} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Apply position</button></div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
