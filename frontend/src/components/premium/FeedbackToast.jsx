import { CheckCircle2, X } from 'lucide-react';

/** Feedback comes from the caller's completed action, never an assumed success. */
export default function FeedbackToast({ message, onDismiss }) {
  if (!message) return null;
  return <div className="premium-feedback-toast" role="status" aria-live="polite" aria-atomic="true">
    <CheckCircle2 size={20} aria-hidden="true" />
    <p>{message}</p>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={18} aria-hidden="true" /></button>}
  </div>;
}
