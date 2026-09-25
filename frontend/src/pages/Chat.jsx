import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ContactRound, MessageCircle, Pencil, Search, Send, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function Chat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const endRef = useRef(null);
  const messagesRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const requestedId = Number(searchParams.get("conversation"));
      const requestedCustomer = Number(searchParams.get("customer"));
      const { data } = await api.get("/quotations/chat/conversations/", {
        params: requestedId ? { conversation: requestedId } : {},
      });
      let rows = data;
      if (user?.role === "CONTRACTOR" && requestedCustomer && !rows.some((item) => item.customer_id === requestedCustomer)) {
        const { data: opened } = await api.post("/quotations/chat/conversations/", { customer: requestedCustomer });
        rows = [opened, ...rows.filter((item) => item.id !== opened.id)];
      }
      setConversations(rows);
      setSelected((current) => requestedCustomer
        ? rows.find((item) => item.customer_id === requestedCustomer) || rows[0] || null
        : requestedId
        ? rows.find((item) => item.id === requestedId) || rows[0] || null
        : current
          ? rows.find((item) => item.id === current.id) || current
          : null);
    } catch {
      setError("Conversations could not be loaded.");
    }
  }, [searchParams, user?.role]);

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!selected) return;
      try {
        const { data } = await api.get(
          `/quotations/chat/conversations/${selected.id}/messages/`,
        );
        setMessages((current) =>
          JSON.stringify(current) === JSON.stringify(data) ? current : data,
        );
        if (!silent) setError("");
      } catch {
        if (!silent) setError("Messages could not be loaded.");
      }
    },
    [selected],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    const timer = window.setInterval(loadConversations, 30000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);
  useEffect(() => {
    loadMessages();
    const timer = window.setInterval(() => loadMessages(true), 3000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(event) {
    event.preventDefault();
    const message = text.trim();
    if (!message || !selected) return;
    setText("");
    try {
      await api.post(
        `/quotations/chat/conversations/${selected.id}/messages/`,
        { text: message },
      );
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (err) {
      setText(message);
      setError(err.response?.data?.text || "Message could not be sent.");
    }
  }

  async function saveEdit(messageId) {
    const message = editingText.trim();
    if (!message) return;
    try {
      await api.patch(`/quotations/chat/messages/${messageId}/`, { text: message });
      setEditingId(null);
      setEditingText("");
      setError("");
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (err) {
      setError(err.response?.data?.text || "Message could not be updated.");
    }
  }

  async function deleteMessage(messageId) {
    if (!window.confirm("Delete this message?")) return;
    try {
      await api.delete(`/quotations/chat/messages/${messageId}/`);
      if (editingId === messageId) {
        setEditingId(null);
        setEditingText("");
      }
      setError("");
      await Promise.all([loadMessages(), loadConversations()]);
    } catch {
      setError("Message could not be deleted.");
    }
  }

  async function openContacts() {
    setPickerOpen(true);
    setCustomerSearch("");
    if (customers.length) return;
    setLoadingContacts(true);
    try {
      const { data } = await api.get("/quotations/customers/");
      setCustomers(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError("Customer contacts could not be loaded.");
    } finally {
      setLoadingContacts(false);
    }
  }

  async function chooseCustomer(customer) {
    try {
      const { data } = await api.post("/quotations/chat/conversations/", { customer: customer.id });
      setConversations((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setSelected(data);
      setPickerOpen(false);
      setCustomerSearch("");
      setError("");
    } catch {
      setError("This customer conversation could not be opened.");
    }
  }

  const customerMatches = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const matches = customers.filter((customer) => !term || [customer.name, customer.mobile, customer.bharath_id, customer.email].some((value) => String(value || "").toLowerCase().includes(term)));
    return term ? matches.slice(0, 30) : matches.slice(0, 5);
  }, [customers, customerSearch]);

  const conversationTitle = (item) =>
    user?.role === "CUSTOMER" || user?.role === "PAINTER"
      ? item.contractor_name
      : item.participant_type === "PAINTER"
        ? item.painter_name
        : item.customer_name;
  const conversationTime = (item) =>
    item.last_message_at
      ? new Date(item.last_message_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return (
    <>
    <div className="flex min-h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <aside
        className={`${selected ? "hidden md:block" : "block"} w-full border-r md:w-80`}
      >
        <div className="border-b p-5">
          <p className="text-sm font-semibold text-amber-600">
            Internal communication
          </p>
          <h1 className="mt-1 text-2xl font-bold">Messages</h1>
          {user?.role === "CONTRACTOR" && (
            <button type="button" onClick={openContacts} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"><ContactRound className="h-4 w-4" />Customer contacts</button>
          )}
        </div>
        <p className="border-b bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Recent conversations</p>
        {conversations.length ? (
          <div className="divide-y">
            {conversations.map((item) => {
              const title = conversationTitle(item);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className={`flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 ${selected?.id === item.id ? "bg-slate-50" : ""}`}
                >
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">
                    {title?.trim()?.charAt(0)?.toUpperCase() || "?"}
                    <i
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${item.is_online ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-slate-900">
                        {title}
                      </strong>
                      {item.is_online && (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Online
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {conversationTime(item)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-slate-500">
                        {item.last_message || "Start a conversation"}
                      </span>
                      {item.unread_count > 0 && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          {item.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-400">
            <MessageCircle className="mx-auto mb-3 h-9 w-9" />
            No recent conversations.
          </div>
        )}
      </aside>
      <section
        className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}
      >
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b p-4">
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border px-3 py-2 text-sm md:hidden"
              >
                Back
              </button>
              <span
                className={`h-2.5 w-2.5 rounded-full ${selected.is_online ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-slate-900">
                  {conversationTitle(selected)}
                </h2>
                <p
                  className={`text-xs ${selected.is_online ? "font-semibold text-emerald-600" : "text-slate-400"}`}
                >
                  {selected.is_online
                    ? "Online"
                    : "Offline · messages will be delivered"}
                </p>
              </div>
            </header>
            {error && (
              <p className="bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div
              ref={messagesRef}
              className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.is_mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 ${message.is_mine ? "bg-slate-950 text-white" : "border bg-white text-slate-800"}`}
                  >
                    {editingId === message.id ? (
                      <div className="space-y-2">
                        <textarea autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={3} maxLength={4000} className="w-full min-w-52 rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-slate-950 outline-none" />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setEditingId(null); setEditingText(""); }} className="grid h-8 w-8 place-items-center rounded-lg border border-white/30" aria-label="Cancel editing"><X className="h-4 w-4" /></button>
                          <button type="button" onClick={() => saveEdit(message.id)} disabled={!editingText.trim()} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 disabled:opacity-40" aria-label="Save message"><Check className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                    )}
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span>
                      {message.is_mine && editingId !== message.id && <>
                        <button type="button" onClick={() => { setEditingId(message.id); setEditingText(message.text); }} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Edit message"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteMessage(message.id)} className="rounded p-1 text-red-300 hover:bg-white/10 hover:text-red-200" aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex gap-3 border-t p-4">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type a message"
                className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
              <button
                disabled={!text.trim()}
                className="grid h-12 w-12 place-items-center rounded-xl bg-slate-950 text-white disabled:opacity-40"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="m-auto text-center text-slate-400">
            <MessageCircle className="mx-auto h-10 w-10" />
            <p className="mt-3">Select a conversation</p>
          </div>
        )}
      </section>
    </div>
    {pickerOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-contact-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-4 sm:p-5"><h2 id="customer-contact-title" className="text-xl font-bold">Customer contacts</h2><button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close customer contacts"><X className="h-5 w-5" /></button></header>
        <div className="border-b p-4"><label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customer name or mobile" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingContacts ? <p className="p-8 text-center text-sm text-slate-400">Loading...</p> : customerMatches.length ? customerMatches.map((customer) => <button type="button" key={customer.id} onClick={() => chooseCustomer(customer)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{customer.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm text-slate-950">{customer.name}</b><small className="block truncate text-slate-500">{[customer.mobile, customer.bharath_id].filter(Boolean).join(" - ")}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-400">No matching customers.</p>}
        </div>
      </section>
    </div>}
    </>
  );
}
