export default async function run(page) {
  const origin = new URL(page.url()).origin;
  const checks = [], errors = [], saved = [];
  const verify = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const photo = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const user = { id: 92031, role: "CUSTOMER", first_name: "Profile", last_name: "Photo", mobile: "9000000031", email: "photo@example.test", is_verified: true, verification_status: "VERIFIED", branding: null };
  const customer = { name: "Profile Photo", customer_id: "CUS-TEST", mobile: user.mobile, email: user.email, address: "", city: "", pincode: "", profile_photo: photo, profile_photo_position: { x: 50, y: 50, zoom: 1 }, email_verified: true };
  const employee = { name: "Profile Employee", profile_photo: photo, profile_photo_position: { x: 50, y: 50, zoom: 1 }, mobile: "9000000032", email: "employee@example.test", bharath_id: "EMP-TEST", experience_years: 3, skills: "Cleaning", preferred_locations: "Bengaluru", emergency_contact_name: "", emergency_contact_number: "", blood_group: "", permanent_address: "", current_location: "Bengaluru", willing_to_travel: false };
  const part = (body, name) => {
    const match = body.match(new RegExp(`name="${name}"\\r\\n(?:Content-Type: application/json\\r\\n)?\\r\\n([^\\r]+)`));
    if (!match) throw new Error(`Missing multipart form field ${name}`);
    return match[1];
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/accounts/me/")) return reply(user);
    if (path.endsWith("/accounts/customer-profile/")) {
      if (request.method() === "GET") return reply(customer);
      const payload = request.postData() || "";
      customer.profile_photo_position = JSON.parse(part(payload, "profile_photo_position"));
      saved.push({ role: user.role, position: customer.profile_photo_position });
      return reply(customer);
    }
    if (path.endsWith("/jobs/applicator-profile/")) {
      if (request.method() === "GET") return reply(employee);
      const payload = request.postData() || "";
      employee.profile_photo_position = JSON.parse(part(payload, "profile_photo_position"));
      saved.push({ role: user.role, position: employee.profile_photo_position });
      return reply(employee);
    }
    if (path.endsWith("/accounts/provider-profile/")) return reply({ core_service: 1, additional_services: [], service_claims: [], is_draft: true, branding: { workspace_name: "Bharath Apps", employee_singular_label: "Employee" } });
    if (path.endsWith("/service-categories/") || path.endsWith("/work-descriptions/")) return reply([]);
    if (path.endsWith("/portal-notifications/")) return reply({ messages: 0 });
    if (path.endsWith("/notifications/")) return reply({ results: [], unread_count: 0 });
    if (path.endsWith("/applicator-bookings/")) return reply({ results: [], notification_count: 0 });
    return reply({ results: [] });
  });

  async function setRoleAndNavigate(role, path) {
    user.role = role;
    user.branding = role === "PAINTER" ? { platform_name: "Bharath Apps", workspace_name: "Bharath Apps", employee_singular_label: "Employee", employee_plural_label: "Employees" } : null;
    await page.evaluate((record) => {
      localStorage.setItem("bharath_user", JSON.stringify(record));
      localStorage.setItem("bharath_access", "isolated-profile-image-fixture");
    }, user);
    const separator = path.includes("?") ? "&" : "?";
    await page.goto(`${origin}${path}${separator}fixture=${role}`);
    await page.waitForLoadState("domcontentloaded");
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await setRoleAndNavigate("CUSTOMER", "/customer/profile");
  await page.getByRole("heading", { name: "My profile", exact: true }).waitFor();
  await page.getByRole("button", { name: "Adjust position" }).click();
  await page.getByLabel("Profile photo zoom").evaluate((input) => { input.value = "1.6"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.getByRole("button", { name: "Apply position" }).click();
  verify((await page.locator("img[data-profile-image-preview='Profile photo']").getAttribute("style")).includes("scale(1.6)"), "Customer profile preview reflects the adjusted zoom before saving");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Profile saved successfully" }).waitFor();
  verify(customer.profile_photo_position.zoom === 1.6, "Customer profile photo position is editable and persists through save");

  await setRoleAndNavigate("PAINTER", "/settings?tab=personal");
  await page.getByRole("heading", { name: "Personal details", exact: true }).waitFor();
  await page.getByRole("button", { name: "Adjust position" }).click();
  await page.getByLabel("Profile photo zoom").evaluate((input) => { input.value = "1.8"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.getByRole("button", { name: "Apply position" }).click();
  verify((await page.locator("img[data-profile-image-preview='Profile photo']").getAttribute("style")).includes("scale(1.8)"), "Employee profile preview reflects the adjusted zoom before saving");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "profile saved successfully" }).waitFor();
  verify(employee.profile_photo_position.zoom === 1.8, "Employee profile photo position is editable and persists through save");
  verify(saved.length === 2 && saved.every((item) => item.position.x >= 0 && item.position.x <= 100), "Customer and employee position saves submit normalized crop metadata");

  await page.setViewportSize({ width: 390, height: 844 });
  verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Employee profile adjustment has no horizontal overflow on mobile");
  verify(errors.length === 0, "No uncaught browser errors during customer and employee edits");
  return { passed: checks.length, checks, saved, errors, fixture: "isolated API fixtures; no database or real account changes" };
}
