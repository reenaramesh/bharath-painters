"""Single-owner rules for profile fields that exist on more than one model.

The contractor company profile and the multi-trade provider profile both carry
service coverage and business experience, and both carry a workforce count under
different names. Before this module they were edited in two separate screens and
silently drifted apart.

The merged UI edits each shared concept once. The other record is kept as a
compatibility mirror so existing consumers (quotations, the public contractor
directory, the network filters) keep working unchanged. Legacy API fields stay
writable aliases: explicit writes synchronize the records, while PATCH omission
never changes a shared value or resolves pre-existing conflicts:

    concept            owner                 mirror
    ------------------ --------------------- ---------------------------
    service areas      ContractorProfile     ProviderProfile.service_areas
    years in business  ContractorProfile     ProviderProfile.years_in_business
    team size          ProviderProfile       ContractorProfile.number_of_painters

`ContractorProfile.number_of_painters` is a legacy alias of `team_size`: the
merged settings page shows one "Team size" input, so the two names must never
hold different values. It is not the count of actual team memberships, which is
computed from user relations elsewhere.
"""

from .models import BharathUser, ContractorProfile, ProviderProfile

#: provider field -> contractor field, for the concepts the provider owns.
PROVIDER_OWNS = {"team_size": "number_of_painters"}

#: contractor field -> provider field, for the concepts the contractor owns.
CONTRACTOR_OWNS = {
    "service_areas": "service_areas",
    "years_in_business": "years_in_business",
}

def mirror_provider_to_contractor(provider):
    """Copy the provider-owned workforce count onto the contractor profile."""
    if provider.user.role != BharathUser.Roles.CONTRACTOR:
        return False
    contractor = ContractorProfile.objects.filter(user=provider.user).first()
    if contractor is None:
        return False
    if contractor.number_of_painters == provider.team_size:
        return False
    contractor.number_of_painters = provider.team_size
    contractor.save(update_fields=["number_of_painters", "updated_at"])
    return True


def mirror_contractor_to_provider(contractor, supplied_fields=None):
    """Copy the contractor-owned coverage and experience onto the provider."""
    provider = ProviderProfile.objects.filter(user=contractor.user).first()
    if provider is None:
        return False
    changed = []
    for source, target in CONTRACTOR_OWNS.items():
        if supplied_fields is not None and source not in supplied_fields:
            continue
        value = getattr(contractor, source)
        if getattr(provider, target) != value:
            setattr(provider, target, value)
            changed.append(target)
    if not changed:
        return False
    provider.save(update_fields=[*changed, "updated_at"])
    return True


def reconcile_contractor_shared_fields(contractor):
    """Seed a newly created provider from existing company details.

    Used when the provider profile is created for the first time, so an account
    that already had company details does not start life with blank mirrors.
    Call only at provider creation; never reconcile conflicting existing data
    on read or infer that a deliberate zero means an omitted value.
    """
    provider = ProviderProfile.objects.filter(user=contractor.user).first()
    if provider is None:
        return False
    changed = []
    for source, target in CONTRACTOR_OWNS.items():
        contractor_value = getattr(contractor, source)
        provider_value = getattr(provider, target)
        if provider_value == contractor_value:
            continue
        winner = contractor_value
        if getattr(provider, target) != winner:
            setattr(provider, target, winner)
            changed.append(target)
    team = contractor.number_of_painters
    if provider.team_size != team:
        provider.team_size = team
        changed.append("team_size")
    if not changed:
        return False
    provider.save(update_fields=[*changed, "updated_at"])
    return True
