"""Paint Areas selection/master controls, using isolated synthetic records."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from qa.quotation_unified_verification import BrowserAudit, db_read, grouped_fixture
from django.conf import settings
from django.test.runner import DiscoverRunner
from quotations.models import Quotation, ServiceCategory, PaintType, PaintBrand, WorkDescription
from playwright.sync_api import sync_playwright
from accounts.models import BharathUser
import django

OUT = Path(__file__).resolve().parents[2] / "docs/previews/paint-areas"


class PaintAreas(BrowserAudit):
    test_browser_workflow = None
    item = grouped_fixture.GroupedSpecificationTests.item

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.contractor)
        response = self.client.post("/api/quotations/create/", {"customer": self.customer.pk, "property": self.property.pk,
            "measurement_record": self.measurement.pk, "quotation_type": "MEASUREMENT", "rooms": [],
            "items": grouped_fixture.GroupedSpecificationTests.split(self), "gst_mode": "NO_GST"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.quote_id = response.data["id"]

    def test_paint_area_selection_and_master_save(self):
        OUT.mkdir(parents=True, exist_ok=True)
        result = {"steps": [], "screenshots": [], "errors": []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            def route_api(route):
                parsed = urlsplit(route.request.url)
                try:
                    response = context.request.fetch(self.live_server_url + parsed.path + ("?" + parsed.query if parsed.query else ""), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
                    route.fulfill(response=response)
                except Exception as error:
                    reason = str(error).split("Call log:", 1)[0].splitlines()[0]
                    if route.request.method == "GET" and any(word in reason.lower() for word in ("already handled", "closed", "disposed")):
                        return
                    result["errors"].append({"path": parsed.path, "reason": reason})
                    route.fulfill(status=503, json={"detail": "QA route unavailable"})
            context.route(re.compile(r"^https?://[^/]+/api/"), route_api)
            page = context.new_page()
            page.on("pageerror", lambda error: result["errors"].append(str(error)))
            def capture(stage):
                for width in [360, 390, 430, 768, 1440]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    if stage == "remaining-room-balances":
                        page.locator('.gq-dialog-body').evaluate('el=>el.scrollTop=el.scrollHeight')
                    elif stage == "materials-top":
                        page.locator('.gq-dialog-body').evaluate('el=>el.scrollTop=0')
                    self.assertEqual(page.evaluate("document.documentElement.scrollWidth"), width)
                    file = f"{stage}-{width}.png"
                    page.screenshot(path=str(OUT/file), full_page=True, animations="disabled")
                    result["screenshots"].append(file)
                page.set_viewport_size({"width": 1440, "height": 1000})
            def counts():
                return db_read(lambda: [model.objects.count() for model in [ServiceCategory, PaintType, PaintBrand, WorkDescription]])
            try:
                page.goto("http://localhost:5173/login")
                page.wait_for_load_state("networkidle")
                page.locator('input[type="text"]').first.fill(self.contractor.mobile)
                page.locator('input[type="password"]').fill("test-pass")
                page.get_by_role("button", name="Sign in", exact=True).click()
                page.wait_for_url("**/dashboard")
                page.goto(f"http://localhost:5173/quotations/{self.quote_id}/edit")
                page.wait_for_load_state("networkidle")
                page.get_by_role("button", name="Continue", exact=True).click()
                page.locator(".gq-assignment-card").filter(has=page.get_by_role("heading", name="Normal Walls", exact=True)).get_by_role("button", name="Edit", exact=True).click()
                dialog = page.get_by_role("dialog", name="Edit Paint Areas", exact=True)
                self.assertEqual(dialog.get_by_role("link", name=re.compile("Services Master")).count(), 0)
                self.assertEqual(dialog.locator('[aria-label="Surface choices"]').count(), 0)
                walls = dialog.locator('[aria-label="Remaining surface areas"] [data-surface="WALL"]')
                self.assertIn("Remaining: 200 sqft", walls.inner_text())
                room = dialog.locator('.gq-room-list .gq-room-option').filter(has_text="Bedroom 1").get_by_role("checkbox")
                room.uncheck()
                self.assertIn("Remaining: 545 sqft", walls.inner_text())
                self.assertIn("Remaining: 345 sqft", dialog.locator('[aria-label="Remaining selection balance"]').inner_text())
                room.check()
                dialog.get_by_role("checkbox", name="Select Ceiling", exact=True).check()
                room.check()
                self.assertIn("Selected: 445 sqft", dialog.locator('[aria-label="Remaining selection balance"]').inner_text())
                capture("surfaces-and-room-balances")
                dialog.locator('[aria-label="Remaining selection balance"]').scroll_into_view_if_needed()
                capture("remaining-room-balances")
                result["steps"].append("Surface checkboxes live on balance cards; room selection recalculates available/selected/remaining quantities; walls plus ceiling total 445")
                dialog.get_by_role("button", name="Continue", exact=True).click()
                self.assertEqual(dialog.get_by_role("combobox", name="Service", exact=True).count(), 0)
                baseline = counts()
                for label, name in [("Service / Product Category", "QA Future Painting"), ("Product", "QA Future Product"), ("Brand", "QA Future Brand")]:
                    dialog.get_by_role("combobox", name=label, exact=True).select_option("__custom__")
                    dialog.get_by_label(f"New {label}", exact=True).fill(name)
                    dialog.get_by_role("checkbox", name=f"Save this {label} to Service Master for future quotations", exact=True).check()
                dialog.get_by_label("Description", exact=True).fill("QA future description")
                dialog.get_by_role("checkbox", name="Save this Description for future quotations", exact=True).check()
                capture("materials-and-future-masters")
                dialog.locator('.gq-dialog-body').evaluate('el=>el.scrollTop=0')
                capture("materials-top")
                dialog.get_by_role("button", name="Save Paint Areas", exact=True).click()
                self.assertEqual(counts(), baseline)
                page.get_by_role("button", name="Continue", exact=True).click()
                self.assertEqual(counts(), baseline)
                self.assertEqual(page.get_by_label("Line 1 quantity", exact=True).input_value(), "445")
                page.get_by_role("button", name="Save draft", exact=True).click()
                page.wait_for_url(re.compile(r"/quotations/\d+$"))
                self.assertEqual(counts(), [n+1 for n in baseline])
                self.assertEqual(db_read(lambda: str(Quotation.objects.get(pk=self.quote_id).grand_total)), "5700.00")
                result["steps"].append("Save Paint Areas and Continue are local; explicit atomic Save Draft creates four opted-in masters once and total is 5700")
                page.get_by_role("link", name="Edit Draft", exact=True).click()
                page.wait_for_load_state("networkidle")
                page.get_by_role("button", name="Continue", exact=True).click()
                page.locator(".gq-assignment-card").filter(has=page.get_by_role("heading", name="Normal Walls", exact=True)).get_by_role("button", name="Edit", exact=True).click()
                dialog = page.get_by_role("dialog", name="Edit Paint Areas", exact=True)
                dialog.get_by_role("button", name="Continue", exact=True).click()
                self.assertIn("QA Future Painting", dialog.get_by_role("combobox", name="Service / Product Category", exact=True).locator("option:checked").inner_text())
                self.assertIn("QA Future Product", dialog.get_by_role("combobox", name="Product", exact=True).locator("option:checked").inner_text())
                self.assertEqual(dialog.get_by_label("Assignment rate", exact=True).input_value(), "10.00")
                capture("reopened-paint-area")
                result["steps"].append("Reopened Edit restores promoted master IDs/names, measured scope and saved rate 10")
                self.assertFalse(result["errors"], result["errors"])
            except Exception as error:
                result["blocker"] = str(error)
                page.screenshot(path=str(OUT/"last-failure.png"), full_page=True)
                raise
            finally:
                (OUT/"browser-results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
                context.unroute_all(behavior="ignoreErrors")
                context.close()
                browser.close()

    def test_customer_dashboard_mobile_shortcut_scroll(self):
        portal = BharathUser.objects.create_user(mobile=self.customer.mobile, password="test-pass", role="CUSTOMER")
        self.customer.portal_user = portal
        self.customer.save(update_fields=["portal_user"])
        OUT.mkdir(parents=True, exist_ok=True)
        result = {"screenshots": [], "errors": []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 360, "height": 1000})
            def route_api(route):
                parsed = urlsplit(route.request.url)
                response = context.request.fetch(self.live_server_url + parsed.path + ("?" + parsed.query if parsed.query else ""), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
                route.fulfill(response=response)
            context.route(re.compile(r"^https?://[^/]+/api/"), route_api)
            page = context.new_page()
            page.on("pageerror", lambda error: result["errors"].append(str(error)))
            try:
                page.goto("http://localhost:5173/login")
                page.wait_for_load_state("networkidle")
                page.locator('input[type="text"]').first.fill(portal.mobile)
                page.locator('input[type="password"]').fill("test-pass")
                page.get_by_role("button", name="Sign in", exact=True).click()
                page.wait_for_url("**/customer-dashboard")
                strip = page.locator('.customer-dashboard-page .bp-dashboard-shortcut-scroll')
                strip.wait_for(state="visible")
                links = strip.locator('a').evaluate_all("els=>els.map(el=>el.getAttribute('href'))")
                self.assertGreater(len(links), 0)
                for width in [360, 390, 430]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    self.assertEqual(page.evaluate('document.documentElement.scrollWidth'), width)
                    self.assertTrue(strip.evaluate('el=>el.scrollWidth > el.clientWidth'))
                    self.assertEqual(strip.locator('.bp-dashboard-shortcut-items').evaluate("el=>getComputedStyle(el).display"), "flex")
                    strip.locator('a').last.evaluate('el=>el.blur()')
                    strip.evaluate('el=>el.scrollLeft=0')
                    file = f"customer-shortcuts-{width}.png"
                    page.screenshot(path=str(OUT/file), full_page=True, animations="disabled")
                    result['screenshots'].append(file)
                    strip.locator('a').last.focus()
                    page.wait_for_function("document.querySelector('.customer-dashboard-page .bp-dashboard-shortcut-scroll').scrollLeft > 0")
                    self.assertGreater(strip.evaluate('el=>el.scrollLeft'), 0)
                    self.assertEqual(strip.locator('a').evaluate_all("els=>els.map(el=>el.getAttribute('href'))"), links)
                    file = f"customer-shortcuts-scrolled-{width}.png"
                    page.screenshot(path=str(OUT/file), full_page=True, animations="disabled")
                    result['screenshots'].append(file)
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.screenshot(path=str(OUT/'customer-dashboard-1440.png'), full_page=True)
                self.assertFalse(result['errors'], result['errors'])
            finally:
                (OUT/'customer-shortcuts-results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
                context.unroute_all(behavior='ignoreErrors')
                context.close()
                browser.close()


if __name__ == "__main__":
    settings.MIGRATION_MODULES = {app.label: None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1, interactive=False).run_tests(["__main__.PaintAreas"]))
