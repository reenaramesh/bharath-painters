// ============================================================================
// BHARATH APPS — PREVIEW STATE (mock only)
// ----------------------------------------------------------------------------
// A local React reducer. There is no API client import in this file and no
// fetch/axios call anywhere under src/preview/. Every action below mutates
// in-memory mock state only.
//
// WORK_ORDER_FLOW encodes the transition authority required by the brief:
// neither party can unilaterally mark the other party's acceptance or
// completion approval.
// ============================================================================

import { createContext, useContext, useMemo, useReducer } from "react";
import {
  SEED_CATALOGUE,
  SEED_CONNECTIONS,
  SEED_EMPLOYEE,
  SEED_FINANCIALS,
  SEED_MESSAGES,
  SEED_NETWORK_DIRECTORY,
  SEED_PROFILES,
  SEED_PROJECT,
  SEED_SAVED_CONTACTS,
  SEED_WORK_ORDER,
  SIMULATED_ACTIONS,
  SUBQUOTE_DRAFT,
} from "./data";
import { resolveBranding } from "./branding";

export const STATUS_META = {
  DRAFT: { label: "Draft", tone: "neutral", order: 1 },
  REQUEST_SENT: { label: "Request sent", tone: "info", order: 2 },
  QUOTATION_RECEIVED: { label: "Quotation received", tone: "info", order: 3 },
  AWAITING_CONFIRMATION: { label: "Awaiting confirmation", tone: "warning", order: 4 },
  SCHEDULED: { label: "Scheduled", tone: "warning", order: 5 },
  IN_PROGRESS: { label: "In progress", tone: "warning", order: 6 },
  SUBMITTED_FOR_REVIEW: { label: "Submitted for review", tone: "info", order: 7 },
  CORRECTION_REQUESTED: { label: "Correction requested", tone: "danger", order: 7.5 },
  COMPLETED: { label: "Completed", tone: "success", order: 8 },
  DECLINED: { label: "Declined", tone: "danger", order: 0 },
  CANCELLED: { label: "Cancelled", tone: "danger", order: 0 },
  REVISION_REQUESTED: { label: "Revision requested", tone: "warning", order: 3.5 },
};

export const MAIN_LIFECYCLE = [
  "DRAFT",
  "REQUEST_SENT",
  "QUOTATION_RECEIVED",
  "AWAITING_CONFIRMATION",
  "SCHEDULED",
  "IN_PROGRESS",
  "SUBMITTED_FOR_REVIEW",
  "COMPLETED",
];

// ---------------------------------------------------------------------------
// Transition authority
// ---------------------------------------------------------------------------
// `actors` lists which persona ids may perform the transition.
// "main" / "receiving" resolve to the person holding that side of the work
// order. "employee" resolves to an employee assigned to the receiving
// contractor's side.
export const WORK_ORDER_FLOW = {
  DRAFT: {
    REQUEST_SENT: ["main"],
    CANCELLED: ["main"],
  },
  REQUEST_SENT: {
    QUOTATION_RECEIVED: ["receiving"],
    DECLINED: ["receiving"],
    CANCELLED: ["main"],
  },
  QUOTATION_RECEIVED: {
    // The main contractor cannot self-approve; it can only advance to
    // "awaiting confirmation" and the receiving contractor confirms.
    AWAITING_CONFIRMATION: ["main"],
    REVISION_REQUESTED: ["main"],
    DECLINED: ["main"],
    CANCELLED: ["main"],
  },
  AWAITING_CONFIRMATION: {
    SCHEDULED: ["receiving"],
    REVISION_REQUESTED: ["receiving"],
    DECLINED: ["receiving"],
  },
  SCHEDULED: {
    IN_PROGRESS: ["receiving"],
    CANCELLED: ["main", "receiving"],
  },
  IN_PROGRESS: {
    SUBMITTED_FOR_REVIEW: ["receiving", "employee"],
    CANCELLED: ["main", "receiving"],
  },
  SUBMITTED_FOR_REVIEW: {
    // Only the main contractor approves completion. The receiving contractor
    // cannot mark its own work approved.
    COMPLETED: ["main"],
    CORRECTION_REQUESTED: ["main"],
  },
  CORRECTION_REQUESTED: {
    SUBMITTED_FOR_REVIEW: ["receiving", "employee"],
  },
  REVISION_REQUESTED: {
    QUOTATION_RECEIVED: ["receiving"],
    DECLINED: ["receiving"],
    CANCELLED: ["main"],
  },
  DECLINED: {},
  CANCELLED: {},
  COMPLETED: {
    // Only additional work, which requires explicit approval and never
    // mutates the agreed order silently.
    SUBMITTED_FOR_REVIEW: ["receiving"],
  },
};

