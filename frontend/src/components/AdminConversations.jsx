import { useMemo, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import { groupAdminConversations } from '../utils/adminConversations';

const dateLabel = value => value ? new Date(value).toLocaleString() : '';

export default function AdminConversations({ messages }) {
  const [search,setSearch]=useState('');
  const contractors=useMemo(()=>groupAdminConversations(messages,search),[messages,search]);
  return <section className="admin-register admin-conversations rounded-xl border bg-white p-3">
    <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <input aria-label="Search conversations" placeholder="Search conversations..." value={search} onChange={event=>setSearch(event.target.value)} className="w-full min-w-0 border-0 bg-transparent text-sm outline-none" />
    </label>
    <p className="my-3 text-xs text-slate-500">{contractors.length} contractors · Select a contractor to view conversations.</p>
    <div className="space-y-2">
      {contractors.map(contractor=><ContractorConversations key={contractor.id} contractor={contractor} />)}
      {!contractors.length && <p className="py-6 text-center text-sm text-slate-500">{search ? 'No matching conversations.' : 'No conversations yet.'}</p>}
    </div>
  </section>;
}

function ContractorConversations({ contractor }) {
  const [selectedId,setSelectedId]=useState(null);
  const selected=contractor.threads.find(thread=>thread.id===selectedId) || contractor.threads[0];
  return <details className="admin-conversation-group rounded-lg border p-3">
    <summary className="min-h-11 cursor-pointer">
      <span className="ml-1 inline-flex max-w-full items-center gap-2 align-middle">
        <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0"><strong className="block break-words text-sm">{contractor.name}</strong><span className="block text-xs text-slate-500">{contractor.threads.length} conversations · Last activity {dateLabel(contractor.latest?.created_at)}</span></span>
      </span>
    </summary>
    <div className="admin-conversation-workspace mt-3">
      <nav aria-label={`Conversations for ${contractor.name}`} className="admin-conversation-participants">
        {contractor.threads.map(thread=><button key={thread.id} type="button" aria-pressed={selected.id===thread.id} onClick={()=>setSelectedId(thread.id)} className={`rounded-lg border p-3 text-left ${selected.id===thread.id ? 'bg-[var(--app-soft)] border-[var(--app-primary)]' : 'bg-white'}`}>
          <strong className="block break-words text-xs">{thread.name}</strong>
          <span className="block text-[11px] text-slate-500">{thread.bharathId}</span>
          <span className="mt-1 block break-words text-xs">{thread.latest?.text || 'Message'}</span>
        </button>)}
      </nav>
      <section aria-label={`Message history with ${selected.name}`} className="admin-conversation-history rounded-lg bg-slate-50 p-3">
        <h2 className="mb-3 text-sm font-bold">{selected.name}</h2>
        <ol className="space-y-3">
          {selected.messages.map(message=><li key={message.id} className={`flex ${message.sender_role==='CONTRACTOR' ? 'justify-end' : 'justify-start'}`}>
            <article className={`admin-message-bubble rounded-lg border p-3 ${message.sender_role==='CONTRACTOR' ? 'bg-[var(--app-soft)]' : 'bg-white'}`}>
              <p className="text-xs font-bold">{message.sender} <span className="font-normal text-slate-500">{message.sender_role?.replaceAll('_',' ')}</span></p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.text || 'No text content'}</p>
              <time dateTime={message.created_at} className="mt-2 block text-[10px] text-slate-500">{dateLabel(message.created_at)}</time>
            </article>
          </li>)}
        </ol>
      </section>
    </div>
  </details>;
}
