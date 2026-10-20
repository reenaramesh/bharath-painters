import { contractorProfileLink } from "../utils/contractorProfileLink.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ExternalLink,
  MessageCircle,
  Share2,
  Star,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { Dialog } from "../components/ui/Dialog";
import "../styles/contractor-people-ui.css";
import ContractorConnectSearch from "../components/ContractorConnectSearch";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../components/ui";
import "./customer-connections.css";

const tabs = [
  ["PENDING", "Requests"],
  ["CONNECTED", "Connected"],
  ["BLOCKED", "Blocked"],
];

export default function CustomerConnections() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState(
    searchParams.get("tab")?.toLowerCase() === "pending" ? "PENDING" : "CONNECTED",
  );
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setTab(searchParams.get("tab")?.toLowerCase() === "pending" ? "PENDING" : "CONNECTED");
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const { data } = await api.get("/quotations/customer/connection-requests/");
      setItems(data.results || []);
      setPendingCount(data.pending_count || 0);
      setError("");
    } catch {
      setError("Your contractor connections could not be loaded.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter((item) =>
        tab === "PENDING"
          ? ["PENDING", "RECONNECT_PENDING", "REJECTED"].includes(item.status)
          : item.status === tab,
      ),
    [items, tab],
  );
  const counts = useMemo(
    () => ({
      PENDING: pendingCount,
      CONNECTED: items.filter((item) => item.status === "CONNECTED").length,
      BLOCKED: items.filter((item) => item.status === "BLOCKED").length,
    }),
    [items, pendingCount],
  );
  const closeDialog = useCallback(() => {
    setSelected(null);
    setShareMessage("");
  }, []);

  async function act(item, action, payload = {}) {
    if (!window.confirm(confirmText(item, action))) return;
    setBusy(true);
    setError("");
    try {
      const actionPath = ["block", "disconnect"].includes(action)
        ? "contractors"
        : "connection-requests";
      await api.post(`/quotations/customer/${actionPath}/${item.id}/${action}/`, payload);
      setSelected(null);
      await load();
      if (action === "block") setTab("BLOCKED");
      if (action === "unblock") {
        setTab(item.status_before_block === "CONNECTED" ? "CONNECTED" : "PENDING");
      }
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch (requestError) {
      const response = requestError.response?.data;
      setError(
        response?.detail ||
          response?.action ||
          `The connection could not be updated${requestError.response?.status ? ` (HTTP ${requestError.response.status})` : ""}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function shareProfile(item) {
    const url = contractorProfileUrl(item.contractor?.contractor_id);
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${item.contractor.business_name} | Bharath Apps`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Contractor profile link copied.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") {
        setShareMessage("Profile could not be shared on this device.");
      }
    }
  }

  async function openMessage(item) {
    if (busy || item.status !== "CONNECTED") return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/quotations/chat/conversations/", {
        connection: item.id,
      });
      navigate(`/messages?conversation=${data.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.connection || "Conversation could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="customer-connections-page space-y-6">
      <PageHeader
        eyebrow="Your network"
        title="Your contractors"
        description="Manage contractor connections, shared work and conversations."
        
      />

      {error && !loadFailed && (
        <p className="connections-alert" role="alert">
          {error}
        </p>
      )}

      <ContractorConnectSearch
        onConnected={async () => {
          await load();
          setTab("CONNECTED");
        }}
      />

      <div className="customer-connection-tabs" role="group" aria-label="Filter contractor connections">
        {tabs.map(([value, label]) => (
          <button className="bp-ui-action"
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
            <span>{counts[value] || 0}</span>
          </button>
        ))}
      </div>

      <SectionCard
        title={tabLabel(tab)}
        
        className="customer-connections-list"
        bodyClassName="p-0"
      >
        {loadFailed ? (
          <ErrorState message={error} onRetry={load} className="connections-state" />
        ) : loading ? (
          <LoadingState label="Loading your contractor connections…" className="connections-state" />
        ) : visible.length ? (
          <div className="connection-card-grid">
            {visible.map((item) => (
              <ConnectionCard
                key={item.id}
                item={item}
                busy={busy}
                onView={() => setSelected(item)}
                onAct={act}
                onMessage={openMessage}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={emptyTitle(tab)}
            description={emptyDescription(tab)}
            className="connections-state"
          />
        )}
      </SectionCard>

      {selected && (
        <ContractorDialog
          item={selected}
          error={error}
          onClose={closeDialog}
          onAct={act}
          onShare={shareProfile}
          onMessage={openMessage}
          shareMessage={shareMessage}
          busy={busy}
        />
      )}
    </div>
  );
}

function ConnectionCard({ item, onView, onAct, onMessage, busy }) {
  const contractor = item.contractor || {};
  const statusLabel = connectionStatusLabel(item.status);
  return (
    <article className="connection-card">
      <div className="connection-card-heading">
        <span className="connection-card-icon" aria-hidden="true">
          <Building2 />
        </span>
        <div className="connection-card-identity">
          <h2 className="bp-ui-section-heading">{contractor.business_name || "Contractor"}</h2>
          <p>{contractor.contractor_id || "Bharath Apps Contractor"}</p>
        </div>
        <StatusBadge status={item.status} label={statusLabel} tone={connectionTone(item.status)} />
      </div>

      {contractor.is_verified && (
        <p className="connection-verification">
          <Check aria-hidden="true" /> Verified contractor
        </p>
      )}

      <p className="connection-date">
        {item.status === "CONNECTED" ? "Connected" : "Requested"} {formatConnectionDate(item.connected_at || item.requested_at)}
      </p>

      {item.status === "CONNECTED" && item.counts && (
        <div className="connection-activity-summary" aria-label="Work shared with this contractor">
          <Metric label="Quotations" value={item.counts.quotations} />
          <Metric label="Area calculations" value={item.counts.area_calculations} />
          <Metric label="Active projects" value={item.counts.active_projects} />
        </div>
      )}

      {item.status === "REJECTED" && item.cooldown_until && new Date(item.cooldown_until) > new Date() && (
        <p className="connection-cooldown" role="status">
          You can send another request after {formatConnectionDate(item.cooldown_until)}.
        </p>
      )}

      <div className="connection-card-actions">
        <Button variant="secondary" onClick={onView} className="connection-view-action">
          View contractor
        </Button>
        {item.status === "CONNECTED" && (
          <Button onClick={() => onMessage(item)} disabled={busy}>
            <MessageCircle aria-hidden="true" />
            Message contractor
          </Button>
        )}
        {["PENDING", "RECONNECT_PENDING"].includes(item.status) && (
          <>
            <Button onClick={() => onAct(item, "accept")} disabled={busy}>
              Accept request
            </Button>
            <Button variant="danger" onClick={() => onAct(item, "reject")} disabled={busy}>
              Decline
            </Button>
          </>
        )}
        {item.status === "REJECTED" && (
          <Button
            variant="secondary"
            onClick={() => onAct(item, "connect-back")}
            disabled={busy || Boolean(item.cooldown_until && new Date(item.cooldown_until) > new Date())}
          >
            Request connection again
          </Button>
        )}
        {item.status === "BLOCKED" ? (
          <Button variant="secondary" onClick={() => onAct(item, "unblock")} disabled={busy}>
            Unblock contractor
          </Button>
        ) : (
          <Button variant="danger" onClick={() => onAct(item, "block")} disabled={busy}>
            Block
          </Button>
        )}
      </div>
    </article>
  );
}

function ContractorDialog({ item, onClose, onAct, onShare, onMessage, shareMessage, busy, error }) {
  const contractor = item.contractor || {};
  const profileUrl = contractorProfileUrl(contractor.contractor_id);
  return (
    <Dialog title={contractor.business_name || "Contractor"} description={contractor.name} icon={Building2} onClose={onClose} size="md" closeLabel="Close contractor profile" closeOnBackdrop className="contractor-dialog customer-connection-dialog">
      {error && <p role="alert" className="connections-alert">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {contractor.contractor_id && <span className="contractor-identity-id">{contractor.contractor_id}</span>}
            <StatusBadge status={item.status} label={connectionStatusLabel(item.status)} tone="neutral" className="contractor-dialog-connection-status" />
            {contractor.is_verified && <StatusBadge status="VERIFIED" label="Verified contractor" tone="success" />}
            {!contractor.is_verified && contractor.verification_status && <StatusBadge status={contractor.verification_status} label={verificationLabel(contractor.verification_status)} tone={verificationTone(contractor.verification_status)} />}
          </div>

        <div className="contractor-profile-body p-5 sm:p-6">
          <div className="contractor-profile-stats">
            <Metric label="Years in business" value={contractor.years_in_business} />
            <Metric label="Team members" value={contractor.workers} />
            <Metric label="Completed projects" value={contractor.completed_projects} />
          </div>

          {contractor.public_rating != null && (
            <p className="contractor-public-rating" aria-label={`${contractor.public_rating} out of 5 from ${contractor.review_count || 0} reviews`}>
              <Star aria-hidden="true" />
              <strong>{contractor.public_rating} / 5</strong>
              <span>{contractor.review_count || 0} customer reviews</span>
            </p>
          )}

          <dl className="contractor-profile-details">
            <Info label="Service areas" value={contractor.service_areas || "Not specified"} />
            <Info label="Services and skills" value={contractor.work_skills || "Not specified"} />
          </dl>

          <div className="contractor-profile-links">
            {profileUrl && (
              <a href={profileUrl} target="_blank" rel="noreferrer" className="bp-button bp-button-secondary">
                <ExternalLink aria-hidden="true" />
                Open full profile
              </a>
            )}
            {item.status === "CONNECTED" && (
              <Button onClick={() => onMessage(item)} disabled={busy}>
                <MessageCircle aria-hidden="true" />
                Message contractor
              </Button>
            )}
            {item.status === "PENDING" && (
              <Button onClick={() => onAct(item, "accept")} disabled={busy}>
                <Check aria-hidden="true" />
                Accept request
              </Button>
            )}
            {item.status === "RECONNECT_PENDING" && (
              <Button onClick={() => onAct(item, "accept")} disabled={busy}>
                <Check aria-hidden="true" />
                Accept reconnection
              </Button>
            )}
            {item.status === "REJECTED" && (
              <Button
                onClick={() => onAct(item, "connect-back")}
                disabled={busy || Boolean(item.cooldown_until && new Date(item.cooldown_until) > new Date())}
              >
                Request connection again
              </Button>
            )}
            {item.status === "BLOCKED" && (
              <Button variant="secondary" onClick={() => onAct(item, "unblock")} disabled={busy}>
                Unblock contractor
              </Button>
            )}
            <Button variant="secondary" onClick={() => onShare(item)}>
              <Share2 aria-hidden="true" />
              Share profile
            </Button>
          </div>
          {item.status === "PENDING" || item.status === "RECONNECT_PENDING" ? (
            <div className="contractor-dialog-request-actions">
              <Button variant="danger" onClick={() => onAct(item, "reject")} disabled={busy}>
                Decline request
              </Button>
            </div>
          ) : null}
          {item.status === "REJECTED" && item.cooldown_until && new Date(item.cooldown_until) > new Date() && (
            <p className="contractor-dialog-cooldown" role="status">
              You can send another request after {formatConnectionDate(item.cooldown_until)}.
            </p>
          )}
          {shareMessage && <p role="status" className="contractor-dialog-share-status">{shareMessage}</p>}
          {item.status === "CONNECTED" && (
            <div className="contractor-dialog-danger-action">
              <Button variant="danger" onClick={() => onAct(item, "block")} disabled={busy}>
                Block contractor
              </Button>
            </div>
          )}
        </div>
    </Dialog>
  );
}

function connectionStatusLabel(status) {
  return ({
    PENDING: "Connection request pending",
    RECONNECT_PENDING: "Reconnection request pending",
    CONNECTED: "Connected",
    REJECTED: "Request declined",
    BLOCKED: "Blocked",
    DISCONNECTED: "Disconnected",
  })[status] || readableStatus(status);
}

function connectionTone(status) {
  if (status === "CONNECTED") return "success";
  if (["PENDING", "RECONNECT_PENDING"].includes(status)) return "warning";
  if (status === "BLOCKED") return "danger";
  return "neutral";
}

function verificationLabel(status) {
  return ({
    PENDING: "Verification pending",
    UNDER_REVIEW: "Verification in review",
    REJECTED: "Verification not approved",
    SUSPENDED: "Verification suspended",
  })[status] || `Verification ${readableStatus(status).toLowerCase()}`;
}

function verificationTone(status) {
  if (status === "UNDER_REVIEW") return "warning";
  if (["REJECTED", "SUSPENDED"].includes(status)) return "danger";
  return "neutral";
}

function readableStatus(value) {
  return String(value || "Status unavailable")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyTitle(tab) {
  if (tab === "PENDING") return "No connection requests";
  if (tab === "BLOCKED") return "No blocked contractors";
  return "No contractors connected yet";
}

function emptyDescription(tab) {
  if (tab === "PENDING") return "New requests and previous responses will appear here.";
  if (tab === "BLOCKED") return "Contractors you block will be listed here.";
  return "Search by a contractor’s mobile number to connect, or ask them to send you a request.";
}

function tabLabel(tab) {
  return tabs.find(([value]) => value === tab)?.[1] || "Contractors";
}

function formatConnectionDate(value) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Metric({ label, value }) {
  return (
    <div className="connection-metric">
      <b>{value ?? 0}</b>
      <span>{label}</span>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="contractor-profile-info">
      <dt>{label}</dt>
      <dd>{value || "Not specified"}</dd>
    </div>
  );
}

function confirmText(item, action) {
  const name = item.contractor?.business_name || "this contractor";
  return ({
    accept: `Connect with ${name}? They can create records only for their work with you.`,
    reject: `Reject the request from ${name}?`,
    block: `Block ${name}? They will not be able to send more requests.`,
    unblock: `Unblock ${name}?`,
    "connect-back": `Ask to reconnect with ${name}?`,
  })[action] || `Update ${name}?`;
}

function contractorProfileUrl(bharathId) { return contractorProfileLink(bharathId); }
