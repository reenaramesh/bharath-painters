import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ContactRound, FileText, Flag, Forward, Image as ImageIcon, MessageCircle, Palette, Paperclip, Pencil, Plus, Reply, Search, Send, ShieldBan, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import ChatColourPicker from "../components/ChatColourPicker";

export default function Chat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colourPickerOpen, setColourPickerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [chatTargets, setChatTargets] = useState([]);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
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
  useEffect(() => {
    setReplyTo(null);
    setFiles([]);
    setColourPickerOpen(false);
  }, [selected?.id]);

  function chooseFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    const combined = [...files, ...selectedFiles];
    if (combined.length > 5 || combined.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Attach at most five files, up to 10 MB each.");
    } else {
      setFiles(combined);
      setError("");
    }
    event.target.value = "";
  }

  async function send(event) {
    event.preventDefault();
    const message = text.trim();
    if ((!message && !files.length) || !selected || sending) return;
    setSending(true);
    try {
      const payload = new FormData();
      payload.append("text", message);
      if (replyTo) payload.append("reply_to", replyTo.id);
      files.forEach((file) => payload.append("files", file));
      await api.post(`/quotations/chat/conversations/${selected.id}/messages/`, payload, { headers: { "Content-Type": "multipart/form-data" } });
      setText("");
      setFiles([]);
      setReplyTo(null);
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (err) {
      setError(err.response?.data?.text || err.response?.data?.files || err.response?.data?.contact || err.response?.data?.reply_to || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function sendColour(colour) {
    if (!selected || sending) return;
    setSending(true);
    setError("");
    try {
      const payload = new FormData();
      payload.append("colour_id", String(colour.id));
      if (replyTo) payload.append("reply_to", String(replyTo.id));
      await api.post(`/quotations/chat/conversations/${selected.id}/messages/`, payload);
      setColourPickerOpen(false);
      setReplyTo(null);
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (requestError) {
      setError(requestError.response?.data?.colour || requestError.response?.data?.detail || "Colour could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(messageId) {
    const message = editingText.trim();
    const original = messages.find((item) => item.id === messageId);
    if (!message && !original?.attachments?.length && !original?.contact && !original?.colour) return;
    try {
      await api.patch(`/quotations/chat/messages/${messageId}/`, { text: message });
      setEditingId(null);
      setEditingText("");
      setError("");
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.text || "Message could not be updated.");
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
    } catch (err) {
      setError(err.response?.data?.detail || "Message could not be deleted.");
    }
  }

  async function downloadAttachment(attachment) {
    try {
      const { data } = await api.get(attachment.url, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Attachment could not be downloaded.");
    }
  }

  async function openContacts() {
    setPickerOpen(true);
    setCustomerSearch("");
    if (customers.length) return;
    setLoadingContacts(true);
    try {
      if (user?.role === "PAINTER") {
        const { data } = await api.get("/quotations/chat/contacts/");
        setChatTargets(data);
        return;
      }
      const { data } = await api.get("/quotations/customers/");
      setCustomers(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError("Customer contacts could not be loaded.");
    } finally {
      setLoadingContacts(false);
    }
  }

  async function openForward(message) {
    setForwardingMessage(message);
    setForwardSearch("");
    setError("");
    try {
      const { data } = await api.get("/quotations/chat/contacts/");
      setChatTargets(data);
    } catch {
      setError("Forward contacts could not be loaded.");
    }
  }

  async function forwardTo(target) {
    if (!forwardingMessage || forwardBusy) return;
    setForwardBusy(true);
    try {
      const payload = user?.role === "PAINTER" ? { contractor: target.id }
        : user?.role === "CUSTOMER" ? { connection: target.connection }
          : target.type === "PAINTER" ? { painter: target.id } : { customer: target.id };
      const { data: conversation } = await api.post("/quotations/chat/conversations/", payload);
      await api.post(`/quotations/chat/messages/${forwardingMessage.id}/forward/`, { conversation: conversation.id });
      setForwardingMessage(null);
      setSafetyNotice(`Message forwarded to ${target.name}.`);
      setError("");
      await loadConversations();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Message could not be forwarded.");
    } finally {
      setForwardBusy(false);
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

  async function choosePainterContact(contractor) {
    try {
      const { data } = await api.post("/quotations/chat/conversations/", { contractor: contractor.id });
      setConversations((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setSelected(data);
      setPickerOpen(false);
      setCustomerSearch("");
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.contractor || "Contractor conversation could not be opened.");
    }
  }

  async function changeConversationSafety(action) {
    if (!selected || safetyBusy) return;
    if (action === "block" && !window.confirm("Block this conversation? Neither person will be able to send new messages until you unblock it.")) return;
    setSafetyBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/chat/conversations/${selected.id}/safety/`, {
        action,
        ...(action === "report" ? { reason: reportReason.trim() } : {}),
      });
      if (action === "report") {
        setReportOpen(false);
        setReportReason("");
        setSafetyNotice(data.detail);
      } else {
        setSelected((current) => current?.id === selected.id ? { ...current, ...data } : current);
        setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, ...data } : item));
        setSafetyNotice(action === "block" ? "Conversation blocked. Previous messages remain available." : "Conversation unblocked.");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.reason || requestError.response?.data?.detail || "Safety action could not be completed.");
    } finally {
      setSafetyBusy(false);
    }
  }

  const customerMatches = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const matches = customers.filter((customer) => !term || [customer.name, customer.mobile, customer.bharath_id, customer.email].some((value) => String(value || "").toLowerCase().includes(term)));
    return term ? matches.slice(0, 30) : matches.slice(0, 5);
  }, [customers, customerSearch]);
  const painterMatches = useMemo(() => chatTargets.filter((item) => item.type === "CONTRACTOR" && [item.name, item.subtitle].some((value) => String(value || "").toLowerCase().includes(customerSearch.trim().toLowerCase()))), [chatTargets, customerSearch]);
  const forwardMatches = useMemo(() => chatTargets.filter((item) => {
    const isCurrent = selected && (item.type === "CONTRACTOR" ? item.id === selected.contractor_id : item.type === "PAINTER" ? item.id === selected.painter_id : item.id === selected.customer_id);
    return !isCurrent && [item.name, item.subtitle, item.type].some((value) => String(value || "").toLowerCase().includes(forwardSearch.trim().toLowerCase()));
  }), [chatTargets, forwardSearch, selected]);

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
          <div>
            <p className="text-sm font-semibold text-amber-600">
              Internal communication
            </p>
            <h1 className="mt-1 text-2xl font-bold">Messages</h1>
          </div>
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
              <button type="button" onClick={() => { setReportOpen(true); setSafetyNotice(""); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-slate-600 hover:bg-slate-50" aria-label="Report conversation" title="Report conversation"><Flag className="h-4 w-4" /></button>
              <button type="button" onClick={() => changeConversationSafety(selected.blocked_by_me ? "unblock" : "block")} disabled={safetyBusy || (selected.is_blocked && !selected.blocked_by_me)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-red-700 hover:bg-red-50 disabled:opacity-40" aria-label={selected.blocked_by_me ? "Unblock conversation" : "Block conversation"} title={selected.blocked_by_me ? "Unblock conversation" : "Block conversation"}><ShieldBan className="h-4 w-4" /></button>
            </header>
            {safetyNotice && <p role="status" className="bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{safetyNotice}</p>}
            {selected.is_blocked && <p role="status" className="bg-amber-50 px-4 py-2 text-sm text-amber-800">This conversation is blocked. Messages cannot be sent.</p>}
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
                  id={`chat-message-${message.id}`}
                  className={`flex ${message.is_mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${message.is_mine ? "bg-slate-950 text-white" : "border bg-white text-slate-800"}`}
                  >
                    {message.is_forwarded && !message.deleted_at && <span className="mb-2 flex items-center gap-1 text-[11px] opacity-70"><Forward className="h-3 w-3" /> Forwarded</span>}
                    {message.reply_to && <button type="button" onClick={() => document.getElementById(`chat-message-${message.reply_to.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`mb-2 block w-full truncate rounded-lg border-l-2 px-2 py-1 text-left text-xs ${message.is_mine ? "border-white/60 bg-white/10" : "border-slate-400 bg-slate-100"}`}>Reply to: {message.reply_to.text}</button>}
                    {message.deleted_at ? <p className="text-sm italic opacity-70">Message deleted</p> : editingId === message.id ? (
                      <div className="space-y-2">
                        <textarea autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={3} maxLength={4000} className="w-full min-w-52 rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-slate-950 outline-none" />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setEditingId(null); setEditingText(""); }} className="grid h-8 w-8 place-items-center rounded-lg border border-white/30" aria-label="Cancel editing"><X className="h-4 w-4" /></button>
                          <button type="button" onClick={() => saveEdit(message.id)} disabled={!editingText.trim() && !message.attachments?.length && !message.contact && !message.colour} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 disabled:opacity-40" aria-label="Save message"><Check className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <>{message.text && <p className="whitespace-pre-wrap text-sm">{message.text}</p>}{message.contact && <div className={`mt-2 rounded-xl p-3 ${message.is_mine ? "bg-white/10" : "bg-slate-100"}`}><p className="flex items-center gap-2 text-sm font-semibold"><ContactRound className="h-4 w-4" />{message.contact.name}</p><a href={`tel:${message.contact.mobile}`} className="mt-1 block text-xs underline">{message.contact.mobile}</a></div>}{message.colour && <div className={`mt-2 flex min-w-0 items-center gap-3 rounded-xl p-2 ${message.is_mine ? "bg-white/10" : "bg-slate-100"}`}><span className="h-14 w-14 shrink-0 rounded-lg border border-black/10" style={{ backgroundColor: message.colour.hex }} /><span className="min-w-0"><b className="block break-words text-sm">{message.colour.name}</b><small className="block text-xs opacity-75">{message.colour.brand} · shade {message.colour.code}</small></span></div>}{message.attachments?.map((attachment) => <button key={attachment.id} type="button" onClick={() => downloadAttachment(attachment)} className={`mt-2 flex w-full items-center gap-2 rounded-xl p-2 text-left text-xs ${message.is_mine ? "bg-white/10" : "bg-slate-100"}`}>{attachment.content_type.startsWith("image/") ? <ChatImage attachment={attachment} /> : <FileText className="h-8 w-8 shrink-0" />}<span className="min-w-0 truncate">{attachment.name}</span></button>)}</>
                    )}
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span>
                      {message.edited_at && !message.deleted_at && <span className="text-[10px] text-slate-400">Edited</span>}
                      {!message.deleted_at && editingId !== message.id && <button type="button" onClick={() => setReplyTo(message)} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label="Reply to message"><Reply className="h-3.5 w-3.5" /></button>}
                      {!message.deleted_at && editingId !== message.id && <button type="button" onClick={() => openForward(message)} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label="Forward message" title="Forward message"><Forward className="h-3.5 w-3.5" /></button>}
                      {message.can_edit && editingId !== message.id && <>
                        <button type="button" onClick={() => { setEditingId(message.id); setEditingText(message.text); }} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Edit message"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteMessage(message.id)} className="rounded p-1 text-red-300 hover:bg-white/10 hover:text-red-200" aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {!selected.is_blocked && <form onSubmit={send} className="space-y-2 border-t p-3 sm:p-4">
              {replyTo && <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs"><span className="min-w-0 truncate">Replying to: {replyTo.text || replyTo.colour?.name || replyTo.contact?.name || replyTo.attachments?.[0]?.name}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="h-4 w-4" /></button></div>}
              {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs"><Paperclip className="h-3 w-3" /><span className="max-w-36 truncate">{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${file.name}`}><X className="h-3 w-3" /></button></span>)}</div>}
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.vcf,image/jpeg,image/png,image/webp,application/pdf,text/vcard" onChange={chooseFiles} className="hidden" aria-label="Choose message attachments" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border" aria-label="Attach PDF, photo, catalogue or contact file" title="Attach PDF, photo, catalogue or contact file"><Paperclip className="h-5 w-5" /></button>
                <button type="button" onClick={() => setColourPickerOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-[#176b9b]" aria-label="Choose paint colour" title="Choose paint colour"><Palette className="h-5 w-5" /></button>
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a message" maxLength={4000} className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm outline-none focus:border-slate-900" />
                <button disabled={sending || (!text.trim() && !files.length)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white disabled:opacity-40" aria-label="Send message"><Send className="h-5 w-5" /></button>
              </div>
              <p className="text-[11px] text-slate-500">PDFs, photos, catalogues and contact cards · up to 5 files, 10 MB each. Edit or delete your messages within 10 minutes.</p>
            </form>}
          </>
        ) : (
          <div className="m-auto text-center text-slate-400">
            <MessageCircle className="mx-auto h-10 w-10" />
            <p className="mt-3">Select a conversation</p>
          </div>
        )}
      </section>
    </div>
    {colourPickerOpen && selected && <ChatColourPicker onClose={() => setColourPickerOpen(false)} onSend={sendColour} sending={sending} />}
    {(user?.role === "CONTRACTOR" || user?.role === "PAINTER") && !pickerOpen && <button type="button" onClick={openContacts} className={`${selected ? "hidden md:grid" : "grid"} fixed bottom-24 right-5 z-40 h-11 w-11 place-items-center rounded-full bg-slate-950 text-white shadow-xl hover:bg-slate-800 md:bottom-6 md:right-6`} aria-label={user?.role === "PAINTER" ? "Contractor contacts" : "Customer contacts"} title={user?.role === "PAINTER" ? "Contractor contacts" : "Customer contacts"}><Plus className="h-5 w-5" /></button>}
    {reportOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="chat-report-title">
      <form onSubmit={(event) => { event.preventDefault(); changeConversationSafety("report"); }} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 id="chat-report-title" className="text-lg font-bold">Report conversation</h2><button type="button" onClick={() => setReportOpen(false)} aria-label="Close report"><X className="h-5 w-5" /></button></div>
        <p className="text-sm text-slate-600">Tell the safety team what happened. A short excerpt of recent messages will be included privately.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-semibold">What happened?<textarea required minLength={10} maxLength={1000} value={reportReason} onChange={(event) => setReportReason(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border p-3 font-normal outline-none focus:border-slate-700" placeholder="Describe the concern" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setReportOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={safetyBusy || reportReason.trim().length < 10} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit report</button></div>
      </form>
    </div>}
    {pickerOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-contact-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-4 sm:p-5"><h2 id="customer-contact-title" className="text-xl font-bold">{user?.role === "PAINTER" ? "Contractor contacts" : "Customer contacts"}</h2><button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close contacts"><X className="h-5 w-5" /></button></header>
        <div className="border-b p-4"><label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={user?.role === "PAINTER" ? "Search contractors" : "Search customer name or mobile"} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingContacts ? <p className="p-8 text-center text-sm text-slate-400">Loading...</p> : user?.role === "PAINTER" ? painterMatches.length ? painterMatches.map((contractor) => <button type="button" key={contractor.id} onClick={() => choosePainterContact(contractor)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{contractor.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm text-slate-950">{contractor.name}</b><small className="block truncate text-slate-500">{contractor.subtitle}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-400">No connected contractors found.</p> : customerMatches.length ? customerMatches.map((customer) => <button type="button" key={customer.id} onClick={() => chooseCustomer(customer)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{customer.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm text-slate-950">{customer.name}</b><small className="block truncate text-slate-500">{[customer.mobile, customer.bharath_id].filter(Boolean).join(" - ")}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-400">No matching customers.</p>}
        </div>
      </section>
    </div>}
    {forwardingMessage && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="forward-message-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !forwardBusy) setForwardingMessage(null); }}>
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-4"><h2 id="forward-message-title" className="text-xl font-bold">Forward message</h2><button type="button" disabled={forwardBusy} onClick={() => setForwardingMessage(null)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close forward"><X className="h-5 w-5" /></button></header>
        <p className="truncate border-b px-4 py-3 text-sm text-slate-600">{forwardingMessage.text || forwardingMessage.colour?.name || forwardingMessage.contact?.name || forwardingMessage.attachments?.[0]?.name}</p>
        <div className="p-4"><label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={forwardSearch} onChange={(event) => setForwardSearch(event.target.value)} placeholder="Search contacts" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
        {error && <p role="alert" className="mx-4 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="overflow-y-auto p-2">{forwardMatches.length ? forwardMatches.map((target) => <button type="button" key={`${target.type}-${target.id}`} disabled={forwardBusy} onClick={() => forwardTo(target)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50 disabled:opacity-50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{target.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm">{target.name}</b><small className="text-slate-500">{target.type === "PAINTER" ? "Painter" : target.type === "CUSTOMER" ? "Customer" : "Contractor"} · {target.subtitle}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-500">No other connected contacts available.</p>}</div>
      </section>
    </div>}
    </>
  );
}

function ChatImage({ attachment }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    api.get(attachment.url, { responseType: "blob" }).then(({ data }) => {
      objectUrl = URL.createObjectURL(data);
      if (active) setSource(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.url]);
  return source ? <img src={source} alt="Attached photo" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <ImageIcon className="h-8 w-8 shrink-0" />;
}
