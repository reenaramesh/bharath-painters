import { useState } from "react";
import { Check, Copy, Download, FileDown, MessageCircle, QrCode, Share2, Star } from "lucide-react";
import api from "../api/client";

export default function ContractorDigitalCard({ data }) {
  const card = data.digital_card;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = (value) => { setMessage(value); window.setTimeout(() => setMessage(""), 3500); };
  async function shareProfile() {
    try {
      if (navigator.share) await navigator.share({ title: `${card.title} | Bharath Painters`, text: `${card.title} - verified professional`, url: data.profile_url });
      else { await navigator.clipboard.writeText(data.profile_url); notify("Profile link copied."); }
    } catch (error) {
      if (error.name !== "AbortError") notify("Sharing is unavailable on this device.");
    }
  }
  async function sharePdf() {
    setBusy(true);
    try {
      const response = await api.get(data.pdf_url, { responseType: "blob" });
      const file = new File([response.data], `${card.bharath_id}-profile.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${card.title} digital card` });
      else { downloadBlob(response.data, file.name); notify("PDF downloaded. Attach it to your message to share."); }
    } catch (error) {
      if (error.name !== "AbortError") notify("PDF could not be shared. Try Download PDF.");
    } finally { setBusy(false); }
  }
  function saveContact() {
    const vcard = ["BEGIN:VCARD", "VERSION:3.0", `FN:${card.title}`, `ORG:${card.title}`, `TEL;TYPE=WORK:${card.mobile || ""}`, `EMAIL:${card.email || ""}`, `URL:${data.profile_url}`, "END:VCARD"].join("\r\n");
    downloadBlob(new Blob([vcard], { type: "text/vcard" }), `${card.title.replace(/[^a-z0-9-]+/gi, "-")}.vcf`);
  }
  return <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 overflow-x-hidden pb-8">
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[#176b9b]">Digital identity</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">My digital card</h1></div><p className="text-xs text-slate-500">Share the verified card or its matching PDF.</p></div>
    <article className="overflow-hidden rounded-2xl border border-[#d7e4ea] bg-white shadow-lg">
      <div className="relative flex h-32 min-w-0 items-start justify-between bg-gradient-to-r from-[#14374a] via-[#1d5773] to-[#508398] px-4 py-4 text-white sm:h-[180px] sm:px-7 sm:py-6">
        <span className="flex h-[72px] w-36 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-2 shadow sm:h-24 sm:w-64">{card.logo ? <img src={card.logo} alt={`${card.title} logo`} className="block h-full w-full min-h-0 min-w-0 object-contain" /> : <b className="truncate text-sm text-[#1d5773]">{card.title}</b>}</span>
        <span className="hidden rounded-full border border-white/30 bg-white/10 px-3 py-2 text-[11px] font-bold sm:block">{card.bharath_id}</span>
      </div>
      <div className="relative mx-4 -mt-7 grid grid-cols-[86px_minmax(0,1fr)] items-start gap-3 sm:mx-7 sm:-mt-11 sm:grid-cols-[132px_minmax(0,1fr)_90px] sm:gap-5">
        <span className="grid h-[105px] w-[86px] place-items-center overflow-hidden rounded-2xl border-[3px] border-white bg-[#e0e9ec] text-center text-[10px] text-slate-500 shadow-lg sm:h-[145px] sm:w-[132px] sm:border-[5px]">{card.owner_photo ? <img src={card.owner_photo} alt={card.owner_name || "Owner"} className="h-full w-full object-cover" /> : "Photo not added"}</span>
        <div className="min-w-0 pt-8 sm:pt-14"><p className="text-[9px] font-extrabold uppercase tracking-widest text-[#31768a] sm:text-[10px]">Painting contractor</p><h2 className="mt-1 break-words text-xl font-extrabold leading-tight text-[#123448] sm:text-3xl">{card.title}</h2><p className="mt-1 break-words text-xs text-[#607786] sm:text-sm">{[card.owner_name, card.service_areas?.[0]].filter(Boolean).join(" | ")}</p>{card.verified && <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-[#e8f5ef] px-2 py-1 text-[10px] font-extrabold text-[#21734d]"><Check className="h-3 w-3 shrink-0" />Verified professional</span>}</div>
        <span className="hidden h-[90px] w-[90px] place-items-center rounded-xl border border-[#d6e2e8] bg-white p-2 sm:grid">{data.qr_image && <img src={data.qr_image} alt="Verification QR code" className="h-full w-full object-contain" />}</span>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 px-4 pb-5 pt-4 sm:flex sm:flex-wrap sm:px-7 [&>*]:min-w-0">
        <button type="button" onClick={shareProfile} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-4 text-xs font-bold text-white sm:text-sm"><Share2 className="h-4 w-4" />Share profile</button>
        <a href={data.pdf_url} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b9d1dc] px-4 text-xs font-bold text-[#1d5e7b] sm:text-sm"><Download className="h-4 w-4" />Download PDF</a>
        <button type="button" onClick={sharePdf} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b9d1dc] px-4 text-xs font-bold text-[#1d5e7b] disabled:opacity-50 sm:text-sm"><FileDown className="h-4 w-4" />{busy ? "Preparing..." : "Share PDF"}</button>
        <button type="button" onClick={saveContact} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b9d1dc] px-4 text-xs font-bold text-[#1d5e7b] sm:text-sm"><Copy className="h-4 w-4" />Save contact</button>
        <a href={data.qr_image} target="_blank" rel="noreferrer" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b9d1dc] px-4 text-xs font-bold text-[#1d5e7b] sm:hidden"><QrCode className="h-4 w-4" />View QR</a>
      </div>
      {message && <p role="status" className="mx-4 mb-4 rounded-lg bg-[#eaf4f8] px-3 py-2 text-xs font-semibold text-[#235c76] sm:mx-7">{message}</p>}
      <div className="grid gap-3 border-t border-[#e4edf1] bg-[#f8fbfc] p-4 sm:grid-cols-2 sm:gap-5 sm:p-7">
        <section className="rounded-2xl border border-[#dbe7ed] bg-white p-4 sm:p-5"><h3 className="font-extrabold">About the work</h3><p className="mt-2 text-xs leading-5 text-slate-500">{card.title} serves {card.service_areas?.length ? card.service_areas.join(", ") : "its customers"}.</p><div className="mt-4 grid grid-cols-3 gap-1 border-y border-[#e7eff2] py-3 text-center"><Stat value={card.projects?.length ?? 0} label="Completed projects" /><Stat value={card.years_in_business || "-"} label="Years in business" /><Stat value={card.workers || "-"} label="Workers" /></div><h3 className="mt-5 text-sm font-extrabold">Work skills</h3><Chips values={card.work_skills} empty="Work skills have not been added." /><h3 className="mt-5 text-sm font-extrabold">Service areas</h3><Chips values={card.service_areas} empty="Service areas have not been added." /></section>
        <section className="rounded-2xl border border-[#dbe7ed] bg-white p-4 sm:p-5"><h3 className="font-extrabold">Completed projects</h3><p className="mt-1 text-xs text-slate-500">Recent work and project photos.</p><div className="mt-4 space-y-2">{card.projects?.length ? card.projects.map((project) => <article key={project.id} className="flex items-start gap-3 rounded-xl border border-[#edf1f3] p-2">{project.photo ? <img src={project.photo} alt={project.title} className="h-14 w-16 shrink-0 rounded-lg object-cover" /> : <span className="h-14 w-16 shrink-0 rounded-lg bg-[#e6eef1]" />}<span className="min-w-0"><b className="block text-xs">{project.title}</b>{project.apartment_community && <small className="block text-[11px] font-semibold text-[#1d5e7b]">{project.apartment_community}</small>}{project.address && <small className="block text-[10px] text-slate-500">{project.address}</small>}{project.location && <small className="block text-[10px] text-slate-500">{project.location}</small>}{project.description && <small className="mt-1 block text-[10px] text-slate-600">{project.description}</small>}{project.work_completed && <small className="mt-1 block text-[10px] text-slate-700"><b>Work completed:</b> {project.work_completed}</small>}</span></article>) : <p className="rounded-xl border border-dashed p-4 text-xs text-slate-500">No completed projects added yet. Add one in Completed Projects.</p>}</div></section>
      </div>
      <section className="border-t border-[#e4edf1] bg-[#f8fbfc] px-4 pb-5 sm:px-7"><div className="rounded-2xl border border-[#dbe7ed] bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Customer reviews</h3>{card.customer_reviews?.count > 0 && <span className="flex items-center gap-1 text-sm font-bold text-[#1c5f7c]"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{card.customer_reviews.rating} / 5 · {card.customer_reviews.count} reviews</span>}</div>{card.customer_reviews?.items?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{card.customer_reviews.items.map((review) => <article key={review.id} className="rounded-xl border border-[#edf1f3] p-3"><div className="flex justify-between gap-2"><b className="text-xs">{review.customer_name}</b><span className="text-xs font-bold text-amber-500">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>{review.comment && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{review.comment}</p>}</article>)}</div> : <p className="mt-2 text-xs text-slate-500">No customer reviews yet.</p>}</div></section>
      <div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-[10px] text-slate-500 sm:px-7"><span>Verified by Bharath Painters</span><span>{card.bharath_id}</span></div>
    </article>
    <a href={`https://wa.me/?text=${encodeURIComponent(data.share_text)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-[#176b9b]"><MessageCircle className="h-4 w-4" />Share link on WhatsApp</a>
  </div>;
}

function Stat({ value, label }) { return <div><strong className="block text-lg font-extrabold text-[#1c5f7c]">{value}</strong><small className="block text-[10px] leading-3 text-slate-500">{label}</small></div>; }
function Chips({ values, empty }) { return values?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{values.map((value) => <span key={value} className="rounded-lg bg-[#eaf4f8] px-2 py-1.5 text-[11px] font-bold text-[#235c76]">{value}</span>)}</div> : <p className="mt-2 text-xs text-slate-500">{empty}</p>; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
