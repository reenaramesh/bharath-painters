import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import BusinessSettingsForm from "../components/BusinessSettingsForm";
import { ErrorState, LoadingState } from "../components/ui";
import ContractorSettings from "./ContractorSettings";
import { businessSettingsForm, businessSettingsPayload, settingsCatalogue, settingsError } from "../utils/businessSettings";

export default function ContractorBusinessSettings() {
  const { refreshUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [settings, categories, descriptions] = await Promise.all([
        api.get("/accounts/business-settings/"), api.get("/quotations/service-categories/"), api.get("/quotations/work-descriptions/"),
      ]);
      setData({ initial: businessSettingsForm(settings.data), catalogue: settingsCatalogue(categories.data?.results || categories.data || [], descriptions.data?.results || descriptions.data || [], settings.data.provider) });
    } catch (requestError) { setError(settingsError(requestError.response?.data, "Settings could not be loaded.")); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (draft) => {
    let response;
    try {
      response = await api.patch("/accounts/business-settings/", businessSettingsPayload(draft), { headers: { "Content-Type": "multipart/form-data" } });
    } catch (requestError) { throw new Error(settingsError(requestError.response?.data)); }
    const company = response.data.company;
    window.dispatchEvent(new CustomEvent("bp-app-theme-changed", { detail: company }));
    window.dispatchEvent(new CustomEvent("bp-company-profile-saved", { detail: company }));
    let warning = "";
    await refreshUser().catch(() => { warning = "Settings saved. Reload to refresh account details."; });
    return { form: businessSettingsForm(response.data), warning };
  };
  if (!data) return error ? <ErrorState message={error} onRetry={load} /> : <LoadingState label="Loading Settings…" />;
  return <BusinessSettingsForm live initial={data.initial} catalogue={data.catalogue} onSave={save} renderAppearance={(form, setForm) => <ContractorSettings themeOnly embedded fieldsOnly managedForm={form} setManagedForm={setForm} />} />;
}
