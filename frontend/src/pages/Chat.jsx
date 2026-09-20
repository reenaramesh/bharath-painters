import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, MessageCircle, Search, Send } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
  const [search, setSearch] = useState("");
  const endRef = useRef(null);
  const messagesRef = useRef(null);

  const loadConversations = useCallback(async (term = "") => {
    try {
      const { data } = await api.get("/quotations/chat/conversations/", {
        params: term ? { search: term } : {},
      });
      setConversations(data);
      const requestedId = Number(searchParams.get("conversation"));
      setSelected((current) => requestedId
        ? data.find((item) => item.id === requestedId) || data[0] || null
        : current
          ? data.find((item) => item.id === current.id) || data[0] || null
          : data[0] || null);
    } catch {
      setError("Conversations could not be loaded.");
    }
  }, [searchParams]);

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
    const timer = window.setTimeout(() => loadConversations(search), 300);
    return () => window.clearTimeout(timer);
  }, [loadConversations, search]);
  useEffect(() => {
    const timer = window.setInterval(() => loadConversations(search), 30000);
    return () => window.clearInterval(timer);
  }, [loadConversations, search]);
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
      await Promise.all([loadMessages(), loadConversations(search)]);
    } catch {
      setText(message);
      setError("Message could not be sent.");
    }
  }

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
            <label className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          )}
        </div>
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
            {search ? "No matching contacts." : "No contacts yet."}
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
              {user?.role === "CONTRACTOR" && (
                <Link
                  to="/jobs?post=1"
                  className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <BriefcaseBusiness className="h-4 w-4" /> Post job
                </Link>
              )}
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
                    <p className="whitespace-pre-wrap text-sm">
                      {message.text}
                    </p>
                    <p
                      className={`mt-1 text-[10px] ${message.is_mine ? "text-slate-400" : "text-slate-400"}`}
                    >
                      {new Date(message.created_at).toLocaleString()}
                    </p>
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
  );
}
