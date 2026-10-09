// Explicit public-presentation whitelist: never forward account/settings objects.
const list = value => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) : [];

export function mapContractorProfile(data, directory = {}, { isOwnProfile = false } = {}) {
  const card = data?.digital_card || {};
  const projects = list(card.projects).map(project => ({
    id: project.id, title: project.title, location: project.location, image: project.photo,
    buildingName: project.apartment_community || project.title,
    address: isOwnProfile ? project.address || project.location : project.location,
    services: project.work_completed,
  }));
  const areas = list(card.service_areas?.length ? card.service_areas : directory.service_areas || directory.base_location);
  const services = [...new Set([
    ...list(card.services?.length ? card.services : directory.services),
    ...list(card.work_skills || directory.work_skills),
  ])].map(name => ({ id: name, name }));
  const reviews = list(card.customer_reviews?.items).map(review => ({
    id: review.id, customerName: review.customer_name, rating: review.rating,
    date: review.date ? new Date(review.date).toLocaleDateString('en-IN') : undefined,
    text: review.comment,
  }));
  return {
    id: directory.id || card.bharath_id,
    name: card.title || directory.company_name || directory.business_name || directory.owner_name,
    contractorName: card.owner_name || directory.owner_name,
    coreService: card.services?.[0] || directory.services?.[0],
    contractorType: card.profession_label && card.profession_label.toLowerCase() !== 'contractor'
      ? card.profession_label
      : (card.services?.[0] || directory.services?.[0]) ? `${card.services?.[0] || directory.services?.[0]} contractor` : undefined,
    avatar: card.owner_photo || directory.profile_photo || card.logo || directory.company_logo,
    avatarShape: (card.logo_shape || directory.company_logo_shape) === 'RECTANGLE' ? 'rectangle' : 'circle',
    avatarPosition: card.owner_photo ? card.owner_photo_position : directory.profile_photo ? directory.profile_photo_position : card.logo ? card.logo_position : directory.company_logo_position,
    companyLogo: card.logo || directory.company_logo,
    companyLogoPosition: card.logo_position || directory.company_logo_position,
    coverImage: card.background || projects.find(project => project.image)?.image,
    coverPosition: card.background ? card.background_position : undefined,
    verified: card.verified === true || directory.verification_status === 'VERIFIED',
    rating: card.customer_reviews?.count > 0 ? card.customer_reviews.rating : undefined,
    reviewCount: card.customer_reviews?.count > 0 ? card.customer_reviews.count : undefined,
    experienceYears: card.years_in_business ?? directory.years_in_business ?? undefined,
    establishedYear: card.business_established_date ? Number(card.business_established_date.slice(0, 4)) : undefined,
    location: directory.base_location || areas[0],
    about: card.about || undefined,
    teamSize: card.workers ?? directory.number_of_painters ?? undefined,
    projectsCompleted: Array.isArray(card.projects) ? projects.length : undefined,
    serviceAreaLabel: areas[0],
    galleryCount: projects.filter(project => project.image).length,
    services, projects, serviceAreas: areas, reviews,
    socialLinks: list(card.social_links).filter(link => {
      try { return ['https:', 'http:'].includes(new URL(link.url).protocol); } catch { return false; }
    }).map(link => ({ key: link.key, label: link.label, url: link.url, icon: typeof link.icon === 'string' && link.icon.length <= 24000 && /^data:image\/(png|jpeg|webp);base64,/.test(link.icon) ? link.icon : undefined })),
    verifications: card.verified === true ? ['Bharath verified profile'] : [],
  };
}
