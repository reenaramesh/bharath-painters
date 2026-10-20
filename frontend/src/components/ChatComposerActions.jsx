import { useId, useRef } from "react";
import { Ellipsis, Palette, Paperclip } from "lucide-react";

export default function ChatComposerActions({ onAttach, onColour }) {
  const id = useId();
  const panel = useRef(null);
  const trigger = useRef(null);
  function positionPanel() {
    const rect = trigger.current.getBoundingClientRect();
    panel.current.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 228))}px`;
    panel.current.style.top = `${Math.max(8, rect.top - 108)}px`;
  }
  function choose(action) {
    panel.current.hidePopover();
    trigger.current.focus();
    action();
  }
  return <>
    <button ref={trigger} type="button" popoverTarget={id} onClick={positionPanel} className="chat-composer-action grid h-11 w-11 shrink-0 place-items-center rounded-xl bp-ui-icon-action" aria-label="Message tools" title="Message tools"><Ellipsis className="h-5 w-5" aria-hidden="true" /></button>
    <div ref={panel} id={id} popover="auto" className="chat-options-popover chat-composer-popover" aria-label="Message tools" onToggle={(event) => { if (event.newState === "open") panel.current.querySelector("button")?.focus(); }}>
      <button type="button" onClick={() => choose(onAttach)}><Paperclip size={16} aria-hidden="true" />Attach media or file</button>
      <button type="button" onClick={() => choose(onColour)}><Palette size={16} aria-hidden="true" />Choose paint colour</button>
    </div>
  </>;
}
