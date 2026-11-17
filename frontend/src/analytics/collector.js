export function resolveScreen(path, routes) {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  return routes.filter(row => {
    const parts = row.screen.split('/'), actual = clean.split('/');
    return parts.length === actual.length && parts.every((part, i) => part.startsWith(':') || part === actual[i]);
  }).sort((a,b) => a.screen.split(':').length - b.screen.split(':').length)[0];
}

export class ActivityCollector {
  constructor({ send, routes, sessionId, newSession = true, login = false, sequence = 0, actions = [], role, device = 'desktop', now = Date.now, uuid = () => crypto.randomUUID(), onSession = () => {} }) {
    Object.assign(this, { send, routes, sessionId, device, now, uuid, onSession, sequence, login, role });
    this.actions = new Map(actions.map(action => [action.id, action]));
    this.workflows = new Map(); this.seenActions = new Set();
    this.queue = []; this.visible = true; this.lastTick = now(); this.lastActivity = now();
    this.started = !newSession; this.milestones = new Set(); this.failures = 0; this.duration = 0;
  }
  push(kind, extra = {}) {
    if (!this.current) return;
    this.queue.push({ sessionId: this.sessionId, event: { id: this.uuid(), kind, ...this.current, visit_id: this.visitId, sequence: ++this.sequence, occurred_at: new Date(this.now()).toISOString(), ...extra } });
    if (this.queue.length > 100) this.queue.splice(0, this.queue.length - 100);
  }
  start() {
    if (!this.started && this.current) {
      this.push('session_started', {reason:this.login ? 'login' : 'resumed'});
      if (this.login) this.push('login');
      this.login = false; this.started = true;
    }
  }
  activity(showVisit = true) {
    this.tick();
    if (this.ended) {
      this.sessionId = this.uuid(); this.sequence = 0; this.started = false; this.ended = false;
      this.visitId = this.uuid(); this.visitClosed = false; this.milestones.clear(); this.seenActions.clear();
      this.start();
      if (showVisit && this.current) { this.push('module_opened'); this.push('screen_viewed'); }
      this.onSession(this.sessionId);
    }
    this.lastActivity = this.now();
  }
  visit(path) {
    if (this.path === path) return;
    this.tick(true);
    const previous = this.current;
    const next = resolveScreen(path, this.routes);
    if (!this.ended) this.closeVisit(previous?.module !== next?.module ? 'module_exit' : 'navigation');
    this.path = path; this.current = next; this.visitId = this.uuid(); this.visitClosed = false;
    this.milestones.clear(); this.seenActions.clear(); this.activity(false);
    this.start();
    if (!this.current) return;
    if (previous) this.push('navigation', {previous_screen:previous.screen});
    if (previous?.module !== this.current.module || !previous) this.push('module_opened');
    this.push('screen_viewed');
    if (/^\/quotations\/(?:new(?:-manual|-measured)?|[^/]+\/edit)$/.test(path)) this.beginWorkflow('draft_saved');
  }
  tick(force = false) {
    const now = this.now();
    const duration = this.visible && !this.ended && !this.visitClosed ? Math.max(0, Math.min(now, this.lastActivity + 30000) - this.lastTick) : 0;
    this.lastTick = now;
    if (this.current) this.duration += duration;
    if (force || this.duration >= 10000) {
      while (this.duration >= 1) { const chunk = Math.min(this.duration, 15000); this.push('engagement', { duration_ms: Math.floor(chunk) }); this.duration -= chunk; }
    }
    if (!this.ended && now - this.lastActivity >= 1800000) this.closeSession('idle_timeout');
  }
  closeVisit(reason) {
    if (!this.current || this.visitClosed) return;
    for (const [action, workflow_id] of this.workflows) this.push('workflow_abandoned', {action,workflow_id,reason});
    this.workflows.clear(); this.push('screen_left', {reason}); this.visitClosed = true;
  }
  closeSession(reason) {
    if (this.ended) return;
    this.closeVisit(reason); this.push('session_ended', {reason}); this.ended = true;
  }
  leave() { this.tick(true); this.closeVisit('page_exit'); }
  end(reason = 'logout') { this.tick(true); this.closeSession(reason); }
  context() { return {sessionId:this.sessionId,visitId:this.visitId,foreground:this.visible && !this.ended && !this.visitClosed}; }
  accepts(action, context) {
    const definition=this.actions.get(action);
    const roleAllowed=!this.role || definition?.roles?.includes(this.role) || this.role==='PAINTER' && definition?.roles?.includes('EMPLOYEE');
    return roleAllowed && (this.visible || context?.foreground===true) && !this.ended && !this.visitClosed && this.current && definition?.modules.includes(this.current.module)
      && (!context || context.foreground!==false && context.sessionId === this.sessionId && context.visitId === this.visitId);
  }
  beginWorkflow(action) {
    if (!this.accepts(action) || this.workflows.has(action)) return;
    const workflow_id = this.uuid(); this.workflows.set(action,workflow_id);
    this.push('workflow_started', {action,workflow_id});
  }
  feature(action, {once = false, context} = {}) {
    if (!this.accepts(action,context) || once && this.seenActions.has(action)) return;
    if (!context) this.activity();
    this.seenActions.add(action); this.push('feature_action', {action});
    const workflow_id = this.workflows.get(action);
    if (workflow_id) { this.push('workflow_completed', {action,workflow_id}); this.workflows.delete(action); }
  }
  error(action, code, context) {
    if (!this.accepts(action,context) || !['validation','permission','not_found','conflict','rate_limited','network','server','unexpected'].includes(code)) return;
    this.push('error', {action,error_code:code});
  }
  visibility(visible) {
    this.tick(true); this.visible = visible;
    if (visible) this.activity();
  }
  scroll(fraction) {
    if (!this.visible || !this.current) return;
    this.activity();
    for (const milestone of [25,50,75,100]) {
      if (fraction * 100 >= milestone && !this.milestones.has(milestone)) {
        this.milestones.add(milestone); this.push('scroll', { milestone });
      }
    }
  }
  async flush(keepalive = false) {
    this.tick(true);
    if ((this.pending && !keepalive) || !this.queue.length) return;
    this.pending = true;
    const sessionId = this.queue[0].sessionId;
    const batch = this.queue.filter(row => row.sessionId === sessionId).slice(0,50);
    const ids = new Set(batch.map(row => row.event.id));
    try {
      await this.send({ session_id: sessionId, device: this.device, events: batch.map(row => row.event) }, keepalive);
      this.queue = this.queue.filter(row => !ids.has(row.event.id)); this.failures = 0;
    } catch (error) {
      this.failures++;
      if (this.failures >= 3 || error.permanent) { this.queue = this.queue.filter(row => !ids.has(row.event.id)); this.failures = 0; }
    } finally { this.pending = false; }
  }
}
