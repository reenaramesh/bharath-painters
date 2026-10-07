import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import VerifiedContractorRoute from "./components/VerifiedContractorRoute";
import ProviderProfileRoute, { LegacyPersonalSettingsRedirect } from "./components/ProviderProfileRoute";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import PdfPreviewHost from "./components/PdfPreview";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import WhatsAppAppChooser from "./components/WhatsAppAppChooser";
import LanguageSelector from "./components/LanguageSelector";

const page = (name) => lazy(() => import(`./pages/${name}.jsx`));
const Login = page("Login");
const Register = page("Register");
const CustomerRegister = page("CustomerRegister");
const CustomerShareLink = page("CustomerShareLink");
const JoinProperty = page("JoinProperty");
const ForgotPassword = page("ForgotPassword");
const RecoveryEmailSettings = page("RecoveryEmailSettings");
const Dashboard = page("Dashboard");
const Customers = page("Customers");
const CustomerDetail = page("CustomerDetail");
const CustomerQuotationHistory = page("CustomerQuotationHistory");
const Properties = page("Properties");
const PropertyDetail = page("PropertyDetail");
const Quotations = page("Quotations");
const QuotationBuilder = page("QuotationBuilder");
const QuotationDetail = page("QuotationDetail");
const QuotationEdit = page("QuotationEdit");
const Invoices = page("Invoices");
const Contractors = page("Contractors");
const ContractorNetwork = page("ContractorNetwork");
const SubcontractWorkOrders = page("SubcontractWorkOrders");
const SubcontractWorkOrderDetail = page("SubcontractWorkOrderDetail");
const Painters = page("Painters");
const MeasurementCalculator = page("MeasurementCalculator");
const MasterServices = page("MasterServices");
const Settings = page("Settings");
const ContractorCompletedProjects = page("ContractorCompletedProjects");
const AppearanceSettings = page("AppearanceSettings");
const Tasks = page("Tasks");
const Chat = page("Chat");
const ServiceRequests = page("ServiceRequests");
const SupportTickets = page("SupportTickets");
const SupportWorkspace = page("SupportWorkspace");
const SupportStaff = page("SupportStaff");
const AdminIntegrations = page("AdminIntegrations");
const CustomerDashboard = page("CustomerDashboard");
const CustomerConnections = page("CustomerConnections");
const CustomerProfile = page("CustomerProfile");
const MeasurementAccess = page("MeasurementAccess");
const CustomerQuotation = page("CustomerQuotation");
const CustomerQuotations = page("CustomerQuotations");
const CustomerProperties = page("CustomerProperties");
const CustomerPropertyDetail = page("CustomerPropertyDetail");
const PropertyAccess = page("PropertyAccess");
const CustomerInvoices = page("CustomerInvoices");
const WorkSchedules = page("WorkSchedules");
const WorkChanges = page("WorkChanges");
const WorkReschedules = page("WorkReschedules");
const CompletedWork = page("CompletedWork");
const Leads = page("Leads");
const Opportunities = page("Opportunities");
const NewOpportunity = page("NewOpportunity");
const OpportunityDetail = page("OpportunityDetail");
const SiteVisits = page("SiteVisits");
const PainterSeeking = page("PainterSeeking");
const PainterAssignments = page("PainterAssignments");
const Jobs = page("Jobs");
const JobActivity = page("JobActivity");
const ApplicatorTeam = page("ApplicatorTeam");
const ApplicatorAvailability = page("ApplicatorAvailability");
const ApplicatorBookings = page("ApplicatorBookings");
const InHouseApplicators = page("InHouseApplicators");
const InHouseEmployeeCreate = page("InHouseEmployeeCreate");
const InHouseEmployeeDetail = page("InHouseEmployeeDetail");
const InHouseEarnings = page("InHouseEarnings");
const WorkReviews = page("WorkReviews");
const Billing = page("Billing");
const AdminBilling = page("AdminBilling");
const AdminRevenue = page("AdminRevenue");
const AdminCustomerConnections = page("AdminCustomerConnections");
const ContractorRevenue = page("ContractorRevenue");
const ContractorPackages = page("ContractorPackages");
const ActivityLog = page("ActivityLog");
const MeasurementTrial = page("MeasurementTrial");
const WorkPhotos = page("WorkPhotos");
const ColorsShades = page("ColorsShades");
const Reports = page("Reports");
const ProfileCard = page("ProfileCard");
const CustomerContractorReviews = page("CustomerContractorReviews");

