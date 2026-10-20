export default function ScheduleApprovalMethod({ value = "PORTAL", onChange, disabled = false }) {
  return <label className="block text-sm font-semibold">
    Scheduling method
    <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className="bp-ui-control mt-2 w-full rounded-xl border px-3 py-3 font-normal">
      <option value="PORTAL">Request customer portal approval</option>
      <option value="CONTRACTOR">Contractor-authorized — no portal approval required</option>
    </select>
    <span className="mt-2 block text-xs font-normal text-slate-600">{value === "CONTRACTOR"
      ? "You authorize these dates, including for an unaccepted quotation. Customer acceptance remains separate. Advance and worker-readiness checks still apply before starting work."
      : "The customer must accept the quotation and confirm the proposed dates in the portal."}</span>
  </label>;
}