export const TRANSITION_LABELS = {
  REQUEST_SENT: "Send request",
  QUOTATION_RECEIVED: "Submit quotation",
  AWAITING_CONFIRMATION: "Confirm scope & price",
  REVISION_REQUESTED: "Request revision",
  SCHEDULED: "Confirm & schedule",
  IN_PROGRESS: "Start work",
  SUBMITTED_FOR_REVIEW: "Submit for review",
  COMPLETED: "Approve completion",
  CORRECTION_REQUESTED: "Request correction",
  DECLINED: "Decline",
  CANCELLED: "Cancel",
};

/**
 * Which persona side does this actor represent for a given work order?
 */
export function actorSideFor(personaId, workOrder) {
  if (personaId === workOrder.mainContractorKey) return "main";
  if (personaId === workOrder.receivingContractorKey) return "receiving";
  return null;
}

export function canPerform(personaId, workOrder, targetStatus) {
  const flow = WORK_ORDER_FLOW[workOrder.status] || {};
  const allowed = flow[targetStatus];
  if (!allowed) return { allowed: false, reason: `No ${targetStatus} step from ${workOrder.status}.` };
  if (allowed.includes(personaId)) return { allowed: true };
  return {
    allowed: false,
    reason:
      `Only ${allowed.map((a) => sideLabel(a)).join(" or ")} may perform "${TRANSITION_LABELS[targetStatus] ?? targetStatus}". ` +
      `${sideLabel(personaId)} cannot mark the other party's acceptance or approval.`,
  };
}

function sideLabel(personaId) {
  return (
    {
      main: "the main contractor",
      receiving: "the receiving contractor",
      employee: "the assigned employee",
    }[personaId] ?? "this actor"
  );
}

// ---------------------------------------------------------------------------
// Access matrix — what each persona may read
// ---------------------------------------------------------------------------
export const ACCESS_MATRIX = [
  {
    resource: "Full customer project (all scopes)",
    main: "ALLOW",
    receiving: "DENY",
    employee: "DENY",
    customer: "OWN_ONLY",
    note: "The receiving contractor sees only the shared scopes below.",
  },
  {
    resource: "Shared work scope, shared photos, site location, required dates",
    main: "ALLOW",
    receiving: "ALLOW",
    employee: "ASSIGNED_ONLY",
    note: "Explicitly shared for execution.",
  },
  {
    resource: "Customer quotation to the end customer",
    main: "ALLOW",
    receiving: "DENY",
    employee: "DENY",
    customer: "OWN_ONLY",
    note: "Unless explicitly shared as a line item on the work order.",
  },
  {
    resource: "Main contractor margin",
    main: "ALLOW",
    receiving: "DENY",
    employee: "DENY",
    customer: "DENY",
    note: "Margin is main-contractor-private on every screen.",
  },
  {
    resource: "Receiving contractor's submitted & accepted quotation",
    main: "ALLOW",
    receiving: "ALLOW",
    employee: "DENY",
    customer: "DENY",
  },
  {
    resource: "Receiving contractor's team assignments",
    main: "DENY",
    receiving: "ALLOW",
    employee: "OWN_ONLY",
    note: "The main contractor cannot assign the subcontractor's employees.",
  },
  {
    resource: "Main contractor's private notes",
    main: "ALLOW",
    receiving: "DENY",
    employee: "DENY",
    customer: "DENY",
  },
  {
    resource: "Receiving contractor's other projects & customers",
    main: "DENY",
    receiving: "OWN_ONLY",
    employee: "DENY",
    customer: "DENY",
  },
  {
    resource: "Messages on this work order",
    main: "ALLOW",
    receiving: "ALLOW",
    employee: "ASSIGNED_ONLY",
    note: "Preview sends in-app messages only. No email, SMS or WhatsApp.",
  },
  {
    resource: "Customer -> Main contractor invoice & payments",
    main: "ALLOW",
    receiving: "DENY",
    employee: "DENY",
    customer: "OWN_ONLY",
  },
  {
    resource: "Main contractor -> Receiving contractor invoice & payments",
    main: "ALLOW",
    receiving: "ALLOW",
    employee: "DENY",
    customer: "DENY",
    note: "A customer payment never settles this balance.",
  },
];

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
let actionCounter = 0;
const nextId = (prefix) => {
  actionCounter += 1;
  return `${prefix}-${actionCounter}`;
};

