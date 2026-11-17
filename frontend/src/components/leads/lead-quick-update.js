import { inputDateTime } from "./lead-format.js";

export const CONTACT_METHODS = [["CALL", "Phone call"], ["WHATSAPP", "WhatsApp"], ["EMAIL", "Email"], ["MEETING", "Meeting"], ["SITE_VISIT", "Site visit"], ["NOTE", "Internal note"], ["OFFICE_MEETING", "Office meeting"]];
export const NEXT_CHOICES = [["two_hours", "In 2 hours"], ["tomorrow", "Tomorrow"], ["custom", "Choose date"], ["none", "No follow-up needed"]];

export function pendingFollowups(item) {
  return (item.follow_ups || []).filter(task => !task.is_completed && task.next_follow_up)
    .sort((left, right) => new Date(left.next_follow_up) - new Date(right.next_follow_up));
}

export function initialQuickUpdate(item) {
  const pending = pendingFollowups(item);
  const current = pending.find(task => Number(task.id) === Number(item.next_action?.task_id)) || pending[0];
  return { follow_up_type: "CALL", outcome: "", comment: "", next_action: "Follow up with customer", next_choice: "", next_follow_up: "", completed_task: current?.id || "", edited: false, submission: null };
}

export function quickUpdateDirty(draft) { return Boolean(draft?.edited); }

export function shortcutDate(choice, now = new Date()) {
  if (choice === "two_hours") return inputDateTime(new Date(now.getTime() + 2 * 60 * 60 * 1000));
  if (choice === "tomorrow") {
    const today = inputDateTime(now).slice(0, 10);
    return inputDateTime(new Date(new Date(`${today}T00:00:00+05:30`).getTime() + 34 * 60 * 60 * 1000));
  }
  return "";
}

export function submissionKey() {
  return globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}
