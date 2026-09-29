function clean(value, fallback = "") {
  return String(value || fallback).trim();
}

function contractorLines(contractor) {
  const name = clean(contractor?.display_name, "Your painting contractor");
  const id = clean(contractor?.bharath_id);
  const mobile = clean(contractor?.mobile);
  return [
    `Contractor: ${name}`,
    id ? `Contractor ID: ${id}` : "",
    mobile ? `Contact: ${mobile}` : "",
  ].filter(Boolean);
}

export function buildCustomerWelcomeMessage(customer, contractor, origin = window.location.origin) {
  const customerName = clean(customer?.name, "Customer");
  const contractorName = clean(customer?.contractor_name || contractor?.display_name || contractor?.company_name || contractor?.name, "Your Contractor");
  const invitationUrl = customer?.share_link ? `${origin}${customer.share_link}` : `${origin}/customer-register`;
  const services = Array.isArray(contractor?.services)
    ? contractor.services.map((item) => clean(item?.name || item)).filter(Boolean)
    : [];
  const serviceText = services.length
    ? services.map((service) => `- ${service}`).join("\n")
    : "- Professional painting and related services";

  return [
    `Hello ${customerName},`,
    "",
    customer?.link_purpose === "CONNECTION" ? `*${contractorName}* has sent you a connection request on Bharath Painters.` : `Thank you for connecting with *${contractorName}*.`,
    customer?.link_purpose === "ACTIVATION" && (customer?.bharath_id || customer?.customer_id) ? `Customer ID: ${customer.bharath_id || customer.customer_id}` : "",
    "",
    "We offer:",
    serviceText,
    "",
    customer?.link_purpose === "CONNECTION" ? "Open this secure link to review the request:" : "Open this secure link to activate your customer account:",
    invitationUrl,
    "",
    "Through your account, you can:",
    "- View quotations and measurements",
    "- Approve or reject quotations",
    "- Confirm work schedules",
    "- Track project progress",
    "- View invoices and payment records",
    `- Communicate with ${contractorName}`,
    "- Request services in the future",
    "",
    "Please use this link only for your account and do not share it with others.",
    "",
    "Regards,",
    `*${contractorName}*`,
  ].join("\n");
}

export function buildPainterWelcomeMessage(painter, contractor, origin = window.location.origin) {
  const painterName = clean(painter?.name, "Paint Applicator");
  return [
    `Dear ${painterName},`,
    "Welcome to the Bharath Painters network.",
    "Your Paint Applicator profile has been created free of charge by the contractor below. You can use the platform for work opportunities, assignments and professional communication.",
    painter?.bharath_id ? `Painter ID: ${painter.bharath_id}` : "",
    painter?.mobile ? `Registered mobile: ${painter.mobile}` : "",
    painter?.password ? `Temporary password: ${painter.password}` : "",
    `Sign in: ${origin}/login`,
    "For your security, please change the temporary password after signing in and do not share it with anyone.",
    ...contractorLines(contractor),
    "Bharath Painters - Skilled People. Better Spaces.",
  ].filter(Boolean).join("\n\n");
}

export function whatsappNumber(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}
