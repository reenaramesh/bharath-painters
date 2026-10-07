// Each overlay owns one lock; only the final cleanup restores page scrolling.
const locks = new WeakMap();

export function lockBodyScroll(body = document.body) {
  let state = locks.get(body);
  if (!state) {
    state = { count: 0, overflow: body.style.overflow };
    locks.set(body, state);
  }
  state.count++;
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count--;
    if (state.count === 0) {
      body.style.overflow = state.overflow;
      locks.delete(body);
    }
  };
}
