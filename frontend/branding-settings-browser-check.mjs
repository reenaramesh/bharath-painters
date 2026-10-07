export default async function run(page) {
  const origin = new URL(page.url()).origin;
  const checks = [], errors = [], patches = [], badModules = [];
  const verify = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const user = { id: 92011, role: "CONTRACTOR", first_name: "Brand", last_name: "Test", mobile: "9000000011", email: "brand@example.test", is_verified: true, verification_status: "VERIFIED", branding: { platform_name: "Bharath Apps", workspace_name: "Bharath Apps", contractor_label: "Contractor" } };
  const image = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const company = { company_name: "Brand Test Services", owner_name: "Brand Test", mobile: user.mobile, email: user.email, company_logo: image, profile_photo: image, company_logo_shape: "RECTANGLE", company_logo_position: { x: 50, y: 50, zoom: 1 }, profile_photo_position: { x: 50, y: 50, zoom: 1 }, profile_completion: { percent: 50, missing: [] } };
  const categories = [
    { id: 1, name: "Painting", workspace_name: "Bharath Painters", contractor_label: "Painter", employee_singular_label: "Employee", employee_plural_label: "Employees", is_active: true, is_provider_selectable: true },
    { id: 3, name: "Cleaning", workspace_name: "Bharath Cleaning Services", contractor_label: "Cleaning Contractor", employee_singular_label: "Cleaner", employee_plural_label: "Cleaners", is_active: true, is_provider_selectable: true },
  ];
  const provider = { core_service: 1, additional_services: [], service_claims: [], headline: "", about: "", base_location: "", years_in_business: 0, team_size: 0, workspace_name_override: "", tagline: "", accepts_subcontract_work: false, network_opt_in: true, is_draft: true, is_published: false, brand_snapshot: {}, branding: { platform_name: "Bharath Apps", workspace_name: "Bharath Painters", contractor_label: "Painter", employee_singular_label: "Painter", employee_plural_label: "Painters" } };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script" && (response.headers()["content-type"] || "").includes("application/json")) badModules.push({ url: response.url(), body: (await response.text()).slice(0, 500) });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/accounts/me/")) return reply(user);
    if (path.endsWith("/accounts/business-settings/")) {
      if (request.method() === "GET") return reply({ company, provider });
      const body = request.postData() || "";
      const part = (name) => {
        const match = body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`));
        if (!match) throw new Error(`Missing settings payload part ${name}`);
        return JSON.parse(match[1]);
      };
      const companyPatch = part("company"), providerPatch = part("provider");
      patches.push({ company: companyPatch, provider: providerPatch });
      Object.assign(company, companyPatch);
      Object.assign(provider, providerPatch);
      if (Object.hasOwn(providerPatch, "core_service")) {
        const selected = categories.find((row) => row.id === provider.core_service);
        provider.branding = selected ? { platform_name: "Bharath Apps", workspace_name: selected.workspace_name, contractor_label: selected.contractor_label, employee_singular_label: selected.employee_singular_label, employee_plural_label: selected.employee_plural_label } : { platform_name: "Bharath Apps", workspace_name: "Bharath Apps", contractor_label: "Contractor", employee_singular_label: "Employee", employee_plural_label: "Employees" };
      }
      user.branding = provider.branding;
      return reply({ company, provider });
    }
    if (path.endsWith("/service-categories/")) return reply(categories);
    if (path.endsWith("/work-descriptions/")) return reply([]);
    if (path.endsWith("/portal-notifications/")) return reply({ messages: 0 });
    if (path.endsWith("/notifications/")) return reply({ results: [], unread_count: 0 });
    if (path.endsWith("/applicator-bookings/")) return reply({ results: [], notification_count: 0 });
    return reply({ results: [] });
  });
  await page.evaluate((record) => {
    localStorage.setItem("bharath_user", JSON.stringify(record));
    localStorage.setItem("bharath_access", "isolated-branding-fixture");
    localStorage.removeItem("bharath_refresh");
    localStorage.setItem("bp-sidebar-collapsed", "0");
  }, user);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/settings`);
  await page.waitForSelector(".msp-live", { timeout: 8000 }).catch(async () => { throw new Error(`Settings page did not mount; bad module responses=${JSON.stringify(badModules)}; resources=${JSON.stringify(await page.evaluate(() => performance.getEntriesByType("resource").map((row) => row.name)))}`); });
  verify(await page.getByRole("button", { name: "Adjust position", exact: true }).count() === 2, "Company logo and owner photo both have position controls");
  await page.getByRole("button", { name: "Adjust position", exact: true }).nth(0).click();
  await page.getByLabel("Company logo zoom").evaluate((input) => { input.value = "1.5"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.getByRole("button", { name: "Apply position" }).click();
  await page.getByRole("button", { name: "Adjust position", exact: true }).nth(1).click();
  await page.getByLabel("Owner photo zoom").evaluate((input) => { input.value = "1.75"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.getByRole("button", { name: "Apply position" }).click();
  await page.locator("select[name='core_service']").selectOption("3");
  verify(await page.locator("input[name='additional_services'][value='3']").count() === 0, "Core service cannot also be selected as an additional service");
  await page.locator("input[name='additional_services'][value='1']").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
  verify(provider.core_service === 3 && provider.additional_services.includes(1), "Cleaning persists while Painting is added as an additional service");
  verify(patches.at(-1).company.company_logo_position.zoom === 1.5 && patches.at(-1).company.profile_photo_position.zoom === 1.75, "Adjusted logo and owner photo positions persist through the existing Settings save");
  verify(user.branding.workspace_name === "Bharath Cleaning Services" && user.branding.contractor_label === "Cleaning Contractor", "Current workspace identity remains Cleaning after save");
  verify(await page.locator(".ws-nav-brand").innerText().then((text) => text.includes("Bharath Cleaning Services")), "Desktop navigation shows current Cleaning workspace identity");
  await page.locator("input[name='company_name']").fill("Renamed Brand Test Services");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
  verify(provider.core_service === 3 && !Object.hasOwn(patches.at(-1).provider, "core_service"), "Unrelated save omits service fields while retaining the saved core service");
  verify(user.branding.workspace_name === "Bharath Cleaning Services", "Unrelated save does not change current branding");
  await page.reload();
  await page.waitForSelector(".msp-live");
  verify(await page.locator("select[name='core_service']").inputValue() === "3", "Saved core service survives page refresh/sign-in hydration");
  await page.setViewportSize({ width: 390, height: 844 });
  verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile Settings has no horizontal overflow at 390px");
  verify(errors.length === 0, "No uncaught browser errors");
  return { passed: checks.length, checks, errors, fixture: "isolated API responses; no database or real account changes" };
}