function initialState() {
  return {
    catalogue: SEED_CATALOGUE,
    profiles: SEED_PROFILES,
    employee: SEED_EMPLOYEE,
    directory: SEED_NETWORK_DIRECTORY,
    connections: SEED_CONNECTIONS,
    savedContacts: SEED_SAVED_CONTACTS,
    project: SEED_PROJECT,
    workOrder: SEED_WORK_ORDER,
    subQuoteDraft: SUBQUOTE_DRAFT,
    financials: SEED_FINANCIALS,
    messages: SEED_MESSAGES,
    activity: SIMULATED_ACTIONS,
    activePersonaId: "main",
    log: (entry) => ({ id: nextId("sim"), at: new Date().toISOString(), simulated: true, ...entry }),
  };
}

function setWorkOrderStatus(state, nextStatus, actorPersonaId, description) {
  return {
    ...state,
    workOrder: { ...state.workOrder, status: nextStatus },
    activity: [
      ...state.activity,
      state.log({ actorPersonaId, action: description, statusAfter: nextStatus }),
    ],
  };
}

export function previewReducer(state, action) {
  switch (action.type) {
    case "RESET":
      actionCounter = 0;
      return initialState();

    case "SET_PERSONA":
      return { ...state, activePersonaId: action.personaId };

    // -- catalogue (admin) -------------------------------------------------
    case "CREATE_CATEGORY": {
      const c = action.category;
      const created = {
        ...c,
        id: nextId("cat"),
        displayOrder: state.catalogue.length + 1,
        isActive: true,
        seededByAdmin: false,
        subServices: (c.subServices || []).map((s, i) => ({
          id: nextId("sub"),
          name: s.name,
          identifier: s.identifier,
          displayOrder: i + 1,
        })),
      };
      return {
        ...state,
        catalogue: [...state.catalogue, created],
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "admin",
            action: `Created service category "${c.name}" with ${created.subServices.length} sub-service(s). No code change required.`,
          }),
        ],
      };
    }

    case "UPDATE_CATEGORY":
      return {
        ...state,
        catalogue: state.catalogue.map((c) =>
          c.identifier === action.identifier ? { ...c, ...action.patch } : c,
        ),
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "admin",
            action: `Updated category "${action.identifier}": ${Object.keys(action.patch).join(", ")}`,
          }),
        ],
      };

    case "TOGGLE_CATEGORY_ACTIVE":
      return {
        ...state,
        catalogue: state.catalogue.map((c) =>
          c.identifier === action.identifier ? { ...c, isActive: !c.isActive } : c,
        ),
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "admin",
            action: `${action.isActive ? "Deactivated" : "Reactivated"} category "${action.identifier}". Existing profile references, quotations, jobs and history are preserved.`,
          }),
        ],
      };

    case "ADD_SUB_SERVICE":
      return {
        ...state,
        catalogue: state.catalogue.map((c) =>
          c.identifier === action.identifier
            ? {
                ...c,
                subServices: [
                  ...c.subServices,
                  {
                    id: nextId("sub"),
                    name: action.subService.name,
                    identifier: action.subService.identifier,
                    displayOrder: c.subServices.length + 1,
                  },
                ],
              }
            : c,
        ),
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "admin",
            action: `Added sub-service "${action.subService.name}" to "${action.identifier}".`,
          }),
        ],
      };

    case "TOGGLE_SUB_SERVICE":
      return {
        ...state,
        catalogue: state.catalogue.map((c) =>
          c.identifier === action.categoryIdentifier
            ? {
                ...c,
                subServices: c.subServices.map((s) =>
                  s.identifier === action.subServiceIdentifier
                    ? { ...s, isActive: s.isActive === false }
                    : s,
                ),
              }
            : c,
        ),
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "admin",
            action: `${action.isActive ? "Deactivated" : "Reactivated"} sub-service "${action.subServiceIdentifier}".`,
          }),
        ],
      };

    // -- profiles ----------------------------------------------------------
    case "SET_CORE_SERVICE":
      return {
        ...state,
        profiles: {
          ...state.profiles,
          [action.personaKey]: {
            ...state.profiles[action.personaKey],
            coreServiceIdentifier: action.identifier,
            // Core service is replaced outright. Additional services survive,
            // which is exactly why branding must not depend on them.
          },
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: `Changed core service to "${action.identifier}". Workspace heading changes; additional services do not.`,
          }),
        ],
      };

    case "TOGGLE_ADDITIONAL_SERVICE":
      return {
        ...state,
        profiles: {
          ...state.profiles,
          [action.personaKey]: {
            ...state.profiles[action.personaKey],
            additionalServiceIdentifiers: state.profiles[action.personaKey].additionalServiceIdentifiers.includes(
              action.identifier,
            )
              ? state.profiles[action.personaKey].additionalServiceIdentifiers.filter(
                  (i) => i !== action.identifier,
                )
              // Selecting a category does NOT auto-select every sub-service.
              : [...state.profiles[action.personaKey].additionalServiceIdentifiers, action.identifier],
          },
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: `${action.selected ? "Added" : "Removed"} additional service "${action.identifier}". Core branding unchanged.`,
          }),
        ],
      };

    case "TOGGLE_ADDITIONAL_SUBSERVICE":
      return {
        ...state,
        profiles: {
          ...state.profiles,
          [action.personaKey]: {
            ...state.profiles[action.personaKey],
            additionalSubServiceIdentifiers:
              state.profiles[action.personaKey].additionalSubServiceIdentifiers.includes(
                action.subServiceIdentifier,
              )
                ? state.profiles[action.personaKey].additionalSubServiceIdentifiers.filter(
                    (i) => i !== action.subServiceIdentifier,
                  )
                : [...state.profiles[action.personaKey].additionalSubServiceIdentifiers, action.subServiceIdentifier],
          },
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: `${action.selected ? "Claimed" : "Released"} sub-service "${action.subServiceIdentifier}".`,
          }),
        ],
      };

    case "TOGGLE_EMPLOYEE_TRADE":
      return {
        ...state,
        employee: {
          ...state.employee,
          primaryTradeIdentifier:
            action.kind === "primary"
              ? action.identifier
              : state.employee.primaryTradeIdentifier,
          additionalSkillIdentifiers:
            action.kind === "additional"
              ? state.employee.additionalSkillIdentifiers.includes(action.identifier)
                ? state.employee.additionalSkillIdentifiers.filter((i) => i !== action.identifier)
                : [...state.employee.additionalSkillIdentifiers, action.identifier]
              : state.employee.additionalSkillIdentifiers,
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "employee",
            action: `Employee profile: ${action.kind === "primary" ? "primary trade set to" : "additional skill toggled"} "${action.identifier}".`,
          }),
        ],
      };

    case "TOGGLE_EMPLOYEE_SUBSKILL":
      return {
        ...state,
        employee: {
          ...state.employee,
          additionalSubServiceIdentifiers: state.employee.additionalSubServiceIdentifiers.includes(
            action.subServiceIdentifier,
          )
            ? state.employee.additionalSubServiceIdentifiers.filter(
                (i) => i !== action.subServiceIdentifier,
              )
            : [...state.employee.additionalSubServiceIdentifiers, action.subServiceIdentifier],
        },
        activity: [
          ...state.activity,
          state.log({ actorPersonaId: "employee", action: `Toggled skill "${action.subServiceIdentifier}".` }),
        ],
      };

    case "SET_PROFILE_DRAFT":
      return {
        ...state,
        profiles: {
          ...state.profiles,
          [action.personaKey]: {
            ...state.profiles[action.personaKey],
            profileDraft: action.value,
          },
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: `${action.value ? "Saved profile as a draft" : "Published profile"} (Complete later is available).`,
          }),
        ],
      };

    // -- network -----------------------------------------------------------
    case "SEND_CONNECTION_REQUEST": {
      const dir = state.directory.find((d) => d.contractorKey === action.toKey);
      if (!dir) return state;
      const existing = state.connections.find(
        (c) =>
          (c.fromKey === "main" && c.toKey === action.toKey) ||
          (c.fromKey === action.toKey && c.toKey === "main"),
      );
      if (existing) {
        return {
          ...state,
          activity: [
            ...state.activity,
            state.log({
              actorPersonaId: "main",
              action: `Duplicate request to ${dir.businessName} blocked — a connection already exists (${existing.status}).`,
            }),
          ],
        };
      }
      return {
        ...state,
        connections: [
          ...state.connections,
          {
            id: nextId("conn"),
            fromKey: "main",
            toKey: action.toKey,
            status: "REQUESTED",
            initiatedBy: "main",
            requestedAt: new Date().toISOString(),
            respondedAt: null,
            method: action.method || "search",
            note: "Connection request only. This grants no project access.",
          },
        ],
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "main",
            action: `Sent connection request to ${dir.businessName}.`,
          }),
        ],
      };
    };

    case "RESPOND_CONNECTION": {
      const conn = state.connections.find((c) => c.id === action.connectionId);
      if (!conn) return state;
      return {
        ...state,
        connections: state.connections.map((c) =>
          c.id === action.connectionId
            ? {
                ...c,
                status: action.decision === "accept" ? "CONNECTED" : "REJECTED",
                respondedAt: new Date().toISOString(),
              }
            : c,
        ),
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action:
              action.decision === "accept"
                ? "Accepted a connection request. This is NOT acceptance of any quotation or work order."
                : "Declined a connection request.",
          }),
        ],
      };
    }

    case "CANCEL_CONNECTION":
      return {
        ...state,
        connections: state.connections.map((c) =>
          c.id === action.connectionId ? { ...c, status: "CANCELLED", respondedAt: new Date().toISOString() } : c,
        ),
        activity: [
          ...state.activity,
          state.log({ actorPersonaId: "main", action: "Cancelled a pending connection request." }),
        ],
      };

    case "SAVE_CONTACT":
      return {
        ...state,
        savedContacts: [
          ...state.savedContacts,
          {
            id: nextId("contact"),
            ownerKey: "main",
            contactName: action.contactName,
            phone: action.phone,
            email: action.email,
            note: action.note,
            visibility: "PRIVATE_TO_OWNER",
            linkedContractorKey: null,
            invitationStatus: "NOT_INVITED",
          },
        ],
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "main",
            action: `Saved private contact "${action.contactName}". No account created, no public listing.`,
          }),
        ],
      };

    case "INVITE_SAVED_CONTACT":
      return {
        ...state,
        savedContacts: state.savedContacts.map((c) =>
          c.id === action.contactId
            ? { ...c, invitationStatus: "INVITATION_PENDING", invitationNote: action.note }
            : c,
        ),
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "main",
            action:
              "Marked a saved contact as invited (in-app only). Ownership must be verified by the platform before an account is linked — a matching phone or email is not proof.",
          }),
        ],
      };

    // -- work order --------------------------------------------------------
    case "TRANSITION": {
      const gate = canPerform(action.personaId, state.workOrder, action.toStatus);
      if (!gate.allowed) {
        return {
          ...state,
          activity: [
            ...state.activity,
            state.log({
              actorPersonaId: action.personaId,
              action: `REJECTED transition ${state.workOrder.status} -> ${action.toStatus}. ${gate.reason}`,
            }),
          ],
        };
      }
      const wo = { ...state.workOrder };
      if (action.toStatus === "QUOTATION_RECEIVED") {
        wo.quote = { ...state.subQuoteDraft, receivedAt: new Date().toISOString(), isCurrent: true };
      }
      if (action.toStatus === "AWAITING_CONFIRMATION") {
        wo.agreed = {
          price: state.workOrder.quote?.total ?? 0,
          scopeIds: state.workOrder.sharedScope.map((s) => s.scopeId),
          schedule: state.workOrder.requiredDates,
          confirmedByMainAt: new Date().toISOString(),
        };
      }
      if (action.toStatus === "SCHEDULED") {
        wo.agreed = wo.agreed
          ? { ...wo.agreed, confirmedByReceivingAt: new Date().toISOString() }
          : null;
      }
      if (action.toStatus === "DECLINED") wo.declinedReason = action.note ?? "No reason given (preview).";
      if (action.toStatus === "CANCELLED") wo.cancelledReason = action.note ?? "No reason given (preview).";
      if (action.toStatus === "CORRECTION_REQUESTED") {
        wo.completionSubmission = wo.completionSubmission
          ? { ...wo.completionSubmission, correctionsRequested: (wo.completionSubmission.correctionsRequested || 0) + 1 }
          : null;
        wo.correctionRequests = [
          ...state.workOrder.correctionRequests,
          {
            id: nextId("corr"),
            requestedBy: action.personaId,
            note: action.note,
            at: new Date().toISOString(),
            resolved: false,
          },
        ];
      }
      return setWorkOrderStatus(
        { ...state, workOrder: wo },
        action.toStatus,
        action.personaId,
        action.note
          ? `${TRANSITION_LABELS[action.toStatus] ?? action.toStatus}: ${action.note}`
          : `Moved work order to ${STATUS_META[action.toStatus]?.label ?? action.toStatus}.`,
      );
    }

    case "EDIT_SUBQUOTE":
      return { ...state, subQuoteDraft: { ...state.subQuoteDraft, ...action.patch } };

    case "ASSIGN_EMPLOYEE": {
      const already = state.workOrder.assignments.some((a) => a.employeePersonaId === action.employeePersonaId);
      if (already) {
        return {
          ...state,
          activity: [
            ...state.activity,
            state.log({
              actorPersonaId: action.personaId,
              action: "Duplicate assignment blocked — this employee is already on the work order.",
            }),
          ],
        };
      }
      return {
        ...state,
        workOrder: {
          ...state.workOrder,
          assignments: [
            ...state.workOrder.assignments,
            {
              id: nextId("asg"),
              employeePersonaId: action.employeePersonaId,
              assignedBy: action.personaId,
              assignedOn: new Date().toISOString(),
              wageMode: "daily",
              agreedWage: 850,
              status: "ASSIGNED",
              note: "Assigned by the receiving contractor to their own team only.",
            },
          ],
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: "Assigned their own employee to the outsourced work order.",
          }),
        ],
      };
    }

    case "REMOVE_ASSIGNMENT":
      return {
        ...state,
        workOrder: {
          ...state.workOrder,
          assignments: state.workOrder.assignments.filter((a) => a.id !== action.assignmentId),
        },
      };

    case "ADD_PROGRESS_UPDATE":
      return {
        ...state,
        workOrder: {
          ...state.workOrder,
          progressUpdates: [
            ...state.workOrder.progressUpdates,
            {
              id: nextId("prog"),
              byPersonaId: action.personaId,
              note: action.note,
              percentComplete: action.percentComplete,
              at: new Date().toISOString(),
              evidence: action.evidence ?? [],
            },
          ],
        },
        activity: [
          ...state.activity,
          state.log({ actorPersonaId: action.personaId, action: "Posted a progress update with evidence." }),
        ],
      };

    case "SUBMIT_COMPLETION": {
      const canSubmit = ["IN_PROGRESS", "CORRECTION_REQUESTED", "COMPLETED"].includes(state.workOrder.status);
      const nextState = {
        ...state,
        workOrder: {
          ...state.workOrder,
          completionSubmission: {
            id: nextId("comp"),
            submittedBy: action.personaId,
            submittedAt: new Date().toISOString(),
            evidence: action.evidence ?? [],
            note: action.note,
            correctionsRequested: state.workOrder.completionSubmission?.correctionsRequested ?? 0,
          },
          correctionRequests: state.workOrder.correctionRequests.map((c) =>
            state.workOrder.status === "CORRECTION_REQUESTED" ? { ...c, resolved: true } : c,
          ),
        },
        activity: [
          ...state.activity,
          state.log({ actorPersonaId: action.personaId, action: "Submitted completion evidence for review." }),
        ],
      };
      if (!canSubmit) {
        return {
          ...nextState,
          activity: [
            ...nextState.activity,
            state.log({
              actorPersonaId: action.personaId,
              action: `REJECTED completion submission. Work order is ${STATUS_META[state.workOrder.status]?.label ?? state.workOrder.status}.`,
            }),
          ],
        };
      }
      return setWorkOrderStatus(
        nextState,
        "SUBMITTED_FOR_REVIEW",
        action.personaId,
        "Completion evidence submitted for main contractor review.",
      );
    }

    case "RESOLVE_CORRECTION":
      return {
        ...state,
        workOrder: {
          ...state.workOrder,
          correctionRequests: state.workOrder.correctionRequests.map((c) =>
            c.id === action.correctionId ? { ...c, resolved: true } : c,
          ),
        },
      };

    case "REQUEST_ADDITIONAL_WORK":
      return {
        ...state,
        workOrder: {
          ...state.workOrder,
          additionalWorkRequests: [
            ...state.workOrder.additionalWorkRequests,
            {
              id: nextId("addw"),
              requestedBy: action.personaId,
              description: action.description,
              estimatedAmount: action.estimatedAmount,
              status: "PENDING_APPROVAL",
              note: "Explicit approval required. The agreed work order is not modified until then.",
            },
          ],
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: "Raised an additional work request (pending explicit approval).",
          }),
        ],
      };

    case "RESPOND_ADDITIONAL_WORK":
      return {
        ...state,
        workOrder: {
          ...state.workOrder,
          additionalWorkRequests: state.workOrder.additionalWorkRequests.map((r) =>
            r.id === action.requestId
              ? { ...r, status: action.approve ? "APPROVED" : "REJECTED" }
              : r,
          ),
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.personaId,
            action: `${action.approve ? "Approved" : "Rejected"} an additional work request.`,
          }),
        ],
      };

    // -- messaging ---------------------------------------------------------
    case "SEND_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: nextId("msg"),
            workOrderId: state.workOrder.id,
            fromKey: action.fromKey,
            toKey: action.toKey,
            body: action.body,
            sentAt: new Date().toISOString(),
            delivery: "IN_APP_ONLY",
          },
        ],
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: action.fromKey,
            action: "Sent an in-app message. No email, SMS or WhatsApp was sent.",
          }),
        ],
      };

    // -- financials --------------------------------------------------------
    case "RECORD_CUSTOMER_PAYMENT": {
      const c = state.financials.customerToMain;
      const payments = [
        ...c.payments,
        {
          id: nextId("pay"),
          date: new Date().toISOString().slice(0, 10),
          amount: action.amount,
          mode: action.mode,
          reference: "PREVIEW-" + Math.abs(action.amount),
          note: "Simulated receipt. No gateway involved.",
        },
      ];
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(c.total - paid, 0);
      return {
        ...state,
        financials: {
          ...state.financials,
          customerToMain: {
            ...c,
            payments,
            status: remaining === 0 ? "PAID" : "PART_PAID",
          },
          // Deliberately untouched: mainToReceiving. A customer payment does
          // not settle the subcontractor balance.
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "main",
            action: `Recorded a simulated customer payment of ₹${action.amount.toLocaleString("en-IN")}. Subcontractor balance unchanged.`,
          }),
        ],
      };
    };

    case "ISSUE_SUBCONTRACT_INVOICE": {
      const price = state.workOrder.agreed?.price ?? state.workOrder.quote?.total ?? 0;
      return {
        ...state,
        financials: {
          ...state.financials,
          mainToReceiving: {
            ...state.financials.mainToReceiving,
            invoiceNumber: "BP/SUBINV/2025-26/0007",
            issuedOn: new Date().toISOString().slice(0, 10),
            status: "ISSUED",
            lines: state.workOrder.sharedScope.map((s) => ({
              descriptionSnapshot: s.name,
              amount: price,
            })),
            total: price,
          },
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "main",
            action: "Issued the subcontractor invoice at the agreed price, independent of the customer invoice.",
          }),
        ],
      };
    };

    case "PAY_SUBCONTRACTOR": {
      const inv = state.financials.mainToReceiving;
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(inv.total - paid, 0);
      const amount = Math.min(action.amount, remaining);
      return {
        ...state,
        financials: {
          ...state.financials,
          mainToReceiving: {
            ...inv,
            payments: [
              ...inv.payments,
              {
                id: nextId("pay"),
                date: new Date().toISOString().slice(0, 10),
                amount,
                mode: action.mode,
                reference: "PREVIEW-" + amount,
                note: "Simulated record. No transfer initiated by the preview.",
              },
            ],
            status: remaining - amount === 0 ? "PAID" : "PART_PAID",
          },
          receivingToEmployee: {
            ...state.financials.receivingToEmployee,
            lines: [
              {
                descriptionSnapshot: `Wage accrual — ${action.employeeName}`,
                amount: action.employeeName ? 4250 : 0,
              },
            ],
            total: action.employeeName ? 4250 : 0,
          },
        },
        activity: [
          ...state.activity,
          state.log({
            actorPersonaId: "main",
            action: `Recorded a simulated payment of ₹${amount.toLocaleString("en-IN")} to the receiving contractor.`,
          }),
        ],
      };
    };

    default:
      return state;
  }
}

const PreviewContext = createContext(null);

export function PreviewProvider({ children }) {
  const [state, dispatch] = useReducer(previewReducer, undefined, initialState);

  const value = useMemo(() => {
    const activeProfile =
      state.activePersonaId === "employee"
        ? null
        : state.profiles[state.activePersonaId] ?? null;

    const branding =
      state.activePersonaId === "employee"
        ? resolveBranding(state.employee.primaryTradeIdentifier, state.catalogue)
        : resolveBranding(activeProfile?.coreServiceIdentifier ?? null, state.catalogue);

    return { state, dispatch, activeProfile, branding };
  }, [state]);

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used inside PreviewProvider");
  return ctx;
}