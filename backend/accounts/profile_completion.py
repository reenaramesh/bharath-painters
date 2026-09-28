"""Company profile completeness for contractor onboarding."""


def contractor_profile_completion(profile):
    fields = {
        "company_name": bool(profile.company_name.strip()),
        "company_logo": bool(profile.company_logo),
        "owner_photo": bool(profile.user.profile_photo),
        "office_address": bool(profile.office_address.strip()),
        "service_areas": bool(profile.service_areas.strip()),
        "work_skills": bool(profile.work_skills.strip()),
        "years_in_business": profile.years_in_business > 0,
        "number_of_workers": profile.number_of_painters > 0,
    }
    return {
        "percent": round(sum(fields.values()) * 100 / len(fields)),
        "missing": [name for name, complete in fields.items() if not complete],
    }
