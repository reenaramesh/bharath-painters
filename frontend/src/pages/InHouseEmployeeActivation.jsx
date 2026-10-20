import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import api from "../api/client";

export default function InHouseEmployeeActivation() {
  const { token } = useParams();
  const [employee, setEmployee] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/jobs/my-team/employee-activation/${token}/`).then(({ data }) => {
      if (active) setEmployee(data);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.detail || "This activation link is invalid or expired.");
    });
    return () => { active = false; };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const { data } = await api.post(`/jobs/my-team/employee-activation/${token}/`, { password, confirm_password: confirmPassword });
      setSuccess(data.detail || "Password set successfully. You can now sign in.");
    } catch (requestError) {
      const details = requestError.response?.data;
      setError(details?.detail || Object.values(details || {}).flat().join(" ") || "Password could not be set.");
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-4 sm:p-8">
    <section className="w-full max-w-lg rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700"><KeyRound aria-hidden="true" /></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-blue-700">Bharath Apps · Permanent workforce</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-950 bp-ui-page-title">Set your password</h1>
      {employee && <p className="mt-3 text-sm leading-6 text-slate-600">Welcome, {employee.name}. Create a password for your employee account ending in {employee.mobile?.slice(-4)}.</p>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}<Link to="/login" className="ml-2 font-bold underline">Sign in</Link></div> : employee && <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">New password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="bp-ui-control mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="block text-sm font-semibold">Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="bp-ui-control mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50 bp-ui-action">{busy ? "Saving password..." : "Set password"}</button>
      </form>}
    </section>
  </main>;
}
