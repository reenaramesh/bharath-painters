export default async function run(page) {
  const results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const base = "http://localhost:5173/preview/sidebar";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector(".navp-sidebar");
  await page.evaluate(() => { localStorage.removeItem("bp-nav-preview-collapsed"); localStorage.removeItem("bp-nav-preview-groups"); });
  await page.goto(base); await page.waitForSelector(".navp-sidebar");
  check(await page.locator(".navp-sidebar").evaluate((el) => el.getBoundingClientRect().width) === 250, "Desktop width 250px");
  const roleSelect = page.getByLabel("Role", { exact: true });
  let testedDestinations = 0;
  for (const role of ["CONTRACTOR", "PAINTER", "CUSTOMER", "ADMIN", "SUPPORT"]) {
    await roleSelect.selectOption(role);
    await page.waitForFunction((expected) => document.querySelector(".navp-scroll")?.getAttribute("aria-label") === `${expected === "PAINTER" ? "Employee" : expected.toLowerCase()} menu`, role);
    const buttons = page.locator(".navp-inventory button");
    const count = await buttons.count();
    check(count > 0, `${role}: menu has implemented destinations`);
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const route = await button.locator("code").innerText();
      await button.click();
      await page.waitForFunction((expected) => new URLSearchParams(location.search).get("page") === expected, route);
      const active = page.locator(".navp-sidebar [aria-current=page]");
      check(await active.count() === 1, `${role} ${route}: one active destination`);
      check(await page.locator(".navp-destination a").getAttribute("href") === route, `${role} ${route}: correct real module link`);
      testedDestinations++;
    }
    const destinations = await page.locator(".navp-inventory code").allTextContents();
    if (role !== "CONTRACTOR") check(!destinations.includes("/subcontract-work-orders") && !destinations.includes("/customers"), `${role}: no contractor destinations`);
    if (role === "PAINTER") {
      await page.getByLabel("Employment", { exact: true }).selectOption("in-house");
      const inHouse = await page.locator(".navp-inventory code").allTextContents();
      check(inHouse.includes("/in-house-applicators") && !inHouse.includes("/jobs") && !inHouse.includes("/applicator-bookings"), "In-house employee eligibility");
    }
  }
  await roleSelect.selectOption("CONTRACTOR");
  for (const [route, expected] of [["/customers/42/quotations", "/customers"], ["/properties/42/measurements", "/properties"], ["/quotations/42/edit", "/quotations"], ["/subcontract-work-orders/42", "/subcontract-work-orders"], ["/work-changes", "/work-schedules"], ["/work-reschedules", "/work-schedules"], ["/appearance", "/settings"]]) {
    await page.goto(`${base}?page=${encodeURIComponent(route)}`); await page.waitForSelector(".navp-sidebar [aria-current=page]");
    check(await page.locator(".navp-sidebar [aria-current=page]").getAttribute("data-destination") === expected, `${route}: correct parent highlight`);
  }
  await page.goto(`${base}?page=${encodeURIComponent("/customers-extra")}`); await page.waitForSelector(".navp-sidebar");
  check(await page.locator(".navp-sidebar [aria-current=page]").count() === 0, "Similar URL does not activate Customers");
  await page.goto(base); await page.waitForSelector(".navp-sidebar");
  await page.getByRole("button", { name: "Customers & Sales", exact: true }).click();
  check(await page.getByRole("button", { name: "Customers & Sales", exact: true }).getAttribute("aria-expanded") === "false", "Inactive group can collapse");
  await page.reload(); await page.waitForSelector(".navp-sidebar");
  check(await page.getByRole("button", { name: "Customers & Sales", exact: true }).getAttribute("aria-expanded") === "false", "Group preference persists");
  await page.locator(".navp-inventory button").filter({ has: page.locator("code", { hasText: /^\/customers$/ }) }).click();
  await page.waitForSelector(".navp-sidebar [data-destination='/customers'][aria-current='page']");
  check(await page.getByRole("button", { name: "Customers & Sales", exact: true }).getAttribute("aria-expanded") === "true", "Current group auto-expands");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  check(await page.locator(".navp-sidebar").evaluate((el) => el.getBoundingClientRect().width) === 72, "Rail width 72px");
  const group = page.getByRole("button", { name: "Finance", exact: true });
  await group.focus(); await page.keyboard.press("Enter");
  check(await page.locator(".navp-flyout").isVisible(), "Keyboard opens rail group");
  await page.keyboard.press("Escape");
  check(await group.evaluate((el) => el === document.activeElement), "Escape returns focus to rail group");
  await page.reload(); await page.waitForSelector(".navp-sidebar.is-rail");
  check(await page.locator(".navp-sidebar.is-rail").count() === 1, "Rail preference persists");
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/sidebar-rail.png" });
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Use dark appearance", exact: true }).click();
  await page.getByLabel("Long workspace name").check();
  check(await page.locator(".navp-dark").count() === 1, "Dark appearance renders");
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/sidebar-dark.png" });
  await page.getByRole("button", { name: "Use light appearance", exact: true }).click();
  await page.getByLabel("Navigation state", { exact: true }).selectOption("loading");
  check(await page.getByRole("status", { name: "Loading navigation" }).isVisible(), "Loading state renders");
  await page.getByLabel("Navigation state", { exact: true }).selectOption("empty");
  check(await page.locator(".navp-empty").isVisible(), "Empty state renders");
  await page.getByLabel("Navigation state", { exact: true }).selectOption("ready");
  await page.getByLabel("Long workspace name").uncheck();
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/sidebar-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const hamburger = page.getByRole("button", { name: "Open navigation", exact: true });
  await hamburger.click();
  check(await page.getByRole("dialog", { name: "Workspace navigation" }).isVisible(), "Mobile drawer opens");
  check(await page.evaluate(() => document.body.style.overflow === "hidden" && document.querySelector(".navp-main").inert), "Mobile background inert and scroll locked");
  await page.getByRole("button", { name: "Log out preview", exact: true }).focus(); await page.keyboard.press("Tab");
  check(await page.getByRole("button", { name: "Close navigation", exact: true }).evaluate((el) => el === document.activeElement), "Mobile forward focus trap");
  await page.keyboard.press("Shift+Tab");
  check(await page.getByRole("button", { name: "Log out preview", exact: true }).evaluate((el) => el === document.activeElement), "Mobile backward focus trap");
  await page.keyboard.press("Escape");
  check(await hamburger.evaluate((el) => el === document.activeElement), "Mobile Escape returns opener focus");
  check(await page.evaluate(() => document.body.style.overflow !== "hidden"), "Mobile close releases scroll lock");
  await hamburger.click(); await page.locator(".navp-backdrop").click({ position: { x: 350, y: 400 } });
  check(await page.getByRole("dialog").count() === 0, "Backdrop closes mobile drawer");
  await hamburger.click();
  await page.screenshot({ path: "C:/Projects/Bharath Painters Application/output/design-previews/sidebar-mobile.png" });
  await page.locator(".navp-sidebar [data-destination='/customers']").click();
  check(await page.getByRole("dialog").count() === 0, "Selecting destination closes mobile drawer");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No horizontal overflow at ${width}px`);
  }
  check(await page.locator(".navp-scroll").evaluate((el) => el.scrollHeight > el.clientHeight), "Short desktop list scrolls with pinned footer");
  return { passed: results.length, testedDestinations, results };
}
