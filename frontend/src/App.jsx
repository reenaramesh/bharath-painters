import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import VerifiedContractorRoute from "./components/VerifiedContractorRoute";
import PdfPreviewHost from "./components/PdfPreview";
import PwaInstallPrompt from "./components/PwaInstallPrompt";

const page = (name) => lazy(() => import(`./pages/${name}.jsx`));
const Login = page("Login");
const Register = page("Register");
const CustomerRegister = page("CustomerRegister");
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
const Painters = page("Painters");
const MeasurementCalculator = page("MeasurementCalculator");
const MasterServices = page("MasterServices");
const ContractorSettings = page("ContractorSettings");
const Tasks = page("Tasks");
const Chat = page("Chat");
const ServiceRequests = page("ServiceRequests");
const SupportTickets = page("SupportTickets");
const CustomerDashboard = page("CustomerDashboard");
const CustomerConnections = page("CustomerConnections");
const MeasurementAccess = page("MeasurementAccess");
const CustomerQuotation = page("CustomerQuotation");
const CustomerQuotations = page("CustomerQuotations");
const CustomerProperties = page("CustomerProperties");
const CustomerPropertyDetail = page("CustomerPropertyDetail");
const CustomerInvoices = page("CustomerInvoices");
const WorkSchedules = page("WorkSchedules");
const WorkChanges = page("WorkChanges");
const WorkReschedules = page("WorkReschedules");
const CompletedWork = page("CompletedWork");
const Leads = page("Leads");
const Opportunities = page("Opportunities");
const OpportunityDetail = page("OpportunityDetail");
const NewOpportunity = page("NewOpportunity");
const SiteVisits = page("SiteVisits");
const PainterSeeking = page("PainterSeeking");
const FindPainter = page("FindPainter");
const PainterAssignments = page("PainterAssignments");
const Jobs = page("Jobs");
const JobActivity = page("JobActivity");
const ApplicatorTeam = page("ApplicatorTeam");
const ApplicatorProfile = page("ApplicatorProfile");
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
const Reports = page("Reports");
const ProfileCard = page("ProfileCard");

function App() {
  return (
    <BrowserRouter>
      <PdfPreviewHost />
      <PwaInstallPrompt />
      <Suspense
        fallback={
          <div className="bp-page-state min-h-screen">
            <span className="bp-spinner" />
            <p>Loading workspace…</p>
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/customer-register" element={<CustomerRegister />} />
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
            <Route path="/customer/connection-requests" element={<CustomerConnections />} />
            <Route path="/profile" element={<ProfileCard />} />
            <Route path="/account-security" element={<RecoveryEmailSettings />} />
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
            <Route path="/service-requests" element={<ServiceRequests />} />
            <Route path="/support-tickets" element={<SupportTickets />} />
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
            <Route path="/find-painter" element={<FindPainter />} />
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
            <Route path="/applicator-profile" element={<ApplicatorProfile />} />
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
              path="/settings"
              element={
                <VerifiedContractorRoute>
                  <ContractorSettings />
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
    </BrowserRouter>
  );
}

export default App;
