export function shouldSubmitChat(event) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

export function resizeChatComposer(input, viewportHeight) {
  if (!input) return;
  const maxHeight = Math.max(44, Math.min(160, viewportHeight * 0.3));
  input.style.height = "44px";
  const contentHeight = input.value ? input.scrollHeight : 44;
  input.style.height = `${Math.max(44, Math.min(contentHeight, maxHeight))}px`;
  input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  if (input.selectionEnd === input.value.length) input.scrollTop = input.scrollHeight;
}
