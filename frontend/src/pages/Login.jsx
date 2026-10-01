import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Palette, LifeBuoy, X } from "lucide-react";
import useAuth from "../context/useAuth";
import api from "../api/client";

export default function Login() {
  const { user, login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportForm, setSupportForm] = useState({ mobile: "", subject: "", description: "", attachment: null });
  const [supportMessage, setSupportMessage] = useState("");
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || user) return undefined;
    let active = true;
    function renderGoogleButton() {
      if (!active || !window.google?.accounts?.id || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setError("");
          setLoading(true);
          try {
            const signedInUser = await googleLogin(credential);
            navigate(location.state?.from?.pathname || (signedInUser.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"), { replace: true });
          } catch (requestError) {
            setError(requestError.response?.data?.error || "Google Sign-In could not be completed.");
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(400, googleButtonRef.current.clientWidth || 400),
      });
    }
    const existing = document.querySelector('script[data-bharath-google-identity="true"]');
    if (existing) {
      if (window.google?.accounts?.id) renderGoogleButton();
      else existing.addEventListener("load", renderGoogleButton, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.bharathGoogleIdentity = "true";
      script.addEventListener("load", renderGoogleButton, { once: true });
      document.head.appendChild(script);
    }
    return () => { active = false; };
  }, [googleClientId, googleLogin, location.state, navigate, user]);

  if (user) return <Navigate to={user.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const signedInUser = await login(identifier.trim(), password);
      navigate(location.state?.from?.pathname || (signedInUser.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"), { replace: true });
    } catch (requestError) {
      const status = requestError.response?.status;
      setError(requestError.response?.data?.error || requestError.response?.data?.detail || (!requestError.response || status === 502 || status === 503 ? "The server is offline. Start the Django backend and try again." : "Unable to sign in. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function submitSupport(event) {
    event.preventDefault(); setLoading(true); setSupportMessage("");
    try {
      const body = new FormData(); Object.entries(supportForm).forEach(([key, value]) => { if (value) body.append(key, value); });
      const { data } = await api.post("/quotations/support-tickets/public/", body, { headers: { "Content-Type": "multipart/form-data" } });
      setSupportMessage(`Ticket ${data.ticket_number} was submitted. Support will follow up.`);
      setSupportForm({ mobile: "", subject: "", description: "", attachment: null });
    } catch (e) {
      const data = e.response?.data;
      const detail = data?.detail || (data && Object.entries(data).map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(" ") : value}`).join(" "));
      setSupportMessage(detail || (e.response ? `Ticket submission failed (HTTP ${e.response.status}). Please try again.` : `Cannot reach the support server (${e.message}). Check that the backend is running and try again.`));
    }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 grid lg:grid-cols-2">
      <section className="hidden lg:flex p-14 flex-col justify-between text-white bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400 text-slate-950"><Palette /></span>
          <span className="text-xl font-bold">Bharath Painters</span>
        </div>
        <div className="max-w-xl">
          <p className="text-amber-400 font-semibold tracking-wide uppercase text-sm">Business workspace</p>
          <h1 className="text-5xl font-bold leading-tight mt-4">Manage every painting project from lead to finish.</h1>
          <p className="text-slate-300 text-lg mt-6">Create accurate quotations, organize customers, hire verified Paint Applicators and keep work moving.</p>
        </div>
        <p className="text-sm text-slate-500">Bharath Painters Contractor Portal</p>
      </section>

      <section className="bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Palette className="w-5 h-5" /></span>
            <span className="font-bold text-slate-900">Bharath Painters</span>
          </div>
          <h2 className="text-3xl font-bold text-slate-950">Welcome back</h2>
          <p className="text-slate-500 mt-2">Sign in with your mobile number or verified email.</p>
          {location.state?.registered && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Registration successful. Your verified profile, Bharath ID and QR badge are ready. Sign in to continue.</p>}
          {location.state?.customerRegistered && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Customer account created. Sign in to open your messages.</p>}
          {location.state?.passwordReset && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Password reset successful. Sign in with your new password.</p>}

          {googleClientId && <div className="mt-8">
            <div ref={googleButtonRef} className="flex min-h-11 w-full justify-center" />
            <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" /><span>or use mobile / email</span><span className="h-px flex-1 bg-slate-200" /></div>
          </div>}

          <form onSubmit={handleSubmit} className={`${googleClientId ? "" : "mt-8"} space-y-5`}>
            <label className="block text-sm font-semibold text-slate-700">
              Mobile number or verified email
              <input required type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Mobile number or email" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Password
              <span className="relative mt-2 block">
                <input required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-4 pr-12 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </label>
            <div className="text-right"><Link to="/forgot-password" className="text-sm font-semibold text-slate-700 hover:text-slate-950">Forgot password?</Link></div>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button disabled={loading} className="w-full rounded-xl bg-slate-950 px-5 py-3.5 font-semibold text-white flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-60">
              {loading ? "Signing in..." : "Sign in"}<ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">New to Bharath Painters? <Link to="/register" className="font-semibold text-slate-950">Create an account</Link></p>
          <p className="mt-3 text-center text-sm text-slate-500">Are you a customer? <Link to="/customer-register" className="font-semibold text-slate-950">Create customer login</Link></p>
          <button type="button" onClick={() => { setSupportOpen(true); setSupportMessage(""); }} className="mx-auto mt-6 flex items-center gap-2 text-sm font-semibold text-[#176b9b]"><LifeBuoy className="h-4 w-4" />Support Desk</button>
        </div>
      </section>
      {supportOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="support-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><header className="mb-5 flex items-center justify-between"><div><p className="text-sm font-semibold text-[#176b9b]">Bharath Painters</p><h2 id="support-title" className="text-2xl font-bold">Support Desk</h2></div><button type="button" onClick={() => setSupportOpen(false)} aria-label="Close support form" className="rounded-lg p-2 hover:bg-slate-100"><X /></button></header>{supportMessage && <p role="status" className="mb-4 rounded-xl bg-slate-50 p-3 text-sm">{supportMessage}</p>}<form onSubmit={submitSupport} className="space-y-4"><label className="block text-sm font-semibold">Registered mobile number<input required inputMode="tel" value={supportForm.mobile} onChange={e => setSupportForm({...supportForm,mobile:e.target.value})} className="mt-1.5 w-full rounded-xl border p-3" /></label><label className="block text-sm font-semibold">Subject<input required maxLength={180} value={supportForm.subject} onChange={e => setSupportForm({...supportForm,subject:e.target.value})} className="mt-1.5 w-full rounded-xl border p-3" /></label><label className="block text-sm font-semibold">How can we help?<textarea required maxLength={4000} rows={4} value={supportForm.description} onChange={e => setSupportForm({...supportForm,description:e.target.value})} className="mt-1.5 w-full rounded-xl border p-3" /></label><label className="block text-sm font-semibold">Attach an image or video (up to 10 MB)<input type="file" accept="image/*,video/*" onChange={e => setSupportForm({...supportForm,attachment:e.target.files?.[0] || null})} className="mt-1.5 block w-full text-sm" /></label><button disabled={loading} className="w-full rounded-xl bg-slate-950 p-3 font-semibold text-white disabled:opacity-60">{loading ? "Submitting..." : "Submit ticket"}</button></form></section></div>}
    </main>
  );
}
