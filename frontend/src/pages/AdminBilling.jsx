import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { CreditCard } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import PackageAssignments from "../components/PackageAssignments";
import PackageRequests from "../components/PackageRequests";
import "./admin-portal.css";

export default function AdminBilling(){
 const {user}=useAuth(); const [plans,setPlans]=useState([]); const [error,setError]=useState("");
 const load=useCallback(async()=>{try{const{data}=await api.get("/billing/plans/");setPlans(data);setError("")}catch{setError("Billing information could not be loaded.")}},[]);
 useEffect(()=>{if(user?.role==="ADMIN")load()},[load,user]);
 if(user?.role!=="ADMIN")return <Navigate to="/dashboard" replace/>;
 return <div className="space-y-6"><header><p className="text-sm font-semibold text-amber-600">Subscription operations</p><div className="mt-1 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white"><CreditCard className="h-5 w-5"/></span><div><h1 className="text-3xl font-bold">Billing</h1></div></div></header>{error&&<p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}<PackageAssignments plans={plans}/><PackageRequests/></div>;
}
