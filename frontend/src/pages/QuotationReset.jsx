import { FileText } from "lucide-react";

export default function QuotationReset() {
  return <div className="mx-auto max-w-4xl">
    <section className="rounded-2xl border bg-white p-8 text-center sm:p-14">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white"><FileText /></span>
      <p className="mt-6 text-sm font-bold uppercase tracking-wider text-amber-600">Quotation workspace</p>
      <h1 className="mt-2 text-3xl font-bold">Ready to build from scratch</h1>
      <p className="mx-auto mt-3 max-w-xl text-slate-500">The previous quotation interface has been removed. Saved quotation data and backend records are protected while we define the new process step by step.</p>
    </section>
  </div>;
}
