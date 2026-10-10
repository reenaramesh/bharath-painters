export function contactRole(viewerRole, conversation) {
  if (viewerRole === "CUSTOMER" || viewerRole === "PAINTER") return "Contractor";
  return conversation.participant_type === "PAINTER" || conversation.painter_id ? "Painter" : "Customer";
}

export function messageActions(message) {
  if (message.deleted_at) return [];
  return message.can_edit ? ["reply", "forward", "edit", "delete"] : ["reply", "forward"];
}

export function showMessageTime(message, nextMessage) {
  if (!nextMessage || message.is_mine !== nextMessage.is_mine) return true;
  const minute = Math.floor(new Date(message.created_at).getTime() / 60000);
  const nextMinute = Math.floor(new Date(nextMessage.created_at).getTime() / 60000);
  return minute !== nextMinute;
}
