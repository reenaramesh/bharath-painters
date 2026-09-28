import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  IndianRupee,
  ListTodo,
  MessageCircle,
  Paintbrush,
  QrCode,
  Ruler,
  Share2,
  UserRoundCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import useAuth from "../context/useAuth";

const shortcutsByRole = {
  CONTRACTOR: [
    { label: "Customers", icon: Users, to: "/customers" },
    { label: "Properties", icon: Building2, to: "/properties" },
    { label: "Quotations", icon: FileText, to: "/quotations" },
    { label: "Post Job", icon: BriefcaseBusiness, to: "/jobs?post=1" },
    { label: "Work", icon: CalendarClock, to: "/work-schedules" },
    { label: "Tasks", icon: ListTodo, to: "/tasks" },
    { label: "Messages", icon: MessageCircle, to: "/messages" },
    { label: "Area", icon: Ruler, to: "/properties?calculator=1" },
  ],
  PAINTER: [
    { label: "Jobs", icon: BriefcaseBusiness, to: "/jobs" },
    { label: "Assignments", icon: ClipboardList, to: "/painter-assignments" },
    { label: "Bookings", icon: CalendarClock, to: "/applicator-bookings" },
    { label: "Availability", icon: UserRoundCheck, to: "/applicator-availability" },
    { label: "Earnings", icon: IndianRupee, to: "/in-house-earnings" },
    { label: "Messages", icon: MessageCircle, to: "/messages" },
    { label: "Profile", icon: Paintbrush, to: "/applicator-profile" },
  ],
  CUSTOMER: [
    { label: "Quotations", icon: FileText, to: "/customer-quotations" },
    { label: "Properties", icon: Building2, to: "/customer-properties" },
    { label: "Payments", icon: Banknote, to: "/customer-invoices" },
    { label: "Schedule", icon: CalendarClock, to: "/work-schedules" },
    { label: "Messages", icon: MessageCircle, to: "/messages" },
    { label: "Requests", icon: ClipboardList, to: "/service-requests" },
    { label: "My Contractors", icon: Users, to: "/customer/connections" },
  ],
  ADMIN: [
    { label: "Contractors", icon: BriefcaseBusiness, to: "/contractors" },
    { label: "Painters", icon: Paintbrush, to: "/painters" },
    { label: "Connections", icon: UserRoundCheck, to: "/customer-connections" },
    { label: "Billing", icon: Banknote, to: "/billing" },
    { label: "Revenue", icon: IndianRupee, to: "/revenue" },
    { label: "Master Data", icon: Wrench, to: "/master-services" },
    { label: "Reports", icon: BarChart3, to: "/reports" },
  ],
};

export default function MobileDashboardShortcuts() {
  const { user } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [appMessage, setAppMessage] = useState("");
  const shortcuts = shortcutsByRole[user?.role] || [];
  const appUrl = window.location.origin;
  const shareText = `Join Bharath Painters as a contractor or paint applicator. Open this link on your phone and install the app: ${appUrl}`;

  async function shareApp() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Bharath Painters",
          text: "Join Bharath Painters as a contractor or paint applicator. Open this link on your phone and install the app.",
          url: appUrl,
        });
        return;
      }
      await navigator.clipboard?.writeText(shareText);
      setAppMessage("Application link copied. You can paste it in any app.");
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setAppMessage("The application link could not be shared. Please try WhatsApp.");
    }
  }

  if (!shortcuts.length) return null;
  return (
    <>
      <section className="md:hidden" aria-label="Quick access">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Quick access</h2>
          <span className="text-[11px] text-slate-400">Swipe for more</span>
        </div>
        <div className="overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max snap-x snap-mandatory gap-3">
            <button type="button" onClick={() => setScannerOpen(true)} className="w-[72px] shrink-0 snap-start text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm transition active:scale-95">
                <QrCode className="h-7 w-7" strokeWidth={1.8} />
              </span>
              <span className="mt-2 block min-h-8 text-[11px] font-semibold leading-4 text-slate-800">
                Scan QR
              </span>
            </button>
            {shortcuts.map(({ label, icon: Icon, to }) => (
              <Link key={`${label}-${to}`} to={to} className="w-[72px] shrink-0 snap-start text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-sm transition active:scale-95">
                  <Icon className="h-7 w-7" strokeWidth={1.8} />
                </span>
                <span className="mt-2 block min-h-8 text-[11px] font-medium leading-4 text-slate-700">
                  {label}
                </span>
              </Link>
            ))}
            <button type="button" onClick={shareApp} className="w-[72px] shrink-0 snap-start text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm transition active:scale-95">
                <Share2 className="h-7 w-7" strokeWidth={1.8} />
              </span>
              <span className="mt-2 block min-h-8 text-[11px] font-medium leading-4 text-slate-700">Share App</span>
            </button>
          </div>
        </div>
      </section>
      {scannerOpen && <QrScanner close={() => setScannerOpen(false)} />}
      {appMessage && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-bold">Bharath Painters App</h2><p className="mt-2 text-sm leading-6 text-slate-600">{appMessage}</p></div>
              <button type="button" onClick={() => setAppMessage("")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => setAppMessage("")} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Done</button>
          </div>
        </div>
      )}
    </>
  );
}

