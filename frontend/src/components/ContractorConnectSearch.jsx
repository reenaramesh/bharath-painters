import { useState } from "react";
import { ArrowRight, ExternalLink, Search, UserPlus } from "lucide-react";
import api, { API_BASE_URL } from "../api/client";
import useAuth from "../context/useAuth";
import { Button, SectionCard, StatusBadge } from "../components/ui";
import "../pages/customer-connections.css";

export default function ContractorConnectSearch({ onConnected }) {
  const { user } = useAuth();
  const [mobile, setMobile] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.get("/quotations/customer/contractors/search/", {
        params: { mobile },
      });
      setResult(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.mobile ||
          requestError.response?.data?.detail ||
          "Contractor search failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await api.post("/quotations/customer/contractors/connect/", {
        mobile: result.mobile,
      });
      setResult((current) => ({
        ...current,
        connection_status: "CONNECTED",
        can_connect: false,
      }));
      await onConnected();
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "The contractor could not be connected.",
      );
    } finally {
      setBusy(false);
    }
  }

  const invitation = `Hello, I would like to connect with you on Bharath Apps. Register as a contractor here: ${window.location.origin}/register. My customer mobile number is ${user?.mobile || "available from me"}. After registration, we can connect and share quotations and project updates.`;
  const invitationNumber = String(result?.mobile || "").replace(/[^0-9]/g, "");
  const contractor = result?.contractor || {};
  const profileUrl = contractor.contractor_id
    ? new URL(
        `${API_BASE_URL.replace(/\/$/, "")}/accounts/verify-page/${encodeURIComponent(contractor.contractor_id)}/`,
        window.location.origin,
      ).href
    : "";

  return (
    <SectionCard
      title="Find your contractor"
      description="Search by the mobile number you already know. If they are not registered, you can invite them."
      className="contractor-search-card"
    >
      <form onSubmit={search} className="contractor-search-form">
        <label className="contractor-search-field">
          <span>Contractor mobile number</span>
          <input
            required
            disabled={busy}
            inputMode="tel"
            autoComplete="tel"
            aria-label="Contractor mobile number"
            placeholder="Enter mobile number"
            value={mobile}
            onChange={(event) => {
              setMobile(event.target.value);
              setResult(null);
              setError("");
            }}
          />
        </label>
        <Button type="submit" loading={busy} className="contractor-search-submit">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>

      {error && <p role="alert" className="connections-alert mt-4">{error}</p>}

      {result?.state === "FOUND" && (
        <div className="contractor-search-result">
          <div className="contractor-search-result-main">
            <span className="contractor-search-result-icon" aria-hidden="true">
              <UserPlus />
            </span>
            <div className="min-w-0 flex-1">
              <div className="contractor-search-result-heading">
                <div className="min-w-0">
                  <h3>{contractor.business_name || "Contractor"}</h3>
                  <p>{contractor.contractor_id || contractor.name || "Contractor profile"} · {result.mobile}</p>
                </div>
                {contractor.is_verified && (
                  <StatusBadge status="VERIFIED" label="Verified" tone="success" />
                )}
              </div>
              {profileUrl && (
                <a href={profileUrl} target="_blank" rel="noreferrer" className="contractor-search-profile-link">
                  View contractor profile <ExternalLink aria-hidden="true" />
                </a>
              )}
            </div>
          </div>

          {result.connection_status === "CONNECTED" ? (
            <p role="status" className="contractor-search-result-status is-connected">
              <StatusBadge status="CONNECTED" label="Connected" tone="success" />
              <span>This contractor is in your connected list.</span>
              <ArrowRight aria-hidden="true" />
            </p>
          ) : result.connection_status === "BLOCKED" || !result.can_connect ? (
            <p role="status" className="contractor-search-result-status">
              <StatusBadge status={result.connection_status || "UNAVAILABLE"} label={connectionLabel(result.connection_status)} tone={result.connection_status === "BLOCKED" ? "danger" : "neutral"} />
              <span>{result.connection_status === "BLOCKED" ? "This contractor is blocked on your account." : connectionLabel(result.connection_status)}</span>
            </p>
          ) : (
            <div className="contractor-search-connect">
              <p>Connecting lets this contractor create and share records for work they do with you.</p>
              <Button onClick={connect} loading={busy}>
                <UserPlus aria-hidden="true" />
                Connect contractor
              </Button>
            </div>
          )}
        </div>
      )}

      {result?.state === "NOT_FOUND" && (
        <div className="contractor-search-invitation">
          <div>
            <StatusBadge status="PENDING" label="Not registered yet" tone="warning" />
            <h3 className="mt-2">Invite this contractor</h3>
            <p>Send an invitation to {result.mobile}. Review the message before choosing a channel.</p>
          </div>
          <div className="contractor-search-invitation-actions">
            <a
              href={`https://wa.me/${invitationNumber}?text=${encodeURIComponent(invitation)}`}
              target="_blank"
              rel="noreferrer"
              className="bp-button bp-button-primary"
            >
              Invite via WhatsApp
            </a>
            <a
              href={`sms:+${invitationNumber}?body=${encodeURIComponent(invitation)}`}
              className="bp-button bp-button-secondary"
            >
              Invite via SMS
            </a>
          </div>
        </div>
      )}

      {result?.state === "UNAVAILABLE" && (
        <p role="status" className="contractor-search-unavailable">{result.message}</p>
      )}
    </SectionCard>
  );
}

function connectionLabel(status) {
  return ({
    PENDING: "Connection request pending",
    RECONNECT_PENDING: "Reconnection request pending",
    REJECTED: "Previous request declined",
    BLOCKED: "Blocked",
  })[status] || "Connection unavailable";
}
