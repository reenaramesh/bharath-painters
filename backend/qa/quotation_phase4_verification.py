"""Opt-in document/sharing/customer response verification; synthetic test DB only."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, unquote

from qa.quotation_unified_verification import BrowserAudit, db_read, grouped_fixture
from accounts.models import BharathUser
from quotations.models import Quotation
from django.conf import settings
from django.test.runner import DiscoverRunner
from playwright.sync_api import sync_playwright
import django
import pymupdf

OUT = Path(__file__).resolve().parents[2] / "docs/previews/quotation-phase4"


class Phase4Browser(BrowserAudit):
    test_browser_workflow = None

    def setUp(self):
        super().setUp()
        self.portal = BharathUser.objects.create_user(mobile=self.customer.mobile, password="test-pass", role="CUSTOMER")
        self.customer.portal_user = self.portal
        self.customer.save(update_fields=["portal_user"])
        self.client.force_authenticate(self.contractor)
        items = [grouped_fixture.GroupedSpecificationTests.item(self, "group", self.walls, [120, 115, 110, 0], "Normal Walls"),
                 grouped_fixture.GroupedSpecificationTests.item(self, "special", [self.walls[-1]], [125], "Texture Wall")]
        payload = {
            "customer": self.customer.pk, "property": self.property.pk, "measurement_record": self.measurement.pk,
            "quotation_type": "MEASUREMENT", "rooms": [], "items": items,
            "discount_mode": "LINE", "gst_mode": "NO_GST", "notes": "Phase 4 document fixture",
            "terms_conditions": "Saved quotation conditions", "payment_terms": "Saved payment agreement",
        }
        response = self.client.post("/api/quotations/create/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.quote_id = response.data["id"]
        declined = self.client.post("/api/quotations/create/", payload, format="json")
        self.assertEqual(declined.status_code, 201, declined.data)
        self.decline_id = declined.data["id"]
        sent = self.client.post(f"/api/quotations/{self.decline_id}/submit/", {}, format="json")
        self.assertEqual(sent.status_code, 200, sent.data)

    def test_documents_sharing_revision_and_responses(self):
        OUT.mkdir(parents=True, exist_ok=True)
        result = {"database": "isolated synthetic test database", "steps": [], "screenshots": [], "page_errors": [], "action_requests": [], "submit_requests": 0}
        fault = {"action": False}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            contexts = []

            def session(user, customer=False):
                context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce", permissions=["clipboard-read", "clipboard-write"])
                contexts.append(context)

                def route_api(route):
                    parsed = urlsplit(route.request.url)
                    if parsed.path.endswith("/action/"):
                        result["action_requests"].append(route.request.post_data)
                        if fault["action"]:
                            fault["action"] = False
                            route.fulfill(status=503, json={"detail": "QA response unavailable. Please retry."})
                            return
                    if parsed.path.endswith("/submit/"):
                        result["submit_requests"] += 1
                    try:
                        response = context.request.fetch(self.live_server_url + parsed.path + ("?" + parsed.query if parsed.query else ""), method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
                        route.fulfill(response=response)
                    except Exception as error:
                        reason = str(error).split("Call log:", 1)[0].splitlines()[0]
                        if route.request.method == "GET" and any(word in reason.lower() for word in ("already handled", "closed", "disposed")):
                            result.setdefault("cancelled_gets", []).append(parsed.path)
                            return
                        result.setdefault("routing_errors", []).append({"path": parsed.path, "method": route.request.method, "reason": reason})
                        try:
                            route.fulfill(status=503, json={"detail": "Isolated QA server unavailable"})
                        except Exception:
                            pass

                context.route(re.compile(r"^https?://[^/]+/api/"), route_api)
                page = context.new_page()
                page.on("pageerror", lambda error: result["page_errors"].append(str(error)))
                page.on("response", lambda response: result.setdefault("http_errors", []).append({"status": response.status, "path": urlsplit(response.url).path}) if response.status >= 400 else None)
                page.goto("http://localhost:5173/login", wait_until="domcontentloaded")
                page.wait_for_load_state("networkidle")
                page.locator('input[type="text"]').first.fill(user.mobile)
                page.locator('input[type="password"]').fill("test-pass")
                page.get_by_role("button", name="Sign in", exact=True).click()
                page.wait_for_url("**/customer-dashboard" if customer else "**/dashboard")
                return page, context

            def capture(page, state):
                for width in [360, 390, 430, 768, 1440]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    page.evaluate("window.scrollTo(0,0)")
                    self.assertEqual(page.evaluate("document.documentElement.scrollWidth"), width, state)
                    if state == "customer-revision-history" and width < 768:
                        cards = page.locator('[aria-label="Net price changes"]')
                        cards.get_by_text("Current net", exact=True).first.wait_for(state="visible")
                        self.assertEqual(cards.get_by_text("Current net", exact=True).count(), 2)
                    name = f"{state}-{width}.png"
                    page.screenshot(path=str(OUT / name), full_page=True, animations="disabled")
                    result["screenshots"].append(name)
                page.set_viewport_size({"width": 1440, "height": 1000})

            def state(quote_id):
                return db_read(lambda: Quotation.objects.get(pk=quote_id).status)

            try:
                owner, owner_context = session(self.contractor)
                owner.goto(f"http://localhost:5173/quotations/new?customer={self.customer.pk}&property={self.property.pk}&measurement={self.measurement.pk}")
                owner.wait_for_load_state("networkidle")
                owner.get_by_label("Valid until", exact=True).fill("2100-01-01")
                owner.get_by_role("button", name="Continue", exact=True).click()
                refresh_dialogs = []
                owner.once("dialog", lambda dialog: (refresh_dialogs.append(dialog.type), dialog.accept()))
                owner.reload(wait_until="domcontentloaded")
                owner.get_by_role("status").filter(has_text="Unsaved inputs restored").wait_for()
                owner.get_by_role("button", name="Previous step", exact=True).click()
                self.assertEqual(refresh_dialogs, ["beforeunload"])
                self.assertEqual(owner.get_by_label("Valid until", exact=True).input_value(), "2100-01-01")
                self.assertEqual(db_read(lambda: Quotation.objects.count()), 2)
                result["steps"].append("Unsaved Create refresh warns, recovers the same stage and validity input, and creates no quotation; URL source selection reloads")
                # Source selections still count as unsaved state even after refresh.
                owner.once("dialog", lambda dialog: dialog.accept())
                owner.goto(f"http://localhost:5173/quotations/{self.quote_id}")
                owner.get_by_role("button", name=re.compile("Submit to Customer|Send Revised Quotation")).wait_for()
                owner.once("dialog", lambda dialog: dialog.dismiss())
                owner.get_by_role("button", name=re.compile("Submit to Customer|Send Revised Quotation")).click()
                self.assertEqual(result["submit_requests"], 0)
                owner.once("dialog", lambda dialog: dialog.accept())
                owner.get_by_role("button", name=re.compile("Submit to Customer|Send Revised Quotation")).click()
                share = owner.get_by_role("dialog", name="Final quotation submitted")
                share.wait_for()
                self.assertEqual(state(self.quote_id), "SENT")
                self.assertIn(f"/customer-quotations/{self.quote_id}", unquote(share.get_by_role("link", name="WhatsApp", exact=True).get_attribute("href")))
                self.assertTrue(share.get_by_role("link", name="Email", exact=True).get_attribute("href").startswith("mailto:"))
                share.get_by_role("button", name="Copy link", exact=True).click()
                share.get_by_role("status").filter(has_text="Portal link copied").wait_for()
                self.assertEqual(owner.evaluate("navigator.clipboard.readText()"), f"http://localhost:5173/customer-quotations/{self.quote_id}")
                capture(owner, "authenticated-share")
                share.get_by_role("button", name="Done", exact=True).click()
                result["steps"].append("Send confirmation cancellation writes nothing; confirmed send issues once; authenticated portal link/WhatsApp/mailto/clipboard inspected without external delivery")

                customer, customer_context = session(self.portal, customer=True)
                customer.goto(f"http://localhost:5173/customer-quotations/{self.quote_id}")
                customer.get_by_role("button", name="Accept quotation", exact=True).wait_for()
                self.assertIn("Walls - Bedroom 1", customer.locator("body").inner_text())
                self.assertIn("Saved quotation conditions", customer.locator("body").inner_text())
                self.assertIn("Saved payment agreement", customer.locator("body").inner_text())
                capture(customer, "customer-issued")
                customer.get_by_role("button", name="Request quotation changes", exact=True).click()
                dialog = customer.get_by_role("dialog", name="What should be changed?")
                dialog.get_by_role("checkbox").first.check()
                dialog.get_by_role("textbox").fill("Apply percentage and fixed discounts to selected work.")
                capture(customer, "revision-request")
                dialog.get_by_role("button", name="Send change request", exact=True).click()
                customer.get_by_role("status").filter(has_text="was created").wait_for()
                revision_id = db_read(lambda: Quotation.objects.get(revision_of_id=self.quote_id).pk)
                customer.reload(wait_until="networkidle")
                self.assertEqual(customer.get_by_role("region", name="Quotation version history").count(), 0)
                result["steps"].append("Customer requests revision; original total unchanged; unsent Draft is hidden from customer history")

                owner.goto(f"http://localhost:5173/quotations/{revision_id}/edit")
                owner.get_by_role("button", name="Continue", exact=True).click()
                owner.get_by_role("button", name="Continue", exact=True).click()
                owner.get_by_label("Line 1 discount type", exact=True).select_option("PERCENTAGE")
                owner.get_by_label("Line 1 discount", exact=True).fill("10")
                owner.get_by_label("Line 2 discount type", exact=True).select_option("FIXED")
                owner.get_by_label("Line 2 discount", exact=True).fill("25")
                owner.get_by_role("button", name="Edit specifications", exact=True).first.click()
                specification_dialog = owner.get_by_role("dialog", name="Edit Paint Areas", exact=True)
                specification_dialog.get_by_role("button", name="Continue", exact=True).click()
                specification_dialog.get_by_label("Paint Coats", exact=True).select_option("3")
                specification_dialog.get_by_role("button", name="Save Paint Areas", exact=True).click()
                owner.get_by_role("button", name="Save draft", exact=True).click()
                owner.wait_for_url(re.compile(r"/quotations/\d+$"))
                owner.get_by_text("Discount changes (2)", exact=True).wait_for()
                capture(owner, "owner-draft-history")
                self.assertEqual(db_read(lambda: str(Quotation.objects.get(pk=self.quote_id).grand_total)), "4700.00")
                self.assertEqual(db_read(lambda: str(Quotation.objects.get(pk=revision_id).grand_total)), "4330.00")
                owner.once("dialog", lambda dialog: dialog.accept())
                owner.get_by_role("button", name=re.compile("Submit to Customer|Send Revised Quotation")).click()
                owner.get_by_role("dialog", name="Final quotation submitted").get_by_role("button", name="Done", exact=True).click()
                result["steps"].append("Revision Edit Draft uses shared pricing; percentage/fixed discounts save atomically; original 4700 preserved and revision 4330 sent")

                customer.goto(f"http://localhost:5173/customer-quotations/{revision_id}")
                customer.get_by_role("region", name="Quotation version history").wait_for()
                customer.get_by_text("Discount changes (2)", exact=True).click()
                customer.get_by_text(re.compile(r"Scope and specification changes \(" )).click()
                customer.get_by_text("Price changes", exact=False).first.click()
                capture(customer, "customer-revision-history")
                token = customer.evaluate("localStorage.getItem('bharath_access')")
                pdf = customer_context.request.get(self.live_server_url + f"/api/quotations/customer-portal/quotations/{revision_id}/pdf/", headers={"Authorization": "Bearer " + token})
                self.assertEqual(pdf.status, 200)
                pdf_bytes = pdf.body()
                (OUT / "customer-revision.pdf").write_bytes(pdf_bytes)
                with pymupdf.open(stream=pdf_bytes, filetype="pdf") as document:
                    text = " ".join("".join(page.get_text() for page in document).split())
                    self.assertIn("4,330.00", text)
                    self.assertIn("Walls - Bedroom 1", text)
                    document[0].get_pixmap(matrix=pymupdf.Matrix(1.3, 1.3)).save(str(OUT / "customer-revision-pdf-page-1.png"))
                result["steps"].append("Customer history links show only issued versions; net-price/discount comparison and PDF total/captions agree")

                before = len(result["action_requests"])
                customer.once("dialog", lambda dialog: dialog.dismiss())
                customer.get_by_role("button", name="Accept quotation", exact=True).click()
                self.assertEqual(len(result["action_requests"]), before)
                fault["action"] = True
                customer.once("dialog", lambda dialog: dialog.accept())
                customer.get_by_role("button", name="Accept quotation", exact=True).click()
                customer.get_by_role("alert").filter(has_text="QA response unavailable").wait_for()
                self.assertEqual(state(revision_id), "SENT")
                capture(customer, "customer-response-error")
                customer.once("dialog", lambda dialog: dialog.accept())
                customer.get_by_role("button", name="Accept quotation", exact=True).click()
                customer.get_by_role("button", name="Accept quotation", exact=True).wait_for(state="hidden")
                self.assertEqual(state(revision_id), "ACCEPTED")
                capture(customer, "customer-accepted")
                result["steps"].append("Accept cancellation is read-only; injected response failure retains SENT; explicit retry accepts the same revision")
                customer.goto(f"http://localhost:5173/customer-quotations/{self.decline_id}")
                customer.get_by_role("button", name="Decline quotation", exact=True).wait_for()
                customer.once("dialog", lambda dialog: dialog.accept())
                customer.get_by_role("button", name="Decline quotation", exact=True).click()
                customer.get_by_role("button", name="Decline quotation", exact=True).wait_for(state="hidden")
                self.assertEqual(state(self.decline_id), "REJECTED")
                self.assertEqual(db_read(lambda: str(Quotation.objects.get(pk=self.decline_id).grand_total)), "4700.00")
                capture(customer, "customer-rejected")
                result["steps"].append("A separate issued quotation can be declined explicitly; scope and total remain unchanged")
                self.assertFalse(result["page_errors"], result["page_errors"])
                self.assertFalse(result.get("routing_errors"), result.get("routing_errors"))
                self.assertEqual(result.get("http_errors", []), [{"status": 503, "path": f"/api/quotations/customer-portal/quotations/{revision_id}/action/"}])
            except Exception as error:
                result["blocker"] = str(error)
                try:
                    result["last_body"] = owner.locator("body").inner_text()
                    owner.screenshot(path=str(OUT / "last-failure.png"), full_page=True)
                except Exception:
                    pass
                raise
            finally:
                (OUT / "browser-results.json").write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
                for context in contexts:
                    context.unroute_all(behavior="ignoreErrors")
                    context.close()
                browser.close()


if __name__ == "__main__":
    settings.MIGRATION_MODULES = {app.label: None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1, interactive=False).run_tests(["__main__.Phase4Browser"]))
