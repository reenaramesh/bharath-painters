import { useId, useRef } from "react";
import { Ellipsis, Forward, Pencil, Reply, Trash2 } from "lucide-react";
import { messageActions } from "../utils/chatPresentation.mjs";

const options = {
  reply: { label: "Reply", Icon: Reply },
  forward: { label: "Forward", Icon: Forward },
  edit: { label: "Edit", Icon: Pencil },
  delete: { label: "Delete", Icon: Trash2 },
};

export default function ChatMessageOptions({ message, onReply, onForward, onEdit, onDelete }) {
  const id = useId();
  const panel = useRef(null);
  const trigger = useRef(null);
  const actions = messageActions(message);
  if (!actions.length) return null;
  const handlers = { reply: onReply, forward: onForward, edit: onEdit, delete: onDelete };

  function positionPanel() {
    const rect = trigger.current.getBoundingClientRect();
    const menu = panel.current;
    const height = actions.length * 44 + 10;
    menu.style.left = `${Math.max(8, Math.min(rect.right - 164, window.innerWidth - 172))}px`;
    menu.style.top = `${Math.max(8, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 4 : rect.bottom + 4)}px`;
  }

  return <>
    <button ref={trigger} type="button" className="chat-options-trigger" popoverTarget={id} aria-label="Message options" title="Message options" onClick={positionPanel}><Ellipsis size={16} aria-hidden="true" /></button>
    <div ref={panel} id={id} popover="auto" className="chat-options-popover" aria-label="Message options" onToggle={(event) => { if (event.newState === "open") panel.current.querySelector("button")?.focus(); }}>
      {actions.map((action) => {
        const { label, Icon } = options[action];
        return <button key={action} type="button" className={action === "delete" ? "is-danger" : ""} onClick={() => { panel.current.hidePopover(); trigger.current.focus(); handlers[action](message); }}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>;
      })}
    </div>
  </>;
}
