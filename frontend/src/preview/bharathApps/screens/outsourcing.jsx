// ============================================================================
// PREVIEW SCREENS I–L: work received, work outsourced, completion, financials
// ============================================================================

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  IndianRupee,
  Info,
  ReceiptText,
  Send,
  UserCheck,
  WalletCards,
} from "lucide-react";
import {
  canPerform,
  MAIN_LIFECYCLE,
  STATUS_META,
  TRANSITION_LABELS,
  usePreview,
  WORK_ORDER_FLOW,
} from "../state";
import {
  Button,
  DeniedPanel,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Pill,
  PreviewBanner,
  SectionCard,
  SimulatedTag,
  Textarea,
  UnsupportedNote,
  WorkStatusBadge,
  money,
} from "../components";

const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "—");

// ===========================================================================
// Shared lifecycle strip
// ===========================================================================
function LifecycleStrip({ status }) {
  const current = STATUS_META[status]?.order ?? 0;
  return (
    <div className="minimia-scroll overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-1.5">
        {MAIN_LIFECYCLE.map((s, i) => {
          const meta = STATUS_META[s];
          const done = meta.order < current;
          const active = meta.order === current;
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold whitespace-nowrap ${
                  active
                    ? "bg-[#176b9b] text-white"
                    : done
                      ? "bg-[#e0f2fe] text-[#0b6b96]"
                      : "bg-[#f4f6fa] text-[#98a2b3]"
                }`}
              >
                {meta.label}
              </span>
              {i < MAIN_LIFECYCLE.length - 1 && <span className="text-[#cbd5e1]">&rarr;</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Shows the current status plus every transition the current persona may
 * perform. Steps the persona may not perform stay visible but disabled and
 * explain why, rather than being silently hidden.
 */
function TransitionBar({ personaId }) {
  const { state, dispatch } = usePreview();
  const wo = state.workOrder;
  const entries = Object.entries(WORK_ORDER_FLOW[wo.status] ?? {});

  if (entries.length === 0) {
    return <p className="text-[0.76rem] text-[#667085]">This work order is closed. No further transitions are possible.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([to, actors]) => {
        const gate = canPerform(personaId, wo, to);
        const needsNote = ["CANCELLED", "DECLINED", "CORRECTION_REQUESTED", "REVISION_REQUESTED"].includes(to);
        return (
          <div key={to} className="rounded-lg border border-[#e5e9f2] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-bold text-[#172033]">{TRANSITION_LABELS[to] ?? to}</p>
                <p className="text-[0.7rem] text-[#667085]">
                  {gate.allowed
                    ? "You may perform this step."
                    : `Blocked. Only ${actors.join(" or ")} may perform this step.`}
                </p>
              </div>
              <Button
                variant={to === "COMPLETED" || to === "CANCELLED" || to === "DECLINED" ? "secondary" : "primary"}
                disabled={!gate.allowed}
                onClick={() => {
                  const note = needsNote ? window.prompt("Reason (optional, preview only)") ?? undefined : undefined;
                  dispatch({ type: "TRANSITION", personaId, toStatus: to, note });
                }}
              >
                {TRANSITION_LABELS[to] ?? to}
              </Button>
            </div>
            {!gate.allowed && <UnsupportedNote>{gate.reason}</UnsupportedNote>}
          </div>
        );
      })}
    </div>
  );
}

function MessageThread({ fromPersonaId, toKey }) {
  const { state, dispatch } = usePreview();
  const [body, setBody] = useState("");
  const msgs = state.messages.filter((m) => m.workOrderId === state.workOrder.id);
  return (
    <div className="space-y-2.5">
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
        {msgs.map((m) => {
          const mine = m.fromKey === fromPersonaId;
          const senderLabel =
            m.fromKey === "main" ? "HomeRefix" : m.fromKey === "receiving" ? "Vista Living Interiors" : m.fromKey;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 ${mine ? "bg-[#176b9b] text-white" : "bg-white text-[#172033] border border-[#e5e9f2]"}`}>
                <p className={`text-[0.62rem] font-bold ${mine ? "text-white/70" : "text-[#98a2b3]"}`}>
                  {senderLabel} · {fmtDate(m.sentAt)} · in-app only
                </p>
                <p className="mt-0.5 text-[0.76rem] leading-relaxed">{m.body}</p>
              </div>
            </div>
          );
        })}
        {msgs.length === 0 && <p className="text-[0.74rem] text-[#98a2b3]">No messages on this work order.</p>}
      </div>
      <div className="flex gap-2">
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message…" />
        <Button
          disabled={!body.trim()}
          onClick={() => {
            dispatch({ type: "SEND_MESSAGE", fromKey: fromPersonaId, toKey, body: body.trim() });
            setBody("");
          }}
        >
          <Send size={13} /> Send
        </Button>
      </div>
      <UnsupportedNote>Explicit user action only. Nothing is sent automatically, and no email, SMS or WhatsApp is used.</UnsupportedNote>
    </div>
  );
}

