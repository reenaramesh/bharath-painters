import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useAuth from '../context/useAuth';
import api, { API_BASE_URL } from '../api/client';
import { ActivityCollector } from './collector';
import routes from './taxonomy.json';
import actions from './actions.json';
import { installFeatureTracking } from './features.js';

export default function ActivityTracking() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const engine = useRef(null), path = useRef(pathname);
  path.current = pathname;
  useEffect(() => {
    if (!user?.id || !['CONTRACTOR', 'PAINTER', 'CUSTOMER'].includes(user.role)) return undefined;
    let cleanup = () => {};
    const setup = setTimeout(() => {
      try {
        let saved;
        try { saved = JSON.parse(sessionStorage.getItem('bp-analytics-session')); } catch { /* optional storage */ }
        const fresh = !saved || saved.user !== user.id || Date.now() - saved.last > 1800000;
        const device = fresh ? (innerWidth < 600 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop') : saved.device;
        const remember = () => {
          try { sessionStorage.setItem('bp-analytics-session', JSON.stringify({ user: user.id, id: collector.sessionId, last: collector.lastActivity, sequence:collector.sequence, device })); } catch { /* optional storage */ }
        };
        const send = async (batch, keepalive) => {
          if (JSON.parse(localStorage.getItem('bharath_user') || 'null')?.id !== user.id) throw Object.assign(Error('Account changed'), { permanent: true });
          if (!keepalive) {
            try { await api.post('/application-analytics/events/', batch, { timeout: 5000, analyticsUserId: user.id }); }
            catch (error) {
              error.permanent = error.permanent || (error.response?.status >= 400 && error.response?.status < 500 && ![401,408,429].includes(error.response.status));
              throw error;
            }
            return;
          }
          const response = await fetch(`${API_BASE_URL}/application-analytics/events/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('bharath_access')}` },
            body: JSON.stringify(batch), keepalive: true, signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw Object.assign(Error('Analytics unavailable'), { permanent: response.status >= 400 && response.status < 500 && ![408,429].includes(response.status) });
        };
        let login = false;
        try {
          const marker=JSON.parse(sessionStorage.getItem('bp-analytics-login'));
          login=marker?.user === user.id && Date.now()-marker.at < 300000;
          sessionStorage.removeItem('bp-analytics-login');
        } catch { /* optional storage */ }
        const collector = new ActivityCollector({ send, routes, actions, role:user.role, login, sequence:fresh ? 0 : saved.sequence || 0, sessionId: fresh ? crypto.randomUUID() : saved.id, newSession: fresh, device, onSession: remember });
        engine.current = collector;
        const removeFeatures=installFeatureTracking(collector);
        collector.visible = document.visibilityState === 'visible';
        collector.visit(path.current); remember();
        const active = () => collector.activity();
        const visibility = () => { collector.visibility(document.visibilityState === 'visible'); if (!collector.visible) void collector.flush(); };
        const leave = () => { collector.leave(); collector.visibility(false); remember(); void collector.flush(true); };
        const logout = () => { collector.end('logout'); collector.visibility(false); remember(); void collector.flush(true); };
        const resume = event => { if (event.persisted) { collector.path=undefined; collector.visit(path.current); collector.visibility(true); } };
        let frame;
        const scroll = event => {
          if (frame) return;
          const target = event.target === document ? document.scrollingElement : event.target;
          frame = requestAnimationFrame(() => {
            frame = null;
            if (!(target instanceof Element)) return;
            if (target !== document.scrollingElement && !target.closest('main')) return;
            const extent = target.scrollHeight - target.clientHeight;
            if (extent > 0) collector.scroll(Math.min(1, (target.scrollTop + 2) / extent));
          });
        };
        for (const name of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) window.addEventListener(name, active, { passive: true });
        document.addEventListener('scroll', scroll, { passive: true, capture: true });
        document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', leave);
        window.addEventListener('bp-analytics-before-logout', logout);
        window.addEventListener('pageshow', resume);
        let nextSend = 0;
        const timer = setInterval(() => {
          collector.tick(); remember();
          if (Date.now() >= nextSend) { void collector.flush(); nextSend = Date.now() + 15000 * (2 ** collector.failures); }
        }, 15000);
        cleanup = () => {
          clearInterval(timer); cancelAnimationFrame(frame);
          for (const name of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) window.removeEventListener(name, active);
          document.removeEventListener('scroll', scroll, true); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave);
          window.removeEventListener('bp-analytics-before-logout', logout); window.removeEventListener('pageshow', resume);
          removeFeatures();
          collector.visibility(false); void collector.flush(); engine.current = null;
        };
      } catch { /* Analytics cannot interrupt business screens. */ }
    }, 0);
    return () => { clearTimeout(setup); cleanup(); };
  }, [user?.id, user?.role]);
  useEffect(() => { engine.current?.visit(pathname); }, [pathname]);
  return null;
}
