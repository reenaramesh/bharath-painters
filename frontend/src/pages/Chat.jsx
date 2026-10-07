import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ContactRound, FileText, Flag, Forward, Image as ImageIcon, Info, MessageCircle, Moon, Palette, Paperclip, Pencil, Plus, Reply, RotateCcw, Search, Send, ShieldBan, ShieldCheck, Sun, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import ChatColourPicker from "../components/ChatColourPicker";
import ContractorInboxRequests from "../components/ContractorInboxRequests";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/ui";
import "./communication-pages.css";

export default function Chat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationsLoadError, setConversationsLoadError] = useState("");
  const [messagesLoadError, setMessagesLoadError] = useState(false);
  const conversationsLoaded = useRef(false);
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
  const [safetyDialogOpen, setSafetyDialogOpen] = useState(false);
  const [safetyDialogFirstSend, setSafetyDialogFirstSend] = useState(false);
  const [inactivityReminderDue, setInactivityReminderDue] = useState(false);
  const pendingSafetyAction = useRef(null);
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
  const [viewingImage, setViewingImage] = useState(null);
  const [viewingShade, setViewingShade] = useState(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    const visitKey = `bp-chat-last-visit-${user.id}`;
    const dueKey = `bp-chat-safety-due-${user.id}`;
    const now = Date.now();
    const lastVisit = Number(localStorage.getItem(visitKey) || 0);
    const hasBeenAwaySevenDays = lastVisit > 0 && now - lastVisit >= 7 * 24 * 60 * 60 * 1000;
    if (hasBeenAwaySevenDays) localStorage.setItem(dueKey, "1");
    setInactivityReminderDue(localStorage.getItem(dueKey) === "1");
    localStorage.setItem(visitKey, String(now));
  }, [user?.id]);

  const loadConversations = useCallback(async () => {
    if (!conversationsLoaded.current) setLoadingConversations(true);
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
      conversationsLoaded.current = true;
      setConversationsLoadError("");
      setSelected((current) => requestedCustomer
        ? rows.find((item) => item.customer_id === requestedCustomer) || rows[0] || null
        : requestedId
        ? rows.find((item) => item.id === requestedId) || rows[0] || null
        : current
          ? rows.find((item) => item.id === current.id) || current
          : null);
    } catch {
      setError("Conversations could not be loaded.");
      setConversationsLoadError("Conversations could not be loaded.");
      conversationsLoaded.current = true;
    } finally {
      setLoadingConversations(false);
    }
  }, [searchParams, user?.role]);

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!selected) return;
      if (!silent) setLoadingMessages(true);
      try {
        const { data } = await api.get(
          `/quotations/chat/conversations/${selected.id}/messages/`,
        );
        setMessages((current) =>
          JSON.stringify(current) === JSON.stringify(data) ? current : data,
        );
        if (!silent) {
          setError("");
          setMessagesLoadError(false);
        }
      } catch {
        if (!silent) {
          setError("Messages could not be loaded.");
          setMessagesLoadError(true);
        }
      } finally {
        if (!silent) setLoadingMessages(false);
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
    setMessages([]);
    setReplyTo(null);
    setFiles([]);
    setColourPickerOpen(false);
    setSafetyDialogOpen(false);
    pendingSafetyAction.current = null;
  }, [selected?.id]);

  function safetyKey(conversationId) {
    return `bp-chat-safety-v1-${user?.id}-${conversationId}`;
  }

  function needsFirstSendNotice(conversationId) {
    return inactivityReminderDue || (!localStorage.getItem(safetyKey(conversationId))
      && (selected?.id !== conversationId || !messages.some((message) => message.is_mine)));
  }

  function requireSafetyNotice(conversationId, action) {
    if (!needsFirstSendNotice(conversationId)) return false;
    pendingSafetyAction.current = { conversationId, action };
    setSafetyDialogFirstSend(true);
    setSafetyDialogOpen(true);
    return true;
  }

  function confirmSafetyNotice() {
    const pending = pendingSafetyAction.current;
    if (pending) localStorage.setItem(safetyKey(pending.conversationId), "1");
    if (pending && user?.id) {
      localStorage.removeItem(`bp-chat-safety-due-${user.id}`);
      setInactivityReminderDue(false);
    }
    pendingSafetyAction.current = null;
    setSafetyDialogOpen(false);
    pending?.action();
  }

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

  function send(event) {
    event.preventDefault();
    const message = text.trim();
    if ((!message && !files.length) || !selected || sending) return;
    if (requireSafetyNotice(selected.id, () => sendMessage())) return;
    sendMessage();
  }

  async function sendMessage() {
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
    if (requireSafetyNotice(selected.id, () => sendColour(colour))) return;
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
    if (!message && !original?.attachments?.length && !original?.contact && !original?.colour && !original?.colour_comparison?.length) return;
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
      if (user?.role === "PAINTER" || user?.role === "CUSTOMER") {
        if (user?.role === "CUSTOMER") {
          const { data } = await api.get("/quotations/customer/connection-requests/");
          setChatTargets((data.results || []).filter((item) => item.status === "CONNECTED").map((item) => ({
            type: "CONTRACTOR", id: item.contractor.id, connection: item.id,
            name: item.contractor.business_name, subtitle: item.contractor.contractor_id || "Contractor",
          })));
        } else {
          const { data } = await api.get("/quotations/chat/contacts/");
          setChatTargets(data);
        }
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
      const messageId = forwardingMessage.id;
      if (requireSafetyNotice(conversation.id, () => finishForward(target, conversation.id, messageId))) return;
      await finishForward(target, conversation.id, messageId);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Message could not be forwarded.");
    } finally {
      setForwardBusy(false);
    }
  }

  async function finishForward(target, conversationId, messageId) {
    setForwardBusy(true);
    try {
      await api.post(`/quotations/chat/messages/${messageId}/forward/`, { conversation: conversationId });
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
      const recipient = user?.role === "CUSTOMER" ? { connection: contractor.connection } : { contractor: contractor.id };
      const { data } = await api.post("/quotations/chat/conversations/", recipient);
      setConversations((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setSelected(data);
      setPickerOpen(false);
      setCustomerSearch("");
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.connection || requestError.response?.data?.contractor || "Contractor conversation could not be opened.");
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
      ? formatConversationTime(item.last_message_at)
      : "";

  return (
    <>
    {user?.role === "CONTRACTOR" && <ContractorInboxRequests />}
    <div className={`chat-page flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white ${user?.role === "PAINTER" ? "painter-portal-chat" : ""}`}>
      <aside
        className={`chat-conversation-list ${selected ? "hidden md:flex" : "flex"} min-h-0 w-full flex-col border-r md:w-80`}
      >
        <div className="chat-sidebar-heading border-b p-5">
          <PageHeader eyebrow={user?.role === "CUSTOMER" ? "Stay in touch" : "Internal communication"} title="Messages" />
          {user?.role === "PAINTER" && <div className="painter-chat-summary" aria-label="Painter message summary"><span><strong>{conversations.length}</strong> conversations</span><span><strong>{conversations.reduce((total, item) => total + Number(item.unread_count || 0), 0)}</strong> unread</span></div>}
          {user?.role === "CUSTOMER" && <div className="customer-chat-summary" aria-label="Message summary">
            <span><strong>{conversations.length}</strong> conversations</span>
            <span><strong>{conversations.reduce((total, item) => total + Number(item.unread_count || 0), 0)}</strong> unread</span>
          </div>}
        </div>
        <div className="chat-list-heading border-b bg-slate-50 px-4 py-3">
          <h2>Recent conversations</h2>
          {conversations.length > 0 && <span>{conversations.length}</span>}
        </div>
        {conversationsLoadError && !selected && <ErrorState message={conversationsLoadError} onRetry={() => { conversationsLoaded.current = false; loadConversations(); }} className="chat-list-error" />}
        <div className="chat-conversation-scroll min-h-0 flex-1 overflow-y-auto">
        {loadingConversations && !conversations.length ? (
          <LoadingState label="Loading conversations…" className="chat-list-state" />
        ) : conversations.length ? (
          <div className="divide-y">
            {conversations.map((item) => {
              const title = conversationTitle(item);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  className={`chat-conversation-row flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 ${selected?.id === item.id ? "bg-slate-50" : ""}`}
                >
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">
                    {title?.trim()?.charAt(0)?.toUpperCase() || "?"}
                    <i aria-hidden="true" className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${item.is_online ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-slate-900">
                        {title}
                      </strong>
                      <time className="chat-conversation-time shrink-0" dateTime={item.last_message_at || undefined}>
                        {conversationTime(item)}
                      </time>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-slate-500">
                        {item.last_message || "Start a conversation"}
                      </span>
                      {item.unread_count > 0 && (
                        <span className="chat-unread-count rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white" aria-label={`${item.unread_count} unread messages`}>
                          {item.unread_count} unread
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          conversationsLoadError ? null : <EmptyState title="No conversations yet" description="Your connected contacts and their messages will appear here." className="chat-list-state" />
        )}
        </div>
      </aside>
      <section
        className={`chat-thread ${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}
      >
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b p-4">
              <button
                onClick={() => setSelected(null)}
                type="button"
                aria-label="Return to conversations"
                className="min-h-11 rounded-lg border px-3 py-2 text-sm md:hidden"
              >
                Back
              </button>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${selected.is_online ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
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
              {selected.is_blocked && <StatusBadge status="BLOCKED" label="Blocked" tone="danger" className="hidden sm:inline-flex" />}
              <button type="button" onClick={() => { pendingSafetyAction.current = null; setSafetyDialogFirstSend(false); setSafetyDialogOpen(true); }} className="chat-header-action grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-sky-200 text-[#176b9b] hover:bg-sky-50" aria-label="Message safety information" title="Message safety information"><Info className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setReportOpen(true); setSafetyNotice(""); }} className="chat-header-action grid h-11 w-11 shrink-0 place-items-center rounded-lg border text-slate-600 hover:bg-slate-50" aria-label="Report conversation" title="Report conversation"><Flag className="h-4 w-4" /></button>
              <button type="button" onClick={() => changeConversationSafety(selected.blocked_by_me ? "unblock" : "block")} disabled={safetyBusy || (selected.is_blocked && !selected.blocked_by_me)} className="chat-header-action grid h-11 w-11 shrink-0 place-items-center rounded-lg border text-red-700 hover:bg-red-50 disabled:opacity-40" aria-label={selected.blocked_by_me ? "Unblock conversation" : "Block conversation"} title={selected.blocked_by_me ? "Unblock conversation" : "Block conversation"}><ShieldBan className="h-4 w-4" /></button>
            </header>
            {safetyNotice && <p role="status" className="bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{safetyNotice}</p>}
            {selected.is_blocked && <p role="status" className="bg-amber-50 px-4 py-2 text-sm text-amber-800">This conversation is blocked. Messages cannot be sent.</p>}
            {messagesLoadError ? (
              <ErrorState
                message={error}
                onRetry={() => loadMessages()}
                className="chat-message-error"
              />
            ) : error && (
              <p className="bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div
              ref={messagesRef}
              className="chat-message-list min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label={`Messages with ${conversationTitle(selected)}`}
            >
              {loadingMessages ? <LoadingState label="Loading messages…" className="chat-list-state" /> : !messages.length && !error ? <EmptyState title="No messages yet" description="Send a message to start this conversation." className="chat-list-state" /> : null}
              {!loadingMessages && messages.map((message) => (
                <div
                  key={message.id}
                  id={`chat-message-${message.id}`}
                  className={`chat-message-row flex ${message.is_mine ? "chat-message-sent justify-end" : "chat-message-received justify-start"}`}
                >
                  <div
                    className={`chat-message-bubble min-w-0 ${message.colour_comparison?.length ? "w-full max-w-[min(90%,520px)]" : "max-w-[90%] sm:max-w-[78%]"} rounded-2xl px-4 py-3 ${message.is_mine ? "bg-slate-950 text-white" : "border bg-white text-slate-800"}`}
                  >
                    <p className="chat-message-sender">{message.is_mine ? "You" : conversationTitle(selected)}</p>
                    {message.is_forwarded && !message.deleted_at && <span className="mb-2 flex items-center gap-1 text-[11px] opacity-70"><Forward className="h-3 w-3" /> Forwarded</span>}
                    {message.reply_to && <button type="button" onClick={() => document.getElementById(`chat-message-${message.reply_to.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`mb-2 block w-full truncate rounded-lg border-l-2 px-2 py-1 text-left text-xs ${message.is_mine ? "border-white/60 bg-white/10" : "border-slate-400 bg-slate-100"}`}>Reply to: {message.reply_to.text}</button>}
                    {message.deleted_at ? <p className="text-sm italic opacity-70">Message deleted</p> : editingId === message.id ? (
                      <div className="space-y-2">
                        <textarea autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={3} maxLength={4000} className="w-full min-w-52 rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-slate-950 outline-none" />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setEditingId(null); setEditingText(""); }} className="grid h-8 w-8 place-items-center rounded-lg border border-white/30" aria-label="Cancel editing"><X className="h-4 w-4" /></button>
                          <button type="button" onClick={() => saveEdit(message.id)} disabled={!editingText.trim() && !message.attachments?.length && !message.contact && !message.colour && !message.colour_comparison?.length} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 disabled:opacity-40" aria-label="Save message"><Check className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <>{message.text && <p className="chat-message-text whitespace-pre-wrap text-sm">{message.text}</p>}{message.contact && <div className={`mt-2 rounded-xl p-3 ${message.is_mine ? "bg-white/10" : "bg-slate-100"}`}><p className="flex items-center gap-2 text-sm font-semibold"><ContactRound className="h-4 w-4" />{message.contact.name}</p><a href={`tel:${message.contact.mobile}`} className="mt-1 block text-sm underline">{message.contact.mobile}</a></div>}{message.colour && <div className={`mt-2 flex min-w-0 items-center gap-3 rounded-xl p-2 ${message.is_mine ? "bg-white/10" : "bg-slate-100"}`}><button type="button" onClick={() => setViewingShade(message.colour)} className="chat-shade-swatch h-14 w-14 shrink-0 rounded-lg border border-black/10 focus:outline-none focus:ring-2 focus:ring-sky-500" style={{ backgroundColor: message.colour.hex }} aria-label={`Zoom shade ${message.colour.name}`} title="View shade" /><span className="min-w-0"><b className="block break-words text-sm">{message.colour.name}</b><small className="block text-xs opacity-75">{message.colour.brand} · shade {message.colour.code}</small></span></div>}{message.attachments?.map((attachment) => <button key={attachment.id} type="button" onClick={() => attachment.content_type.startsWith("image/") ? setViewingImage(attachment) : downloadAttachment(attachment)} className={`chat-attachment mt-2 flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm ${message.is_mine ? "bg-white/10" : "bg-slate-100"}`} aria-label={attachment.content_type.startsWith("image/") ? `View ${attachment.name}` : `Download ${attachment.name}`}>{attachment.content_type.startsWith("image/") ? <ChatImage attachment={attachment} /> : <FileText className="h-8 w-8 shrink-0" />}<span className="min-w-0 break-words">{attachment.name}</span></button>)}</>
                    )}
                    {!message.deleted_at && message.colour_comparison?.length > 0 && <ChatColourComparison slots={message.colour_comparison} onSelectShade={setViewingShade} />}
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <time className="chat-message-time" dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
                      {message.edited_at && !message.deleted_at && <span className="chat-message-time">Edited</span>}
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
              {needsFirstSendNotice(selected.id) && <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-slate-700 sm:text-sm" role="note">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#176b9b]" />
                <p><strong className="text-slate-900">Keep your information safe.</strong> This messenger is not a private channel. Do not share OTPs, passwords, bank or payment details, identity documents, or other sensitive personal information. <button type="button" onClick={() => { pendingSafetyAction.current = null; setSafetyDialogFirstSend(false); setSafetyDialogOpen(true); }} className="font-bold text-[#176b9b] underline">More info</button></p>
              </div>}
              <div ref={endRef} />
            </div>
            {!selected.is_blocked && <form onSubmit={send} className="chat-composer space-y-2 border-t p-3 sm:p-4">
              {replyTo && <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs"><span className="min-w-0 truncate">Replying to: {replyTo.text || replyTo.colour?.name || replyTo.contact?.name || replyTo.attachments?.[0]?.name}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="h-4 w-4" /></button></div>}
              {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs"><Paperclip className="h-3 w-3" /><span className="max-w-36 truncate">{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${file.name}`}><X className="h-3 w-3" /></button></span>)}</div>}
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.vcf,image/jpeg,image/png,image/webp,application/pdf,text/vcard" onChange={chooseFiles} className="hidden" aria-label="Choose message attachments" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="chat-composer-action grid h-11 w-11 shrink-0 place-items-center rounded-xl border" aria-label="Attach PDF, photo, catalogue or contact file" title="Attach PDF, photo, catalogue or contact file"><Paperclip className="h-5 w-5" /></button>
                <button type="button" onClick={() => setColourPickerOpen(true)} className="chat-composer-action grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-[#176b9b]" aria-label="Choose paint colour" title="Choose paint colour"><Palette className="h-5 w-5" /></button>
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a message" maxLength={4000} className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm outline-none focus:border-slate-900" />
                <Button type="submit" loading={sending} disabled={!text.trim() && !files.length} className="chat-send-action h-11 w-11 shrink-0 !p-0" aria-label="Send message"><Send className="h-5 w-5" aria-hidden="true" /></Button>
              </div>
              
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
    {safetyDialogOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="chat-safety-title">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 bg-sky-50 p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#176b9b]"><ShieldCheck className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-widest text-[#176b9b]">Bharath Apps · Messages</p><h2 id="chat-safety-title" className="mt-1 text-lg font-bold text-slate-950">Keep your information safe</h2></div><button type="button" onClick={() => { pendingSafetyAction.current = null; setSafetyDialogOpen(false); }} className="rounded-lg p-1 text-slate-500" aria-label="Close safety information"><X className="h-5 w-5" /></button></div>
        <div className="space-y-3 p-5 text-sm leading-relaxed text-slate-700"><p>This messenger is not a private channel. Bharath Apps may review reported conversations for safety and support.</p><p>Do not share OTPs, passwords, bank or payment details, identity documents, or other sensitive personal information.</p><p>If someone asks for these details, use the <strong>Report conversation</strong> button at the top of the chat.</p></div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => { pendingSafetyAction.current = null; setSafetyDialogOpen(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{safetyDialogFirstSend ? "Cancel" : "Close"}</button>{safetyDialogFirstSend && <button type="button" onClick={confirmSafetyNotice} className="rounded-lg bg-[#176b9b] px-4 py-2 text-sm font-bold text-white">I understand · Send</button>}</div>
      </section>
    </div>}
    {["CONTRACTOR", "PAINTER", "CUSTOMER"].includes(user?.role) && !pickerOpen && <button type="button" onClick={openContacts} className={`${selected ? "hidden md:grid" : "grid"} fixed bottom-24 right-5 z-40 h-11 w-11 place-items-center rounded-full bg-slate-950 text-white shadow-xl hover:bg-slate-800 md:bottom-6 md:right-6`} aria-label={user?.role === "CONTRACTOR" ? "Customer contacts" : "Contractor contacts"} title={user?.role === "CONTRACTOR" ? "Customer contacts" : "Contractor contacts"}><Plus className="h-5 w-5" /></button>}
    {reportOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="chat-report-title">
      <form onSubmit={(event) => { event.preventDefault(); changeConversationSafety("report"); }} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 id="chat-report-title" className="text-lg font-bold">Report conversation</h2><button type="button" onClick={() => setReportOpen(false)} aria-label="Close report"><X className="h-5 w-5" /></button></div>
        
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-semibold">What happened?<textarea required minLength={10} maxLength={1000} value={reportReason} onChange={(event) => setReportReason(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border p-3 font-normal outline-none focus:border-slate-700" placeholder="Describe the concern" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setReportOpen(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={safetyBusy || reportReason.trim().length < 10} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit report</button></div>
      </form>
    </div>}
    {pickerOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-contact-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-4 sm:p-5"><h2 id="customer-contact-title" className="text-xl font-bold">{user?.role === "CONTRACTOR" ? "Customer contacts" : "Contractor contacts"}</h2><button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close contacts"><X className="h-5 w-5" /></button></header>
        <div className="border-b p-4"><label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={user?.role === "CONTRACTOR" ? "Search customer name or mobile" : "Search contractors"} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingContacts ? <p className="p-8 text-center text-sm text-slate-400">Loading...</p> : user?.role !== "CONTRACTOR" ? painterMatches.length ? painterMatches.map((contractor) => <button type="button" key={contractor.id} onClick={() => choosePainterContact(contractor)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{contractor.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm text-slate-950">{contractor.name}</b><small className="block truncate text-slate-500">{contractor.subtitle}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-400">No connected contractors found.</p> : customerMatches.length ? customerMatches.map((customer) => <button type="button" key={customer.id} onClick={() => chooseCustomer(customer)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{customer.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm text-slate-950">{customer.name}</b><small className="block truncate text-slate-500">{[customer.mobile, customer.bharath_id].filter(Boolean).join(" - ")}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-400">No matching customers.</p>}
        </div>
      </section>
    </div>}
    {forwardingMessage && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="forward-message-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !forwardBusy) setForwardingMessage(null); }}>
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-4"><h2 id="forward-message-title" className="text-xl font-bold">Forward message</h2><button type="button" disabled={forwardBusy} onClick={() => setForwardingMessage(null)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close forward"><X className="h-5 w-5" /></button></header>
        <p className="truncate border-b px-4 py-3 text-sm text-slate-600">{forwardingMessage.text || (forwardingMessage.colour_comparison?.length ? "Colour comparison" : "") || forwardingMessage.colour?.name || forwardingMessage.contact?.name || forwardingMessage.attachments?.[0]?.name}</p>
        <div className="p-4"><label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={forwardSearch} onChange={(event) => setForwardSearch(event.target.value)} placeholder="Search contacts" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
        {error && <p role="alert" className="mx-4 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="overflow-y-auto p-2">{forwardMatches.length ? forwardMatches.map((target) => <button type="button" key={`${target.type}-${target.id}`} disabled={forwardBusy} onClick={() => forwardTo(target)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50 disabled:opacity-50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{target.name?.charAt(0)?.toUpperCase() || "?"}</span><span className="min-w-0"><b className="block truncate text-sm">{target.name}</b><small className="text-slate-500">{target.type === "PAINTER" ? "Painter" : target.type === "CUSTOMER" ? "Customer" : "Contractor"} · {target.subtitle}</small></span></button>) : <p className="p-8 text-center text-sm text-slate-500">No other connected contacts available.</p>}</div>
      </section>
    </div>}
    {viewingImage && <ChatImageViewer key={viewingImage.id} attachment={viewingImage} onClose={() => setViewingImage(null)} />}
    {viewingShade && <ChatShadeViewer key={`${viewingShade.brand}-${viewingShade.code}`} shade={viewingShade} onClose={() => setViewingShade(null)} />}
    </>
  );
}

function formatConversationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  return isToday
    ? time
    : `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${time}`;
}

function formatMessageTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function ChatColourComparison({ slots, onSelectShade }) {
  const comparisons = slots[0]?.section
    ? slots
    : [0, 1, 2, 3].map((section) => ({ section: section + 1, colours: slots.slice(section * 2, section * 2 + 2).filter(Boolean) })).filter((section) => section.colours.length > 0);
  return <div className="mt-2 space-y-2 rounded-xl bg-white p-2 text-slate-900">
    <p className="px-1 text-xs font-bold">Colour comparison</p>
    {comparisons.map((comparison) => <div key={comparison.section} className="rounded-lg border border-slate-200 p-2"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Comparison {comparison.section}</p><div className={`grid gap-2 ${comparison.colours.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{comparison.colours.map((colour, index) => <button type="button" onClick={() => onSelectShade?.(colour)} key={`${colour.code}-${index}`} className="min-w-0 overflow-hidden rounded-md border border-slate-200 text-left transition hover:border-sky-500 hover:ring-2 hover:ring-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500" aria-label={`Zoom ${colour.name}, ${colour.brand}, shade ${colour.code}`} title="Tap to view shade"><span className="block h-12" style={{ backgroundColor: colour.hex }} /><span className="block p-1.5"><b className="block truncate text-[11px]">{colour.name}</b><small className="block truncate text-[10px] text-slate-500">{colour.brand} · {colour.code}</small></span></button>)}</div></div>)}
    
  </div>;
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

function ChatImageViewer({ attachment, onClose }) {
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(true);
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
  const toolbar = dark ? "bg-white/10 text-white" : "bg-white text-slate-700 shadow-sm";
  return <div className={`fixed inset-0 z-[80] flex flex-col ${dark ? "bg-slate-950" : "bg-slate-100"}`} role="dialog" aria-modal="true" aria-label="Photo viewer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex items-center justify-between gap-2 p-3 sm:p-4"><span className={`min-w-0 truncate text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{attachment.name}</span><div className="flex shrink-0 items-center gap-1.5 sm:gap-2"><button type="button" onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.25).toFixed(2)))} className={`grid h-10 w-10 place-items-center rounded-xl ${toolbar}`} aria-label="Zoom out"><ZoomOut className="h-5 w-5" /></button><button type="button" onClick={() => setZoom((value) => Math.min(4, +(value + 0.25).toFixed(2)))} className={`grid h-10 w-10 place-items-center rounded-xl ${toolbar}`} aria-label="Zoom in"><ZoomIn className="h-5 w-5" /></button><button type="button" onClick={() => setZoom(1)} className={`grid h-10 w-10 place-items-center rounded-xl ${toolbar}`} aria-label="Reset zoom"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setDark((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-xl ${toolbar}`} aria-label="Change photo background">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button><button type="button" onClick={onClose} className={`grid h-10 w-10 place-items-center rounded-xl ${toolbar}`} aria-label="Close photo viewer"><X className="h-5 w-5" /></button></div></div>
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-6">{source ? <img src={source} alt={attachment.name || "Message photo"} style={{ transform: `scale(${zoom})` }} className="max-h-full max-w-full origin-center object-contain transition-transform duration-150" /> : <span className={dark ? "text-slate-300" : "text-slate-500"}>Loading photo…</span>}</div>
  </div>;
}

function ChatShadeViewer({ shade, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(true);
  const controls = dark ? "bg-white/10 text-white" : "bg-white text-slate-700 shadow-sm";
  return <div className={`fixed inset-0 z-[85] flex flex-col ${dark ? "bg-slate-950" : "bg-slate-100"}`} role="dialog" aria-modal="true" aria-label={`Colour shade ${shade.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="flex items-center justify-between gap-3 p-3 sm:p-4"><div className={`min-w-0 ${dark ? "text-white" : "text-slate-900"}`}><b className="block truncate text-sm">{shade.name}</b><span className="block truncate text-xs opacity-70">{shade.brand} · {shade.code} · {shade.hex}</span></div><div className="flex shrink-0 items-center gap-1.5 sm:gap-2"><button type="button" onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.25).toFixed(2)))} className={`grid h-10 w-10 place-items-center rounded-xl ${controls}`} aria-label="Zoom out"><ZoomOut className="h-5 w-5" /></button><button type="button" onClick={() => setZoom((value) => Math.min(3, +(value + 0.25).toFixed(2)))} className={`grid h-10 w-10 place-items-center rounded-xl ${controls}`} aria-label="Zoom in"><ZoomIn className="h-5 w-5" /></button><button type="button" onClick={() => setZoom(1)} className={`grid h-10 w-10 place-items-center rounded-xl ${controls}`} aria-label="Reset zoom"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setDark((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-xl ${controls}`} aria-label="Change viewer background">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button><button type="button" onClick={onClose} className={`grid h-10 w-10 place-items-center rounded-xl ${controls}`} aria-label="Close shade viewer"><X className="h-5 w-5" /></button></div></header>
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"><div className="h-[min(58vh,72vw)] w-[min(58vh,72vw)] shrink-0 rounded-2xl border border-black/10 shadow-2xl transition-transform duration-150" style={{ backgroundColor: shade.hex, transform: `scale(${zoom})` }} aria-label={`${shade.name} colour swatch`} /></div>
    <footer className={`pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Colour appearance can vary by screen. Confirm against a physical shade card.</footer>
  </div>;
}
