import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { CircleHelp } from "lucide-react";
import useAuth from "../context/useAuth";
import { Button } from "./ui";
import { Dialog } from "./ui/Dialog";
import { cancelConfirmation, installConfirmationHost, settleConfirmation } from "../utils/confirmAction.js";

export default function ConfirmationProvider({ children }) {
  const [request, setRequest] = useState(null);
  const noButton = useRef(null);
  const dialogRef = useRef(null);
  const { user } = useAuth();
  const userId = useRef(user?.id);
  userId.current = user?.id;
  const location = useLocation();
  useEffect(() => installConfirmationHost(next => {
    // Release native modal inertness before an awaiting handler resumes.
    if (!next) dialogRef.current?.close();
    setRequest(next);
  }, () => `${window.location.pathname}${window.location.search}|${userId.current ?? ""}`), []);
  useEffect(() => { cancelConfirmation(); }, [location.key, user?.id]);
  return <>{children}{request && createPortal(
    <Dialog key={request.id} title={request.question} description={request.detail || undefined} icon={CircleHelp} size="sm"
      showClose={false} popupProtection="readonly" isolateEvents initialFocusRef={noButton} dialogRef={dialogRef} onClose={() => settleConfirmation(request.id, false)}>
      <div className="flex justify-end gap-3">
        <Button ref={noButton} type="button" variant="secondary" onClick={() => settleConfirmation(request.id, false)}>No</Button>
        <Button type="button" onClick={() => settleConfirmation(request.id, true)}>Yes</Button>
      </div>
    </Dialog>, document.body
  )}</>;
}
