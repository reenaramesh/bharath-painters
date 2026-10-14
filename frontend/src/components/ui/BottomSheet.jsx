import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { lockBodyScroll } from "../../utils/bodyScrollLock";
import { createPortal } from "react-dom";

export function BottomSheet({
  title,
  subtitle,
  children,
  onClose,
  className = "",
  showHandle = true,
  showClose = true,
  footer,
}) {
  const ref = useRef(null);
  const previousFocus = useRef(null);
  const titleId = useId();

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    ref.current?.querySelector("input, select, button, textarea")?.focus();
    function onKey(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = [...ref.current.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'
      )];
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      releaseScrollLock();
      document.removeEventListener("keydown", onKey);
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="bp-bottom-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        ref={ref}
        className={`bp-bottom-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => { e.preventDefault(); }}
      >
        <header className="bp-bottom-sheet-header">
          {showHandle && <div className="bp-bottom-sheet-handle" />}
          <div className="bp-bottom-sheet-title">
            <h2 id={titleId} className="bp-bottom-sheet-title-text">{title}</h2>
            {subtitle && <p className="bp-bottom-sheet-subtitle">{subtitle}</p>}
          </div>
          {showClose && (
            <button type="button" className="bp-bottom-sheet-close" onClick={onClose} aria-label="Close">
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </header>
        <div className="bp-bottom-sheet-body">{children}</div>
        {footer && <footer className="bp-bottom-sheet-footer">{footer}</footer>}
      </form>
    </div>,
    document.body
  );
}
