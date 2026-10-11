export function customerAccountStatus(customer) {
  if (customer.is_pending_connection || customer.is_saved_contact) return null;
  const status = customer.account_status || (customer.activation_pending === true ? 'NOT_ACTIVATED' : customer.activation_pending === false ? 'ACTIVE' : null);
  if (!status) return null;
  if (status === 'DISABLED') return { label: 'Account disabled', tone: 'danger', canResend: false, activity: '' };
  if (status === 'NOT_ACTIVATED') return { label: 'Not activated', tone: 'warning', canResend: true, activity: '' };
  return { label: 'Account activated', tone: 'success', canResend: false, activity: customer.has_app_activity ? 'App activity recorded' : '' };
}