// Bharath Apps multi-trade + outsourcing preview.
// Gated on import.meta.env.DEV so the whole branch is dropped from production
// builds. It sits outside ProtectedRoute and outside DashboardLayout, so it
// cannot affect real navigation or bypass auth for any application route.
const BharathAppsPreview = import.meta.env.DEV
  ? lazy(() => import("./preview/bharathApps/PreviewApp.jsx"))
  : null;
const SidebarPreview = import.meta.env.DEV
  ? lazy(() => import("./preview/sidebar/SidebarPreview.jsx"))
  : null;
const MergedSettingsPreview = import.meta.env.DEV
  ? lazy(() => import("./preview/settings/MergedSettingsPreview.jsx"))
  : null;
const SubcontractWorkOrdersPreview = import.meta.env.DEV
  ? lazy(() => import("./preview/subcontractWorkOrders/SubcontractWorkOrdersPreview.jsx"))
  : null;

function App() {
  return (
    <BrowserRouter>
      <PdfPreviewHost />
      <PwaInstallPrompt />
      <WhatsAppAppChooser />
      <AppRoutes />
    </BrowserRouter>
  );
}

// The boundary sits outside Suspense so a failed lazy import is caught too.
// Keying it on the pathname remounts it on navigation, which clears a
// captured failure without an extra render pass.
function AppRoutes() {
  const location = useLocation();
  const publicLanguagePage = ["/login", "/register", "/customer-register", "/forgot-password"].includes(location.pathname);

  return (
    <RouteErrorBoundary key={location.pathname}>
      {publicLanguagePage && <div className="flex justify-end bg-white px-4 py-3"><LanguageSelector /></div>}
      <Suspense
        fallback={
          <div className="bp-state min-h-screen">
            <span className="bp-spinner" />
            <p>Loading workspace…</p>
          </div>
        }
      >
        <Routes>
          {MergedSettingsPreview && <Route path="/preview/settings" element={<MergedSettingsPreview />} />}
          {SubcontractWorkOrdersPreview && (
            <Route path="/preview/subcontract-work-orders" element={<SubcontractWorkOrdersPreview />} />
          )}
          {SidebarPreview && <Route path="/preview/sidebar" element={<SidebarPreview />} />}
          {BharathAppsPreview && (
            <Route path="/preview/bharath-apps" element={<BharathAppsPreview />} />
          )}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/customer-register" element={<CustomerRegister />} />
          <Route path="/customer-link/:token" element={<CustomerShareLink />} />
          <Route path="/join/property/:token" element={<JoinProperty />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/applicator" element={<Dashboard />} />
            <Route path="/customer-dashboard" element={<CustomerDashboard />} />
            <Route path="/customer/connections" element={<CustomerConnections />} />
            <Route path="/customer/profile" element={<CustomerProfile />} />
            <Route path="/customer/connection-requests" element={<Navigate to="/customer/connections" replace />} />
            <Route path="/profile" element={<ProfileCard />} />
            <Route path="/customer-reviews" element={<CustomerContractorReviews />} />
            <Route
              path="/completed-projects"
              element={
                <VerifiedContractorRoute>
                  <ContractorCompletedProjects />
                </VerifiedContractorRoute>
              }
            />
            <Route path="/account-security" element={<RecoveryEmailSettings />} />
            <Route path="/appearance" element={<AppearanceSettings />} />
            <Route path="/contractors" element={<Contractors />} />
            <Route path="/painters" element={<Painters />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route
              path="/customers/:id/quotations"
              element={<CustomerQuotationHistory />}
            />
            <Route
              path="/invoices"
              element={
                <VerifiedContractorRoute>
                  <Invoices />
                </VerifiedContractorRoute>
              }
            />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/messages" element={<Chat />} />
            <Route path="/colors-shades" element={<ColorsShades />} />
            <Route path="/service-requests" element={<ServiceRequests />} />
            <Route path="/support-tickets" element={<SupportTickets />} />
            <Route path="/support-workspace" element={<SupportWorkspace />} />
            <Route path="/support-staff" element={<SupportStaff />} />
            <Route path="/admin-integrations" element={<AdminIntegrations />} />
            <Route path="/measurement-access" element={<MeasurementAccess />} />
            <Route
              path="/customer-quotations"
              element={<CustomerQuotations />}
            />
            <Route
              path="/customer-quotations/:id"
              element={<CustomerQuotation />}
            />
            <Route path="/customer-invoices" element={<CustomerInvoices />} />
            <Route
              path="/customer-properties"
              element={<CustomerProperties />}
            />
            <Route
              path="/customer-properties/:id"
              element={<CustomerPropertyDetail />}
            />
            <Route path="/customer-properties/:id/access" element={<PropertyAccess />} />
            <Route path="/work-schedules" element={<WorkSchedules />} />
            <Route path="/work-changes" element={<WorkChanges />} />
            <Route path="/work-reschedules" element={<WorkReschedules />} />
            <Route path="/completed-work" element={<CompletedWork />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/opportunities/new" element={<NewOpportunity />} />
            <Route path="/opportunities/:id" element={<OpportunityDetail />} />
            <Route path="/site-visits" element={<SiteVisits />} />
            <Route path="/painter-seeking" element={<PainterSeeking />} />
            <Route path="/find-painter" element={<Navigate to="/applicator-bookings" replace />} />
            <Route
              path="/painter-assignments"
              element={<PainterAssignments />}
            />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/job-activity" element={<JobActivity />} />
            <Route path="/applicator-team" element={<ApplicatorTeam />} />
            <Route
              path="/in-house-applicators"
              element={<InHouseApplicators />}
            />
            <Route
              path="/in-house-applicators/new"
              element={<InHouseEmployeeCreate />}
            />
            <Route
              path="/in-house-applicators/:id"
              element={<InHouseEmployeeDetail />}
            />
            <Route path="/in-house-earnings" element={<InHouseEarnings />} />
            <Route path="/work-reviews" element={<WorkReviews />} />
            <Route path="/billing" element={<AdminBilling />} />
            <Route path="/packages" element={<Billing />} />
            <Route path="/revenue" element={<AdminRevenue />} />
            <Route path="/customer-connections" element={<AdminCustomerConnections />} />
            <Route
              path="/contractor-revenue"
              element={
                <VerifiedContractorRoute>
                  <ContractorRevenue />
                </VerifiedContractorRoute>
              }
            />
            <Route path="/my-packages" element={<ContractorPackages />} />
            <Route path="/activity-log" element={<ActivityLog />} />
            <Route path="/measurement-trial" element={<MeasurementTrial />} />
            <Route
              path="/applicator-availability"
              element={<ApplicatorAvailability />}
            />
            <Route
              path="/applicator-bookings"
              element={<ApplicatorBookings />}
            />
            <Route path="/properties" element={<Properties />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
            <Route
              path="/properties/:id/measurements"
              element={<MeasurementCalculator />}
            />
            <Route path="/master-services" element={<MasterServices />} />
            <Route
              path="/contractor-network"
              element={
                <VerifiedContractorRoute>
                  <ContractorNetwork />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/subcontract-work-orders"
              element={
                <VerifiedContractorRoute>
                  <SubcontractWorkOrders />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/subcontract-work-orders/:id"
              element={
                <VerifiedContractorRoute>
                  <SubcontractWorkOrderDetail />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProviderProfileRoute>
                  <Settings />
                </ProviderProfileRoute>
              }
            />
            {/* Kept so old bookmarks and shared links land on the right tab of
                the merged settings page instead of a removed screen. */}
            <Route
              path="/provider-profile"
              element={
                <ProviderProfileRoute>
                  <Navigate to="/settings?tab=trade" replace />
                </ProviderProfileRoute>
              }
            />
            <Route
              path="/applicator-profile"
              element={<LegacyPersonalSettingsRedirect />}
            />
            <Route
              path="/contractor-theme"
              element={
                <VerifiedContractorRoute>
                  <Navigate to="/settings?tab=appearance" replace />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/quotations"
              element={
                <VerifiedContractorRoute>
                  <Quotations />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/quotations/new"
              element={
                <VerifiedContractorRoute>
                  <QuotationBuilder />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/quotations/new-measured"
              element={
                <VerifiedContractorRoute>
                  <QuotationBuilder />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/quotations/:id"
              element={
                <VerifiedContractorRoute>
                  <QuotationDetail />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/quotations/new-manual"
              element={
                <VerifiedContractorRoute>
                  <QuotationBuilder />
                </VerifiedContractorRoute>
              }
            />
            <Route
              path="/quotations/:id/edit"
              element={
                <VerifiedContractorRoute>
                  <QuotationEdit />
                </VerifiedContractorRoute>
              }
            />
            <Route path="/work-photos" element={<WorkPhotos />} />
            <Route path="/reports" element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default App;
