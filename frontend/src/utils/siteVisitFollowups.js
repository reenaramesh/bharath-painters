// Present customer-created site visits without creating duplicate persisted visits.
export function siteVisitFollowups(tasks, { status = "", date = "" } = {}) {
  return tasks.filter((task) => task.follow_up_type === "SITE_VISIT" && task.next_follow_up).map((task) => {
    const when = new Date(task.next_follow_up);
    const scheduled_date = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
    return { id: `followup-${task.id}`, followup_id: task.id, customer_name: task.customer_name, customer_mobile: task.customer_mobile, reference_no: "Site visit", scheduled_date, scheduled_time: `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`, notes: task.comment, status: task.is_completed ? "COMPLETED" : "SCHEDULED" };
  }).filter((visit) => (!status || visit.status === status) && (!date || visit.scheduled_date === date));
}
