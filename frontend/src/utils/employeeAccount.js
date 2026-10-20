export function employeeRegistration(employee = {}) {
  if (!['REGISTERED', 'UNREGISTERED'].includes(employee.registration_status)) return null;
  const registered = employee.registration_status === 'REGISTERED';
  return {
    label: registered ? 'Registered' : 'Unregistered',
    registered,
    canResend: !registered && employee.can_resend_activation === true,
  };
}

export function employeeSelectionDraft(draft, painter) {
  return {
    ...draft,
    name: painter.name || '',
    mobile: painter.mobile || '',
    skills: painter.skills || '',
    experience_years: painter.experience_years ?? 0,
  };
}
