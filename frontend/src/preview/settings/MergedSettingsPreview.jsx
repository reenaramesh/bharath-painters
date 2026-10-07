import BusinessSettingsForm from "../../components/BusinessSettingsForm";
import { SEED_CATALOGUE } from "../bharathApps/data";

const INITIAL = {
  company_name: "Bharath Home Services", owner_name: "Sample Business Owner",
  mobile: "9000000000", email: "owner@example.test", office_address: "Sample office, Bengaluru",
  core_service: "painting", additional_services: ["plumbing"], sub_services: ["interior-painting", "leak-repair"],
  work_skills: "Furniture restoration, specialist finishes", years_in_business: "8", team_size: "12",
  service_areas: "Bengaluru, Whitefield", base_location: "Whitefield, Bengaluru",
  headline: "Painting and property maintenance", tagline: "Care in every detail", about: "Interior finishes and home maintenance.", workspace_name_override: "",
  bank_account_name: "", bank_account_number: "", bank_name: "", bank_branch: "", bank_ifsc: "", upi_id: "", gst_number: "", pan_number: "",
  website: "", google_business_url: "", facebook_url: "", instagram_url: "", pinterest_url: "", whatsapp_number: "", extra_social_links: [],
  default_measurement_unit: "FEET", accepts_subcontract_work: true, network_opt_in: true, profile_status: "DRAFT",
  app_primary_color: "#176B9B", app_accent_color: "#508398", pdf_primary_color: "#142743", pdf_accent_color: "#FF991F", pdf_text_color: "#172033", pdf_font: "MODERN",
};

export default function MergedSettingsPreview() {
  return <BusinessSettingsForm initial={INITIAL} catalogue={SEED_CATALOGUE.filter((entry) => entry.isActive)} />;
}
