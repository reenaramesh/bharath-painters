import { useId, useRef, useState } from 'react';
import { Ellipsis, Eye, Pencil, Trash2 } from 'lucide-react';

export default function QuotationAssignmentActions({ name, onView, onEdit, onDelete }) {
  const id = useId();
  const trigger = useRef(null);
  const panel = useRef(null);
  const initialFocus = useRef(0);
  const [open, setOpen] = useState(false);
  const actions = [{label:'View',Icon:Eye,run:onView},{label:'Edit',Icon:Pencil,run:onEdit},{label:'Delete',Icon:Trash2,run:onDelete}];
  const position = () => {
    const rect = trigger.current.getBoundingClientRect();
    const height = 144;
    panel.current.style.left = `${Math.max(8,Math.min(rect.right-176,window.innerWidth-184))}px`;
    panel.current.style.top = `${Math.max(8,rect.bottom+height+8 > window.innerHeight ? rect.top-height-4 : rect.bottom+4)}px`;
  };
  const close = () => { panel.current.hidePopover(); trigger.current.focus(); };
  return <>
    <button ref={trigger} type="button" className="bp-ui-icon-action gq-assignment-menu-trigger" popoverTarget={id} aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id} title="Actions" onClick={() => { initialFocus.current=0; position(); }} onKeyDown={event => {
      if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
      event.preventDefault(); initialFocus.current=event.key==='ArrowUp'?2:0; position(); panel.current.showPopover();
    }}><Ellipsis size={20} aria-hidden="true" /></button>
    <div ref={panel} id={id} popover="auto" role="menu" aria-label={`Actions for ${name}`} className="gq-assignment-menu" onToggle={event => {
      setOpen(event.newState==='open');
      if (event.newState==='open') panel.current.querySelectorAll('button')[initialFocus.current]?.focus();
    }} onKeyDown={event => {
      const buttons = [...panel.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        buttons[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowDown'?1:2))%3]?.focus();
      } else if (event.key==='Escape') { event.preventDefault(); close(); }
      else if (event.key==='Tab') close();
    }}>{actions.map(({label,Icon,run}) => <button key={label} type="button" role="menuitem" tabIndex={-1} className={label==='Delete'?'is-danger':undefined} onClick={() => { close(); run(); }}><Icon size={17} aria-hidden="true" />{label}</button>)}</div>
  </>;
}
