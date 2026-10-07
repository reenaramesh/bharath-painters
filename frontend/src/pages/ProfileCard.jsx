import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Copy,
  ExternalLink,
  MessageCircle,
  QrCode,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import ContractorDigitalCard from "../components/ContractorDigitalCard";
import PainterDigitalCard from "../components/PainterDigitalCard";

export default function ProfileCard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!["CONTRACTOR", "PAINTER"].includes(user?.role)) return;
    api
      .get("/accounts/profile-card/")
      .then(({ data: value }) => setData(value))
      .catch((requestError) => {
        setError(
          requestError.response?.data?.detail ||
            "Profile QR could not be loaded.",
        );
      });
  }, [user?.role]);
  const whatsappUrl = useMemo(
    () =>
      data ? `https://wa.me/?text=${encodeURIComponent(data.share_text)}` : "#",
    [data],
  );
  async function copyProfile() {
    await navigator.clipboard.writeText(data.share_text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  if (!["CONTRACTOR", "PAINTER"].includes(user?.role))
    return (
      <Navigate
        to={user?.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"}
        replace
      />
    );
  if (!data)
    return (
      <div className="bp-page-state">
        {error || "Preparing your profile QR…"}
      </div>
    );
  if (user?.role === "CONTRACTOR" && data.digital_card)
    return <ContractorDigitalCard data={data} />;
  if (user?.role === "PAINTER")
    return <PainterDigitalCard data={data} />;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-semibold text-violet-600">
          Digital identity
        </p>
        <h1 className="mt-1 text-3xl font-bold">My Bharath Profile</h1>
        <p className="mt-2 text-slate-500">
          Scan or share your verified Bharath Apps identity.
        </p>
      </header>
      <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 to-violet-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className={`grid shrink-0 place-items-center overflow-hidden bg-white/10 ${
              data.logo_shape === "RECTANGLE"
                ? "h-20 w-36 rounded-2xl"
                : "h-20 w-20 rounded-full"
            }`}>
              {data.photo ? (
                <img
                  src={data.photo}
                  alt="Profile"
                  className={`h-full w-full ${
                    data.logo_shape === "RECTANGLE"
                      ? "object-contain p-1"
                      : "object-cover"
                  }`}
                />
              ) : (
                <QrCode className="h-9 w-9" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold">{data.title}</h2>
                {data.verified && (
                  <BadgeCheck className="h-6 w-6 text-emerald-400" />
                )}
              </div>
              <p className="mt-1 text-slate-300">{data.subtitle}</p>
              <p className="mt-2 font-mono text-sm text-violet-200">
                {data.bharath_id}
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[280px_1fr]">
          <div>
            <div className="rounded-2xl border bg-white p-4">
              <img
                src={data.qr_image}
                alt={`QR code for ${data.title}`}
                className="mx-auto aspect-square w-full max-w-[240px]"
              />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              Scanning verifies the identity and current account status.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold">Profile details</h3>
            <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
              {data.details.map((item) => (
                <div key={item.label} className="border-b py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-1 break-words font-semibold text-slate-800">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white"
              >
                <MessageCircle className="h-5 w-5" />
                Share on WhatsApp
              </a>
              <button
                onClick={copyProfile}
                className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 font-semibold"
              >
                <Copy className="h-5 w-5" />
                {copied ? "Copied" : "Copy verification link"}
              </button>
              <a
                href={data.profile_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 font-semibold"
              >
                <ExternalLink className="h-5 w-5" />
                Open QR profile
              </a>
            </div>
          </div>
        </div>
      </section>
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        The complete details above are private to your account. WhatsApp and the
        QR share only verified identity details—never passwords, bank
        information or documents.
      </p>
    </div>
  );
}
