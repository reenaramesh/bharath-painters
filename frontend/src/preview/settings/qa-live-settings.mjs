export default async function run(page) {
  const results = [], pageErrors = [], saves = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  let failSave = false;
  const user = { id: 92001, role: "CONTRACTOR", first_name: "Sample", last_name: "Owner", mobile: "9000000000", email: "owner@example.test", preferred_language: "en", is_verified: true, verification_status: "VERIFIED", branding: { workspace_name: "Bharath Painters" } };
  const company = {
    company_name: "Sample company", owner_name: "Sample Owner", mobile: user.mobile, email: user.email, office_address: "Office address", service_areas: "Bengaluru", work_skills: "Historic restoration, custom finishes", years_in_business: 8, number_of_painters: 12,
    company_logo: null, profile_photo: null, gst_document: "https://example.test/existing.pdf", business_document: null, company_logo_shape: "RECTANGLE", default_measurement_unit: "FEET",
    bank_account_name: "", bank_account_number: "", bank_name: "", bank_branch: "", bank_ifsc: "", upi_id: "", gst_number: "", pan_number: "", website: "https://example.test", google_business_url: "", facebook_url: "", instagram_url: "", pinterest_url: "", whatsapp_number: "", extra_social_links: [{ label: "Portfolio", url: "https://example.test/portfolio" }],
    app_primary_color: "#176B9B", app_accent_color: "#508398", pdf_color_template: "FOREST", pdf_font_template: "CLASSIC", pdf_custom_primary_color: "#142743", pdf_custom_accent_color: "#FF991F", pdf_custom_text_color: "#172033", profile_completion: { percent: 60, missing: [] },
  };
  const provider = { core_service: 1, additional_services: [2], headline: "Professional headline", tagline: "Existing tagline", about: "Existing introduction", base_location: "Work base", team_size: 12, service_areas: "Bengaluru", years_in_business: 8, workspace_name_override: "", accepts_subcontract_work: true, network_opt_in: true, is_draft: true, is_published: false,
    service_claims: [{ category: 1, work_description: 11, work_description_name: "Interior", note: "Preserve me", is_active: false }, { category: 2, work_description: 21, work_description_name: "Leaks", note: "Another note", is_active: true }, { category: 2, work_description: null, note: "General claim", is_active: true }] };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/accounts/me/")) return reply(user);
    if (path.endsWith("/accounts/contractor-profile/")) return reply(company);
    if (path.endsWith("/accounts/business-settings/")) {
      if (request.method() === "GET") return reply({ company, provider });
      const body = request.postData() || "";
      const jsonPart = (name) => {
        const match = body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`));
        if (!match) throw new Error(`Missing multipart ${name}`);
        return JSON.parse(match[1]);
      };
      const change = { company: jsonPart("company"), provider: jsonPart("provider"), body };
      saves.push(change);
      if (failSave) return reply({ provider: { headline: ["Simulated validation failure"] } }, 400);
      Object.assign(company, change.company); Object.assign(provider, change.provider);
      if ("team_size" in change.provider) company.number_of_painters = change.provider.team_size;
      if ("service_areas" in change.company) provider.service_areas = change.company.service_areas;
      if ("years_in_business" in change.company) provider.years_in_business = change.company.years_in_business;
      if (body.includes('name="profile_photo"')) company.profile_photo = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      if (body.includes('name="gst_document"')) company.gst_document = "https://example.test/uploaded.pdf";
      if (body.includes('name="publish"')) { provider.is_published = true; provider.is_draft = false; }
      user.first_name = company.owner_name.split(" ")[0]; user.mobile = company.mobile;
      user.branding.workspace_name = provider.workspace_name_override || (provider.core_service === 2 ? "Bharath Plumbers" : "Bharath Painters");
      return reply({ company, provider });
    }
    if (path.endsWith("/service-categories/")) return reply([{ id: 1, name: "Painting", workspace_name: "Bharath Painters" }, { id: 2, name: "Plumbing", workspace_name: "Bharath Plumbers" }, { id: 3, name: "Electrical", workspace_name: "Bharath Electricians" }]);
    if (path.endsWith("/work-descriptions/")) return reply([{ id: 11, name: "Interior", service_category: 1 }, { id: 21, name: "Leaks", service_category: 2 }, { id: 31, name: "Wiring", service_category: 3 }]);
    if (path.endsWith("/portal-notifications/")) return reply({ messages: 2 });
    if (path.endsWith("/notifications/")) return reply({ results: [], unread_count: 0 });
    if (path.endsWith("/applicator-bookings/")) return reply({ results: [], notification_count: 0 });
    return reply({ results: [] });
  });
  await page.evaluate((record) => { localStorage.setItem("bharath_user", JSON.stringify(record)); localStorage.setItem("bharath_access", "isolated-settings-ui-fixture"); localStorage.removeItem("bharath_refresh"); localStorage.setItem("bp-sidebar-collapsed", "0"); }, user);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/settings?tab=company");
  await page.waitForSelector(".msp-live");
  check(await page.getByRole("tab").count() === 2, "Live contractor Settings has Business details and Appearance only");
  check(await page.locator(".msp-live form").count() === 1, "One live form and one Save changes action");
  for (const name of ["company_name", "core_service", "service_areas", "years_in_business", "team_size", "work_skills", "base_location", "office_address"]) {
    check(await page.locator(`.msp-live [name='${name}']`).count() === 1, `${name}: one editable field`);
  }
  check(await page.locator("input[name='team_size']").inputValue() === "12", "Declared workforce loaded from provider");
  check(await page.locator("textarea[name='work_skills']").inputValue() === company.work_skills, "Existing free-text skills loaded intact");
  check(await page.locator(".msp-live .bp-section-card header p").count() === 0, "Business help paragraphs removed");
  check(await page.getByRole("link", { name: "View QR profile", exact: true }).getAttribute("href") === "/profile", "QR link opens real profile flow");
  check(await page.getByRole("link", { name: "View QR profile", exact: true }).getAttribute("target") === "_blank", "QR profile opens separately to preserve unsaved Settings");
  check(await page.locator(".msp-file-field a[href='https://example.test/existing.pdf']").count() === 1, "Existing document remains accessible");
  await page.locator("input[name='email']").fill("invalid-email");
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "email");
  check(saves.length === 0, "Hidden invalid field is focused before any API save");
  await page.locator("input[name='email']").fill("owner@example.test");
  await page.locator("input[name='company_name']").fill("Updated company");
  await page.locator("input[name='team_size']").fill("0");
  await page.locator("input[name='service_areas']").fill("Mysuru");
  await page.locator("input[name='owner_name']").fill("Updated Owner");
  await page.locator("select[name='core_service']").selectOption("2");
  check(await page.locator("input[name='additional_services'][value='2']").count() === 0, "New core cannot also be additional");
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.locator("input[name='app_primary_color']").fill("#276749");
  check(await page.locator("select[name='pdf_font_template']").count() === 0, "Existing document font tile UI is reused");
  check(await page.getByRole("button", { name: /Classic/ }).getAttribute("aria-pressed") === "true", "Existing PDF font preserved");
  await page.getByRole("tab", { name: "Business details", exact: true }).click();
  check(await page.locator("input[name='company_name']").inputValue() === "Updated company", "Edits survive Appearance switch");
  failSave = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Simulated validation failure" }).waitFor();
  check(await page.locator("input[name='company_name']").inputValue() === "Updated company", "Failed save retains unsaved values");
  check(company.company_name === "Sample company", "Failed fixture save did not update records");
  failSave = false;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
  const sent = saves.at(-1);
  check(sent.company.service_areas === "Mysuru" && !Object.hasOwn(sent.provider, "service_areas"), "Service areas sent only to company owner");
  check(sent.provider.team_size === 0 && !Object.hasOwn(sent.company, "number_of_painters"), "Explicit zero workforce sent only to provider owner");
  check(sent.company.app_primary_color === "#276749", "Business and Appearance changes save together");
  check(sent.provider.service_claims.find((claim) => claim.work_description === 11)?.note === "Preserve me", "Existing sub-service note preserved");
  check(sent.provider.service_claims.some((claim) => claim.work_description === null && claim.note === "General claim"), "Legacy category-only claim preserved");
  await page.waitForFunction(() => document.querySelector(".ws-nav-brand div span")?.textContent === "Bharath Plumbers");
  check(true, "Auth-dependent workspace branding refreshed after save");
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.locator("input[name='app_accent_color']").fill("#77AA99");
  check(await page.getByRole("status").filter({ hasText: "Unsaved changes" }).count() === 1, "Appearance edit clears stale Saved feedback");
  await page.getByRole("tab", { name: "Business details", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.locator("input[name='headline']").fill("Another edit");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  check(await page.locator("input[name='headline']").inputValue() === "Professional headline", "Discard restores last server-confirmed data");
  await page.getByRole("button", { name: "Remove GST certificate", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
  check(saves.at(-1).company.gst_document === null, "Document removal sent as explicit null");
  const image = { name: "owner.gif", mimeType: "image/gif", buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") };
  await page.getByLabel("Owner photo", { exact: true }).setInputFiles(image);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
  check(saves.at(-1).body.includes('name="profile_photo"'), "Owner photo uses existing profile_photo upload field");
  await page.locator("select[name='profile_status']").selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved." }).waitFor();
  check(provider.is_published && saves.at(-1).body.includes('name="publish"'), "Published status uses real publish operation");
  check(await page.locator("select[name='profile_status'] option[value='READY']").count() === 0, "Published profile does not offer unsupported unpublish operation");
  const saveCount = saves.length;
  await page.locator("select[name='core_service']").selectOption("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "core_service");
  check(saves.length === saveCount, "Published profile requires core service before saving");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/settings-live-merged-desktop.png" });
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/settings-live-merged-appearance.png" });
  await page.getByRole("tab", { name: "Business details", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Live Settings has no horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/settings-live-merged-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ["/settings?tab=trade", "/settings?tab=company", "/provider-profile", "/applicator-profile"]) {
    await page.goto(`http://127.0.0.1:5173${path}`);
    await page.waitForSelector("#merged-tab-business[aria-selected='true']");
    check(true, `${path}: opens merged Business details`);
  }
  await page.goto("http://127.0.0.1:5173/contractor-theme");
  await page.waitForSelector("#merged-tab-appearance[aria-selected='true']");
  check(true, "Legacy contractor-theme opens Appearance");
  check(pageErrors.length === 0, "No uncaught application errors");
  return { passed: results.length, results, saves: saves.map(({ company, provider }) => ({ company, provider })), pageErrors, apiMode: "isolated fixtures against live layout; expected 400 save failure exercised" };
}
