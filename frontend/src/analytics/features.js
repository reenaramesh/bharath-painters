// Only static action IDs reach the collector; callers never pass form or error text.
let engine;
export function installFeatureTracking(collector) {
  engine = collector;
  return () => { if (engine === collector) engine = undefined; };
}
export function captureFeatureContext() { return engine?.context(); }
export function beginFeature(action) {
  try { engine?.beginWorkflow(action); } catch { /* optional telemetry */ }
}
export function trackFeature(action, options) {
  try { engine?.feature(action,options); } catch { /* optional telemetry */ }
}
export function trackFeatureError(action, code, context) {
  try { engine?.error(action,code,context); } catch { /* optional telemetry */ }
}