function QrScanner({ close }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const detectorRef = useRef(null);
  const lastScanRef = useRef(0);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const acceptResult = useCallback((value) => {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return;
    stopCamera();
    setResult(cleanValue);
    setError("");
  }, [stopCamera]);

  const scanFrame = useCallback(async (timestamp) => {
    if (!streamRef.current || !videoRef.current) return;
    if (timestamp - lastScanRef.current > 350 && videoRef.current.readyState >= 2) {
      lastScanRef.current = timestamp;
      try {
        const codes = await detectorRef.current.detect(videoRef.current);
        if (codes.length) {
          acceptResult(codes[0].rawValue);
          return;
        }
      } catch {
        // A video frame may be unavailable while the camera is settling.
      }
    }
    frameRef.current = requestAnimationFrame(scanFrame);
  }, [acceptResult]);

  async function startCamera() {
    setError("");
    setResult("");
    if (!("BarcodeDetector" in window)) {
      setError("QR scanning is not supported by this browser. Open this app in the latest Chrome on your phone.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available. Use HTTPS and allow camera permission.");
      return;
    }
    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (cameraError) {
      stopCamera();
      setError(cameraError?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser settings and try again."
        : "The camera could not be started. Close other camera apps and try again.");
    }
  }

  async function scanImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!("BarcodeDetector" in window)) {
      setError("QR image scanning is not supported by this browser. Use the latest Chrome on your phone.");
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close?.();
      if (!codes.length) throw new Error("QR not found");
      acceptResult(codes[0].rawValue);
    } catch {
      setError("No readable QR code was found in that image.");
    }
  }

  const isLink = /^https?:\/\//i.test(result);
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Scan QR code">
      <div className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Scan QR</h2>
            <p className="text-xs text-slate-500">Scan a Bharath Painters profile or document QR.</p>
          </div>
          <button type="button" onClick={() => { stopCamera(); close(); }} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100" aria-label="Close scanner">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-950">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            {!scanning && !result && (
              <div className="absolute inset-0 grid place-items-center text-center text-white">
                <div><QrCode className="mx-auto h-12 w-12" /><p className="mt-3 text-sm">Position the QR code inside the camera view.</p></div>
              </div>
            )}
            {scanning && <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white shadow-[0_0_0_999px_rgba(2,6,23,.35)]" />}
          </div>
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {result && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">QR detected</p>
              <p className="mt-2 break-all text-sm text-slate-700">{result}</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {!result ? (
              <>
                <button type="button" onClick={scanning ? stopCamera : startCamera} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
                  {scanning ? "Stop camera" : "Start camera"}
                </button>
                <label className="cursor-pointer rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold">
                  Scan image
                  <input type="file" accept="image/*" capture="environment" onChange={scanImage} className="hidden" />
                </label>
              </>
            ) : (
              <>
                {isLink ? (
                  <button type="button" onClick={() => window.open(result, "_blank", "noopener,noreferrer")} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Open result</button>
                ) : (
                  <button type="button" onClick={() => navigator.clipboard?.writeText(result)} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Copy result</button>
                )}
                <button type="button" onClick={startCamera} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold">Scan again</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
