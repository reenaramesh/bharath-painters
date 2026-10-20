export type OfflineKind = 'measurement' | 'attendance';

export function isAllowedMobileOperation(kind: OfflineKind, endpoint: string) {
  if (kind === 'attendance') return /^\/jobs\/in-house-applicators\/\d+\/attendance\/$/.test(endpoint);
  return /^\/quotations\/properties\/\d+\/(?:measurements\/(?:\?measurement=\d+|\?new=1)?|rooms\/(?:\?measurement=\d+|\?new=1)?)$/.test(endpoint)
    || /^\/quotations\/measurements\/\d+\/$/.test(endpoint);
}

export function mobileOperationReviewPath(kind: OfflineKind, endpoint: string, role?: string) {
  if (kind === 'measurement') {
    const measurement = /^\/quotations\/properties\/(\d+)\/(?:rooms|measurements)\/(?:\?(?:measurement=(\d+)|new=1))?$/.exec(endpoint);
    if (measurement) return `/module/measurements?propertyId=${measurement[1]}${measurement[2] ? `&measurementId=${measurement[2]}` : ''}`;
  }
  if (kind === 'attendance' && /^\/jobs\/in-house-applicators\/\d+\/attendance\/$/.test(endpoint)) {
    if (role === 'PAINTER') return '/role?tab=ATTENDANCE';
    const [, membershipId] = /^\/jobs\/in-house-applicators\/(\d+)\/attendance\/$/.exec(endpoint) || [];
    return membershipId ? `/module/employees?membershipId=${membershipId}` : null;
  }
  return null;
}
