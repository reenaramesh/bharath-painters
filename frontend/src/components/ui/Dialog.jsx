import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { lockBodyScroll } from "../../utils/bodyScrollLock";
import { useLanguage } from '../../i18n/LanguageContext';

export function Dialog({
  title,
  children,
  onClose,
  className = "",
  size = "md",
  showClose = true,
  description,
  icon: Icon,
  closeLabel = 'Close dialog',
  bodyClassName = '',
  closeOnBackdrop = false,
}) {
  const { t } = useLanguage();
  const ref = useRef(null);
  const titleId = useRef(null);
  const headingId = useId();
  const descriptionId = `${headingId}-description`;
  const previousFocus = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    previousFocus.current = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    dialog?.showModal();
    titleId.current?.focus({ preventScroll: true });
    return () => {
      if (dialog?.open) dialog.close();
      releaseScrollLock();
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
    const controls = [...ref.current.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    )].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    if (!controls.length) return;
    if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === titleId.current)) {
      event.preventDefault();
      controls[controls.length - 1]?.focus();
    } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
      event.preventDefault();
      controls[0]?.focus();
    }
  }

  const sizeClasses = {
    sm: "bp-dialog-sm",
    md: "bp-dialog-md",
    lg: "bp-dialog-lg",
    xl: "bp-dialog-xl",
    full: "bp-dialog-full",
  };

  return (
    <dialog
      ref={ref}
      className={`bp-dialog ${sizeClasses[size] || sizeClasses.md} ${className}`.trim()}
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      onKeyDown={handleKeyDown}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(event) => {
        if (!closeOnBackdrop || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
    >
      <header className="bp-dialog-header">
        <div className="bp-dialog-heading">
        {Icon && <span className="bp-dialog-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.8} /></span>}
        <div className="bp-dialog-title-wrapper">
          <h2 ref={titleId} id={headingId} tabIndex={-1} className="bp-dialog-title">
            {title}
          </h2>
          {description && <p id={descriptionId} className="bp-dialog-description">{typeof description === 'string' ? t(description) : description}</p>}
        </div>
        </div>
        {showClose && (
          <button
            type="button"
            className="bp-dialog-close"
            onClick={onClose}
            aria-label={t(closeLabel)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className={`bp-dialog-body ${bodyClassName}`.trim()}>{children}</div>
    </dialog>
  );
}

export function DialogFooter({ children, className = "" }) {
  return (
    <footer className={`bp-dialog-footer ${className}`.trim()}>
      {children}
    </footer>
  );
}
