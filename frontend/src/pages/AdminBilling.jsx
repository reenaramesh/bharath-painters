import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import { PageHeader } from "../components/ui";
import useAuth from "../context/useAuth";
import PackageAssignments from "../components/PackageAssignments";
import PackageRequests from "../components/PackageRequests";
import "./admin-portal.css";

export default function AdminBilling(){
 const {user}=useAuth(); const [plans,setPlans]=useState([]); const [error,setError]=useState("");
 const load=useCallback(async()=>{try{const{data}=await api.get("/billing/plans/");setPlans(data);setError("")}catch{setError("Billing information could not be loaded.")}},[]);
 useEffect(()=>{if(user?.role==="ADMIN")load()},[load,user]);
 if(user?.role!=="ADMIN")return <Navigate to="/dashboard" replace/>;
 return <div className="admin-ui-page space-y-6"><PageHeader eyebrow="Subscription operations" title="Billing" description="Review package assignments and pending subscription requests." />{error&&<p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}<PackageAssignments plans={plans}/><PackageRequests/></div>;
}
