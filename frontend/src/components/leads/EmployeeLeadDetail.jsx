import LeadDetailView from "./LeadDetailView";

export default function EmployeeLeadDetail(props) {
  return <LeadDetailView {...props} item={{ ...props.item, can_manage_lead: false, can_assign: false }} />;
}