// ===========================================================================
// SCREEN I — Work Received
// ===========================================================================
export function ScreenWorkReceived() {
  const { state, dispatch } = usePreview();
  const personaId = state.activePersonaId;
  const wo = state.workOrder;
  const draft = state.subQuoteDraft;
  const emp = state.employee;
  const isReceiving = personaId === "receiving";
  const isEmployee = personaId === "employee";
  const canAct = isReceiving || isEmployee;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen I · Work Received"
        title="Review, quote, confirm and staff the job"
        description="Everything the receiving contractor needs — and nothing from the main contractor's own project."
        actions={<SimulatedTag>Mock work order</SimulatedTag>}
      />
      <PreviewBanner />

      {!canAct && (
        <DeniedPanel title="Receiving contractor view">
          Switch to the "Receiving contractor" persona to review this request. The main contractor and the end customer do not
          act on the receiving side.
        </DeniedPanel>
      )}

      <SectionCard
        title={`Work order ${wo.reference}`}
        description={`${state.project.property.name} · main contractor ${state.profiles.main.businessName}`}
        action={<WorkStatusBadge status={wo.status} tone={STATUS_META[wo.status]?.tone} />}
      >
        <LifecycleStrip status={wo.status} />
        <div className="mt-3.5 space-y-2.5">
          {wo.declinedReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-[0.74rem] font-bold text-rose-900">Declined</p>
              <p className="mt-0.5 text-[0.72rem] text-rose-800">{wo.declinedReason}</p>
            </div>
          )}
          {wo.cancelledReason && (
            <div className="rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
              <p className="text-[0.74rem] font-bold text-[#475467]">Cancelled</p>
              <p className="mt-0.5 text-[0.72rem] text-[#667085]">{wo.cancelledReason}</p>
            </div>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Shared scope" description="Only what was explicitly shared.">
          <div className="space-y-2.5">
            {wo.sharedScope.map((s) => (
              <div key={s.scopeId} className="rounded-lg border border-[#e5e9f2] bg-white p-3">
                <p className="text-[0.82rem] font-bold text-[#172033]">{s.name}</p>
                <p className="mt-1 text-[0.74rem] leading-relaxed text-[#475467]">{s.description}</p>
                <p className="mt-1 text-[0.7rem] text-[#667085]">{s.quantity} {s.unit}</p>
              </div>
            ))}
            <dl className="grid grid-cols-2 gap-2.5">
              <KeyValue label="Measurement" value={`v${wo.sharedMeasurement.version} · ${wo.sharedMeasurement.totalAreaSqft} sqft`} />
              <KeyValue label="Site pincode" value={wo.sharedLocation.pincode} mono />
              <KeyValue label="Site contact" value={`${wo.sharedLocation.siteContact.name} · ${wo.sharedLocation.siteContact.phone}`} />
              <KeyValue label="Required dates" value={`${wo.requiredDates.start} → ${wo.requiredDates.end}`} />
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {state.project.photos.filter((p) => wo.sharedPhotos.includes(p.id)).map((p) => (
                <Pill key={p.id} tone="neutral"><Camera size={11} className="mr-1 inline" />{p.name}</Pill>
              ))}
            </div>
          </div>
          <DeniedPanel title="Not visible to you">
            The end-customer quotation, the main contractor's margin, the other project scopes, private notes and any unrelated
            customer, property or file.
          </DeniedPanel>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Your quotation"
            description="Your price. Separate from the main contractor's customer quotation."
            action={wo.quote ? <Pill tone="success">Submitted</Pill> : <Pill tone="warning">Draft</Pill>}
          >
            <div className="space-y-2">
              {draft.lines.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[0.76rem] font-semibold text-[#172033]">{l.description}</p>
                    <p className="text-[0.68rem] text-[#98a2b3]">{l.quantity} {l.unit} × {money(l.rate)}</p>
                  </div>
                  <p className="shrink-0 text-[0.78rem] font-bold text-[#172033]">{money(l.amount)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#e5e9f2] pt-2.5">
              <span className="text-[0.8rem] font-bold text-[#475467]">Quotation total</span>
              <span className="text-[1rem] font-extrabold text-[#172033]">{money(draft.total)}</span>
            </div>
            <p className="mt-2 text-[0.7rem] text-[#667085]">Valid {draft.validDays} days. Uses existing units and decimal rules.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!canAct} onClick={() => dispatch({ type: "EDIT_SUBQUOTE", patch: { total: draft.total + 1500 } })}>
                Add contingency (simulate)
              </Button>
              <UnsupportedNote>Editing the draft is local preview state. The submitted figure is fixed at send time.</UnsupportedNote>
            </div>
          </SectionCard>

          <SectionCard title="Your transition" description="Authority is enforced per step, not per role alone.">
            <TransitionBar personaId={personaId} />
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Assign your own employees"
        description="You staff your own team. The main contractor cannot assign your employees."
      >
        {!isReceiving && <UnsupportedNote>Only the receiving contractor assigns their own employees.</UnsupportedNote>}
        <div className="mt-2 space-y-2">
          {wo.assignments.length === 0 ? (
            <p className="text-[0.78rem] text-[#667085]">No employees assigned yet.</p>
          ) : (
            wo.assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-bold text-[#172033]">{state.employee.name}</p>
                  <p className="text-[0.7rem] text-[#667085]">
                    {money(a.agreedWage)}/{a.wageMode} · assigned {fmtDate(a.assignedOn)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={a.status === "ASSIGNED" ? "info" : "success"}>{a.status}</Pill>
                  {isReceiving && (
                    <Button variant="secondary" onClick={() => dispatch({ type: "REMOVE_ASSIGNMENT", assignmentId: a.id })}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}

          {isReceiving && (
            <Button
              disabled={wo.assignments.some((a) => a.employeePersonaId === emp.personaId)}
              onClick={() => dispatch({ type: "ASSIGN_EMPLOYEE", employeePersonaId: emp.personaId, personaId: "receiving" })}
            >
              <UserCheck size={13} /> Assign {emp.name}
            </Button>
          )}
          <UnsupportedNote>
            Duplicate assignment is rejected. An Employee is a team member only after accepting an invitation — never
            automatically.
          </UnsupportedNote>
        </div>
      </SectionCard>

      <SectionCard title="Messages" description="In-app only.">
        <MessageThread fromPersonaId={personaId} toKey={personaId === "receiving" ? "main" : "receiving"} />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SCREEN J — Work Outsourced
// ===========================================================================
export function ScreenWorkOutsourced() {
  const { state, dispatch } = usePreview();
  const personaId = state.activePersonaId;
  const wo = state.workOrder;
  const isMain = personaId === "main";
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen J · Work Outsourced"
        title="Review the quote, approve the schedule, track progress"
        description="You own this work order but you did not perform it."
        actions={<SimulatedTag>Mock work order</SimulatedTag>}
      />
      <PreviewBanner />

      {!isMain && (
        <DeniedPanel title="Main contractor view">
          Switch to the "Main contractor" persona. The receiving contractor acts on Work Received, not here.
        </DeniedPanel>
      )}

      <SectionCard
        title={`Work order ${wo.reference}`}
        description={`${state.profiles.receiving.businessName} · ${wo.sharedScope.map((s) => s.name).join(", ")}`}
        action={<WorkStatusBadge status={wo.status} tone={STATUS_META[wo.status]?.tone} />}
      >
        <LifecycleStrip status={wo.status} />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Quotation received from the subcontractor"
          description="Theirs, not yours. Your customer quotation is a separate record."
        >
          {!wo.quote ? (
            <p className="text-[0.78rem] text-[#667085]">No quotation received yet.</p>
          ) : (
            <div className="space-y-2">
              {wo.quote.lines.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[0.76rem] font-semibold text-[#172033]">{l.description}</p>
                    <p className="text-[0.68rem] text-[#98a2b3]">{l.quantity} {l.unit} × {money(l.rate)}</p>
                  </div>
                  <p className="shrink-0 text-[0.78rem] font-bold text-[#172033]">{money(l.amount)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-[#e5e9f2] pt-2.5">
                <span className="text-[0.8rem] font-bold text-[#475467]">Subcontract price</span>
                <span className="text-[1rem] font-extrabold text-[#172033]">{money(wo.quote.total)}</span>
              </div>
            </div>
          )}
          {wo.agreed && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="flex items-center gap-1.5 text-[0.74rem] font-bold text-emerald-900">
                <CheckCircle2 size={13} /> Agreed by both parties
              </p>
              <dl className="mt-1.5 space-y-1 text-[0.72rem] text-emerald-800">
                <div className="flex justify-between"><dt>Price</dt><dd className="font-bold">{money(wo.agreed.price)}</dd></div>
                <div className="flex justify-between"><dt>Scope</dt><dd className="font-bold">{wo.agreed.scopeIds.length} scope</dd></div>
                <div className="flex justify-between"><dt>Schedule</dt><dd className="font-bold">{wo.agreed.schedule?.start} → {wo.agreed.schedule?.end}</dd></div>
              </dl>
              <p className="mt-1.5 text-[0.68rem] text-emerald-700">
                Main confirmed {fmtDate(wo.agreed.confirmedByMainAt)}
                {wo.agreed.confirmedByReceivingAt ? ` · subcontractor confirmed ${fmtDate(wo.agreed.confirmedByReceivingAt)}` : " · subcontractor confirmation pending"}
              </p>
            </div>
          )}
          <div className="mt-3 rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
            <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Comparison with your customer quotation</p>
            <dl className="mt-1.5 space-y-1 text-[0.74rem]">
              <div className="flex justify-between"><dt className="text-[#667085]">Scope sold to customer (False Ceiling line)</dt><dd className="font-bold">{money(148480)}</dd></div>
              <div className="flex justify-between"><dt className="text-[#667085]">Subcontract price</dt><dd className="font-bold">{money(wo.agreed?.price ?? wo.quote?.total ?? 0)}</dd></div>
              <div className="flex justify-between border-t border-[#e5e9f2] pt-1"><dt className="font-bold text-[#172033]">Gross margin on this scope</dt><dd className="font-extrabold text-[#172033]">{money((148480 - (wo.agreed?.price ?? wo.quote?.total ?? 0)))}</dd></div>
            </dl>
            <p className="mt-1.5 text-[0.68rem] text-[#b54708]">Main contractor only. Never shown to the subcontractor.</p>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Your transition" description="Approval is split — you confirm, they schedule.">
            <TransitionBar personaId={personaId} />
          </SectionCard>

          <SectionCard title="Progress updates from the subcontractor">
            {wo.progressUpdates.length === 0 ? (
              <p className="text-[0.78rem] text-[#667085]">No progress updates yet.</p>
            ) : (
              <div className="space-y-2">
                {wo.progressUpdates.map((p) => (
                  <div key={p.id} className="rounded-lg border border-[#e5e9f2] bg-white px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[0.74rem] font-bold text-[#172033]">{fmtDate(p.at)}</p>
                      <Pill tone="info">{p.percentComplete}% complete</Pill>
                    </div>
                    <p className="mt-1 text-[0.74rem] text-[#475467]">{p.note}</p>
                    {p.evidence.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.evidence.map((e) => (<Pill key={e} tone="neutral"><Camera size={10} className="mr-1 inline" />{e}</Pill>))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Additional work" description="Requires explicit approval before the order changes.">
            <div className="space-y-2">
              {wo.additionalWorkRequests.length === 0 ? (
                <p className="text-[0.78rem] text-[#667085]">No additional work raised.</p>
              ) : (
                wo.additionalWorkRequests.map((r) => (
                  <div key={r.id} className="rounded-lg border border-[#e5e9f2] bg-white px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[0.76rem] font-bold text-[#172033]">{r.description}</p>
                      <Pill tone={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>{r.status.replaceAll("_", " ")}</Pill>
                    </div>
                    <p className="mt-0.5 text-[0.7rem] text-[#667085]">Estimated {money(r.estimatedAmount)}</p>
                    <p className="mt-1 text-[0.68rem] text-[#98a2b3]">{r.note}</p>
                    {isMain && r.status === "PENDING_APPROVAL" && (
                      <div className="mt-2 flex gap-2">
                        <Button onClick={() => dispatch({ type: "RESPOND_ADDITIONAL_WORK", requestId: r.id, approve: true, personaId: "main" })}>
                          <Check size={13} /> Approve
                        </Button>
                        <Button variant="secondary" onClick={() => dispatch({ type: "RESPOND_ADDITIONAL_WORK", requestId: r.id, approve: false, personaId: "main" })}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Messages" description="In-app only.">
        <MessageThread fromPersonaId={personaId} toKey={personaId === "main" ? "receiving" : "main"} />
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SCREEN K — Completion review and correction request
// ===========================================================================
export function ScreenCompletion() {
  const { state, dispatch } = usePreview();
  const personaId = state.activePersonaId;
  const wo = state.workOrder;
  const [note, setNote] = useState("");
  const [percent, setPercent] = useState(100);
const [evidence, setEvidence] = useState("false-ceiling-finished.jpg, ceiling-detail.jpg");
  const canSubmit = (personaId === "receiving" || personaId === "employee") && note.trim().length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen K · Completion"
        title="Completion evidence, review and corrections"
        description="The receiving contractor submits. Only the main contractor approves completion."
        actions={<SimulatedTag>Mock evidence</SimulatedTag>}
      />
      <PreviewBanner />

      <SectionCard
        title={`Work order ${wo.reference}`}
        action={<WorkStatusBadge status={wo.status} tone={STATUS_META[wo.status]?.tone} />}
      >
        <LifecycleStrip status={wo.status} />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Submit completion evidence"
          description="Photos, notes and completion percentage."
        >
          <Field label="Completion note" required>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the completed work…" />
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Percent complete">
              <Input type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
            </Field>
            <Field label="Evidence photos" hint="Comma separated file names — no upload in preview">
              <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={!canSubmit}
              onClick={() =>
                dispatch({
                  type: "SUBMIT_COMPLETION",
                  personaId,
                  note: note.trim(),
                  evidence: evidence.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            >
              <Camera size={13} /> Submit for review
            </Button>
            <Button
              variant="secondary"
              disabled={!canSubmit}
              onClick={() =>
                dispatch({
                  type: "ADD_PROGRESS_UPDATE",
                  personaId,
                  note: note.trim(),
                  percentComplete: percent,
                  evidence: evidence.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            >
              Post progress update
            </Button>
          </div>
          {!canSubmit && (
            <UnsupportedNote>
              Only the receiving contractor or their assigned employee may submit. The main contractor cannot submit on the
              other party's behalf.
            </UnsupportedNote>
          )}
          <UnsupportedNote>No real upload, message or notification is triggered.</UnsupportedNote>
        </SectionCard>

        <SectionCard
          title="Review and approve"
          description="Approval authority is exclusive to the main contractor."
        >
          {!wo.completionSubmission ? (
            <p className="text-[0.78rem] text-[#667085]">Nothing submitted for review yet.</p>
          ) : (
            <div className="space-y-2.5">
              <div className="rounded-lg border border-[#e5e9f2] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.78rem] font-bold text-[#172033]">
                    {wo.completionSubmission.submittedBy === "employee" ? state.employee.name : "Vista Living Interiors"}
                  </p>
                  <Pill tone={wo.completionSubmission.correctionsRequested > 0 ? "warning" : "info"}>
                    submitted {fmtDate(wo.completionSubmission.submittedAt)}
                  </Pill>
                </div>
                <p className="mt-1 text-[0.75rem] text-[#475467]">{wo.completionSubmission.note}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {wo.completionSubmission.evidence.map((e) => (<Pill key={e} tone="neutral">{e}</Pill>))}
                </div>
                {wo.completionSubmission.correctionsRequested > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-[0.72rem] font-semibold text-amber-700">
                    <AlertTriangle size={12} /> {wo.completionSubmission.correctionsRequested} correction round requested
                  </p>
                )}
              </div>

              {wo.correctionRequests.filter((c) => !c.resolved).map((c) => (
                <div key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[0.74rem] font-bold text-amber-900">Open correction request</p>
                  <p className="mt-0.5 text-[0.72rem] text-amber-800">{c.note}</p>
                  <p className="mt-1 text-[0.68rem] text-amber-700">Raised {fmtDate(c.at)}</p>
                </div>
              ))}

              <TransitionBar personaId={personaId} />
              <UnsupportedNote>
                A receiving contractor can never mark its own work approved — that step is blocked by the transition map, not
                just hidden.
              </UnsupportedNote>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Employee view" description="Only what the assigned employee needs.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#e5e9f2] bg-white p-3">
            <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">My assignment</p>
            <p className="mt-0.5 text-[0.8rem] font-bold text-[#172033]">{wo.sharedScope[0]?.name}</p>
          </div>
          <div className="rounded-lg border border-[#e5e9f2] bg-white p-3">
            <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Site</p>
            <p className="mt-0.5 text-[0.8rem] font-bold text-[#172033]">{wo.sharedLocation.locality}</p>
            <p className="text-[0.68rem] text-[#667085]">{wo.sharedLocation.pincode}</p>
          </div>
          <div className="rounded-lg border border-[#e5e9f2] bg-white p-3">
            <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Dates</p>
            <p className="mt-0.5 flex items-center gap-1 text-[0.78rem] font-bold text-[#172033]">
              <CalendarDays size={12} /> {wo.requiredDates.start}
            </p>
          </div>
          <div className="rounded-lg border border-[#e5e9f2] bg-white p-3">
            <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">My wage</p>
            <p className="mt-0.5 flex items-center gap-1 text-[0.8rem] font-bold text-[#172033]">
              <IndianRupee size={12} /> {wo.assignments[0]?.agreedWage ?? 850} / day
            </p>
          </div>
        </div>
        <DeniedPanel title="Not shown to the employee">
          The customer quotation, the subcontract price agreed between the two contractors, the other scopes, private notes and
          every financial record.
        </DeniedPanel>
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SCREEN L — Separate customer and subcontractor payment records
// ===========================================================================
export function ScreenPayments() {
  const { state, dispatch } = usePreview();
  const personaId = state.activePersonaId;
  const wo = state.workOrder;
  const fin = state.financials;
  const isMain = personaId === "main";
  const isReceiving = personaId === "receiving";
  const isCustomer = personaId === "customer";

  const customerPaid = fin.customerToMain.payments.reduce((s, p) => s + p.amount, 0);
  const customerBalance = Math.max(fin.customerToMain.total - customerPaid, 0);
  const subPaid = fin.mainToReceiving.payments.reduce((s, p) => s + p.amount, 0);
  const subBalance = Math.max(fin.mainToReceiving.total - subPaid, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen L · Payments"
        title="Three separate financial relationships"
        description="A customer payment never settles a subcontractor payment."
        actions={<SimulatedTag>Simulated ledger</SimulatedTag>}
      />
      <PreviewBanner />

      <div className="rounded-xl border border-[#e5e9f2] bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            // A customer never sees the main-to-receiving or receiving-to-employee
            // totals, and a receiving contractor never sees the customer ledger.
            isMain || isCustomer
              ? { label: "Customer → Main contractor", rel: fin.customerToMain.relationship, paid: customerPaid, total: fin.customerToMain.total }
              : null,
            isMain || isReceiving
              ? { label: "Main contractor → Receiving contractor", rel: fin.mainToReceiving.relationship, paid: subPaid, total: fin.mainToReceiving.total }
              : null,
            isMain || isReceiving
              ? { label: "Receiving contractor → Employee", rel: fin.receivingToEmployee.relationship, paid: 0, total: fin.receivingToEmployee.total }
              : null,
          ]
            .filter(Boolean)
            .map((r) => (
            <div key={r.label} className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3">
              <p className="text-[0.68rem] font-bold uppercase tracking-wide text-[#98a2b3]">{r.label}</p>
              <p className="mt-1.5 text-[0.95rem] font-extrabold text-[#172033]">{money(r.total)}</p>
              <p className="text-[0.72rem] text-[#667085]">Paid {money(r.paid)}</p>
              <p className="mt-1 text-[0.72rem] font-bold text-[#176b9b]">Outstanding {money(r.total - r.paid)}</p>

            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.72rem] text-[#667085]">{fin.mainToReceiving.rule}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
<SectionCard
          title="Customer → Main contractor"
          description={fin.customerToMain.invoiceNumber}
          action={<Pill tone={fin.customerToMain.status === "PAID" ? "success" : "warning"}>{fin.customerToMain.status.replaceAll("_", " ")}</Pill>}
        >
          {/* The end-customer quotation is the main contractor's own commercial
              document. The receiving contractor is told it exists but is never
              shown its lines, total, payments or balance — a DeniedPanel below
              alone would still have leaked every figure above it. */}
          {!isMain && !isCustomer ? (
            <DeniedPanel title="Not available">
              You have no visibility of the customer-to-main-contractor ledger. Your own invoice, the agreed subcontract price
              and your payment status are on the right.
            </DeniedPanel>
          ) : (
            <>
              <div className="space-y-2">
                {fin.customerToMain.lines.map((l, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
                    <p className="min-w-0 text-[0.76rem] font-semibold text-[#172033]">{l.descriptionSnapshot}</p>
                    <p className="shrink-0 text-[0.78rem] font-bold text-[#172033]">{money(l.amount)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#e5e9f2] pt-2.5">
                <span className="text-[0.78rem] font-bold text-[#475467]">Invoice total</span>
                <span className="font-extrabold text-[#172033]">{money(fin.customerToMain.total)}</span>
              </div>

              <div className="mt-3 space-y-1.5">
                <p className="text-[0.68rem] font-bold uppercase tracking-wide text-[#98a2b3]">Payments recorded</p>
                {fin.customerToMain.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f4f6fa] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[0.74rem] font-semibold text-[#172033]">{fmtDate(p.date)} · {p.mode}</p>
                      <p className="font-mono text-[0.66rem] text-[#98a2b3]">{p.reference}</p>
                    </div>
                    <p className="shrink-0 text-[0.78rem] font-bold text-[#172033]">{money(p.amount)}</p>
                  </div>
                ))}
              </div>
              <dl className="mt-3 space-y-1 border-t border-[#e5e9f2] pt-2.5">
                <div className="flex justify-between text-[0.76rem]"><dt className="text-[#667085]">Received</dt><dd className="font-bold">{money(customerPaid)}</dd></div>
                <div className="flex justify-between text-[0.76rem]"><dt className="text-[#667085]">Balance</dt><dd className="font-bold">{money(customerBalance)}</dd></div>
              </dl>

              {isMain && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => dispatch({ type: "RECORD_CUSTOMER_PAYMENT", amount: Math.min(customerBalance, 100000), mode: "UPI" })}
                    disabled={customerBalance === 0}
                  >
                    <ReceiptText size={13} /> Record payment of {money(Math.min(customerBalance, 100000))}
                  </Button>
                  <UnsupportedNote>Simulated receipt. No payment gateway and no money transfer.</UnsupportedNote>
                </div>
              )}
              {isCustomer && <UnsupportedNote>You see your own invoices and receipts only. Nothing about the subcontractor.</UnsupportedNote>}
            </>
          )}
        </SectionCard>

        {/* The main-to-receiving ledger is never rendered for the end customer:
            its invoice number, lines and totals are the main contractor's costs. */}
        {isMain || isReceiving ? (
        <SectionCard
          title="Main contractor → Receiving contractor"
          description={fin.mainToReceiving.invoiceNumber}
          action={
            <Pill tone={fin.mainToReceiving.status === "PAID" ? "success" : fin.mainToReceiving.status === "ISSUED" ? "info" : "neutral"}>
              {fin.mainToReceiving.status.replaceAll("_", " ")}
            </Pill>
          }
        >
          <>
          {fin.mainToReceiving.total === 0 ? (

            <div className="space-y-2">
              <p className="text-[0.78rem] text-[#667085]">No subcontract invoice issued yet.</p>
              <UnsupportedNote>
                Invoicing is allowed once the work order is completed. Issues its own number, separate from the customer
                invoice sequence.
              </UnsupportedNote>
              {isMain && (
                <Button disabled={wo.status !== "COMPLETED"} onClick={() => dispatch({ type: "ISSUE_SUBCONTRACT_INVOICE" })}>
                  <ReceiptText size={13} /> Issue subcontract invoice at {money(wo.agreed?.price ?? 0)}
                </Button>
              )}
              {isMain && wo.status !== "COMPLETED" && (
                <UnsupportedNote>Available once the work order reaches Completed. Use screen K to approve completion first.</UnsupportedNote>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {fin.mainToReceiving.lines.map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
                  <p className="min-w-0 text-[0.76rem] font-semibold text-[#172033]">{l.descriptionSnapshot}</p>
                  <p className="shrink-0 text-[0.78rem] font-bold text-[#172033]">{money(l.amount)}</p>
                </div>
              ))}
              <div className="space-y-1.5">
                {fin.mainToReceiving.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f4f6fa] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[0.74rem] font-semibold text-[#172033]">{fmtDate(p.date)} · {p.mode}</p>
                      <p className="font-mono text-[0.66rem] text-[#98a2b3]">{p.reference}</p>
                    </div>
                    <p className="shrink-0 text-[0.78rem] font-bold text-[#172033]">{money(p.amount)}</p>
                  </div>
                ))}
              </div>
              <dl className="space-y-1 border-t border-[#e5e9f2] pt-2.5">
                <div className="flex justify-between text-[0.76rem]"><dt className="text-[#667085]">Paid</dt><dd className="font-bold">{money(subPaid)}</dd></div>
                <div className="flex justify-between text-[0.76rem]"><dt className="text-[#667085]">Balance</dt><dd className="font-bold">{money(subBalance)}</dd></div>
              </dl>
              {isMain && (
                <Button
                  disabled={subBalance === 0}
                  onClick={() => dispatch({ type: "PAY_SUBCONTRACTOR", amount: Math.min(subBalance, 30000), mode: "BANK_TRANSFER", employeeName: "" })}
                >
                  <WalletCards size={13} /> Record payment of {money(Math.min(subBalance, 30000))}
                </Button>
              )}
              {isReceiving && <UnsupportedNote>You see only your own invoice, agreed price and payment status.</UnsupportedNote>}
            </div>
          )}

          {isMain && (
            <div className="mt-3 rounded-lg border border-[#fde68a] bg-amber-50 p-3">
              <p className="flex items-start gap-1.5 text-[0.72rem] font-bold text-amber-900">
                <Info size={12} className="mt-0.5 shrink-0" /> Independence check
              </p>
              <p className="mt-1 text-[0.7rem] text-amber-800">
                Customer received {money(customerPaid)}. Subcontractor paid {money(subPaid)}. Receiving{" "}
                {money(Math.max(fin.mainToReceiving.total, 1))} does not move when a customer payment is recorded — record one on
                the left and watch this balance stay put.
              </p>
            </div>
          )}
          </>
        </SectionCard>
        ) : null}
      </div>

      {isMain || isReceiving ? (
      <SectionCard
        title="Receiving contractor → Employee"
        description={fin.receivingToEmployee.wageRecordNumber}
      >
        <div className="space-y-2">


          {fin.receivingToEmployee.lines.length === 0 ? (
            <p className="text-[0.78rem] text-[#667085]">No wage record accrued yet.</p>
          ) : (
            fin.receivingToEmployee.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
                <p className="text-[0.76rem] font-semibold text-[#172033]">{l.descriptionSnapshot}</p>
                <p className="text-[0.78rem] font-bold text-[#172033]">{money(l.amount)}</p>
              </div>
            ))
          )}
          {isReceiving && (
            <Button
              disabled={wo.assignments.length === 0 || wo.status !== "COMPLETED"}
              onClick={() => dispatch({ type: "PAY_SUBCONTRACTOR", amount: 0, mode: "CASH", employeeName: state.employee.name })}
            >
              Accrue wage for {state.employee.name}
            </Button>
          )}
          {isReceiving && (wo.assignments.length === 0 || wo.status !== "COMPLETED") && (
            <UnsupportedNote>Requires an assigned employee and a completed work order.</UnsupportedNote>
          )}
          <p className="text-[0.72rem] text-[#667085]">{fin.receivingToEmployee.note}</p>
        </div>
      </SectionCard>
      ) : null}

      {isCustomer && (
        <DeniedPanel title="Two ledgers you are not part of">
          This project may be executed with a subcontractor and their employees. Those costs and wage records belong to
          those two relationships. Your quotation, your invoices, your payments and your balance are unaffected by them.
        </DeniedPanel>
      )}


      <SectionCard title="Rules preserved" description="Existing financial behaviour is reused, not replaced.">
        <ul className="space-y-1.5 text-[0.76rem] text-[#475467]">
          <li className="flex items-start gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /> Existing invoice numbering sequence is reused; the subcontract invoice uses its own reference.</li>
          <li className="flex items-start gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /> Existing payment modes, reference requirements and over-payment guards apply.</li>
          <li className="flex items-start gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /> Decimal calculations and GST handling are unchanged.</li>
          <li className="flex items-start gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /> No payment gateway and no money transfer is introduced.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

