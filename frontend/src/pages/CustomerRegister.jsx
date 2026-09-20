import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import api from "../api/client";

export default function CustomerRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/accounts/register/customer/", form);
      navigate("/login", { replace: true, state: { customerRegistered: true } });
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Customer account could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6"><div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl"><span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400"><MessageCircle /></span><h1 className="mt-5 text-3xl font-bold">Customer account</h1><p className="mt-2 text-sm text-slate-500">Create your own login to message your painting contractor.</p><form onSubmit={submit} className="mt-6 space-y-4"><Field label="Name" name="name" value={form.name} onChange={update} /><Field label="Registered mobile number" name="mobile" value={form.mobile} onChange={update} /><Field label="Email (optional)" name="email" type="email" required={false} value={form.email} onChange={update} /><Field label="Create password" name="password" type="password" minLength="8" value={form.password} onChange={update} />{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={saving} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Creating account..." : "Create customer account"}</button></form><p className="mt-5 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-semibold text-slate-950">Sign in</Link></p></div></main>;
}

function Field({ label, required = true, ...props }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<input required={required} {...props} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-slate-900" /></label>;
}
