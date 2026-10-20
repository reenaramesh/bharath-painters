"""Isolated, opt-in browser audit; never connects UI requests to the saved database."""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import django
django.setup()
from django.conf import settings
from django.test import LiveServerTestCase
from django.test.runner import DiscoverRunner
from django.db import connections
from playwright.sync_api import sync_playwright
from rest_framework.test import APIClient
from quotations import test_grouped_specifications as grouped_fixture
from accounts.models import ContractorProfile
from quotations.models import PropertyRoom, MeasurementSurface
from quotations.models import PaintType, PaintBrand, ServiceType, Quotation

ARTIFACTS = Path(__file__).resolve().parents[2] / "docs/previews/quotation-unified"


def db_read(read):
    # Playwright sync methods run an event loop; keep Django ORM work on a thread.
    def run():
        try:
            return read()
        finally:
            connections.close_all()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(run).result()


class BrowserAudit(LiveServerTestCase):
    def setUp(self):
        grouped_fixture.GroupedSpecificationTests.setUp(self)
        ContractorProfile.objects.create(user=self.contractor, company_name="QA Painting Company", owner_name="QA Owner")
        self.client = APIClient()
        self.second_room = PropertyRoom.objects.create(property=self.property, measurement_record=self.measurement, name="Living Room")
        MeasurementSurface.objects.create(property=self.property, measurement_record=self.measurement, room=self.second_room, work_area="INTERIOR", surface_type="WALL", name="Living Wall", manual_area=200)
        self.measurement.status = "COMPLETED"
        self.measurement.save()
        self.texture = PaintType.objects.create(name="QA Texture", service_category=self.category, created_by=self.contractor)
        self.brand = PaintBrand.objects.create(name="QA Brand", created_by=self.contractor)
        self.service = ServiceType.objects.create(name="QA Finish", category_master=self.category, created_by=self.contractor)
        self.texture_service = ServiceType.objects.create(name="QA Texture Service", category_master=self.category, created_by=self.contractor)
        self.primer_service = ServiceType.objects.create(name="QA Primer Service", category_master=self.category, created_by=self.contractor)
        MeasurementSurface.objects.create(property=self.property, measurement_record=self.measurement, room=self.room, work_area="INTERIOR", surface_type="CEILING", name="Ceiling 1", manual_area=100)

    def test_browser_workflow(self):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        results = {"database": "isolated Django test database", "steps": [], "screenshots": [], "errors": []}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            fault = {"draft":False}
            def route_api(route):
                parsed = urlsplit(route.request.url)
                if fault["draft"] and parsed.path.endswith("/draft/"):
                    fault["draft"] = False
                    route.fulfill(status=400,content_type="application/json",body='{"items":["QA validation failure; edits must remain available"]}')
                    return
                target = self.live_server_url + parsed.path + ("?" + parsed.query if parsed.query else "")
                try:
                    response = context.request.fetch(target, method=route.request.method, headers=route.request.headers, data=route.request.post_data_buffer)
                    route.fulfill(response=response)
                except Exception:
                    results.setdefault("routing_errors", []).append(parsed.path)
                    route.fulfill(status=503, content_type="application/json", body='{"detail":"Isolated QA server unavailable"}')
            context.route(re.compile(r"^https?://[^/]+/api/"), route_api)
            page = context.new_page()
            page.on("console", lambda message: results["errors"].append(message.text) if message.type == "error" else None)
            page.on("requestfailed", lambda request: results["errors"].append(request.url + ": " + str(request.failure)))
            page.on("response", lambda response: results["errors"].append(str(response.status) + " " + response.url) if response.status >= 400 else None)
            page.on("request", lambda request: results.setdefault("draft_requests", []).append({"method": request.method, "path": urlsplit(request.url).path}) if "/draft/" in request.url else None)
            page.on("pageerror", lambda error: results["errors"].append(str(error)))
            try:
                page.goto("http://localhost:5173/login")
                page.wait_for_load_state("networkidle")
                page.wait_for_selector("input", timeout=15000)
                results["login_inputs"] = page.locator("input").evaluate_all("els => els.map(e => ({type:e.type,placeholder:e.placeholder,id:e.id}))")
                page.locator('input[type="text"]').first.fill(self.contractor.mobile)
                page.locator('input[type="password"]').fill("test-pass")
                page.get_by_role("button", name="Sign in", exact=True).click()
                page.wait_for_url("**/dashboard")
                page.goto(f"http://localhost:5173/quotations/new?customer={self.customer.pk}&property={self.property.pk}&measurement={self.measurement.pk}")
                page.wait_for_load_state("networkidle")
                results["body"] = page.locator("body").inner_text()
                results["controls"] = page.locator("input,select,button").evaluate_all("els => els.map(e=>({tag:e.tagName,type:e.type,text:e.innerText,placeholder:e.placeholder,value:e.value}))")
                page.screenshot(path=str(ARTIFACTS / "initial-desktop.png"), full_page=True)
                for width in [360, 390, 430, 768, 1440]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    page.evaluate("window.scrollTo(0, 0)")
                    self.assertEqual(page.evaluate("document.documentElement.scrollWidth"),width)
                    filename = f"measurements-{width}.png"
                    page.screenshot(path=str(ARTIFACTS / filename), full_page=True)
                    results["screenshots"].append({"file": filename, "width": width, "scrollWidth": page.evaluate("document.documentElement.scrollWidth"), "clientWidth": page.evaluate("document.documentElement.clientWidth")})
                page.get_by_role("button", name="Continue", exact=True).click()
                page.get_by_role("button", name="Create Paint Areas", exact=True).wait_for()
                results["steps"].append("Loaded saved measurement version 3 and continued")
                results["assignment_body"] = page.locator("body").inner_text()
                results["assignment_buttons"] = page.get_by_role("button").all_text_contents()
                page.get_by_role("button", name="Create Paint Areas", exact=True).click()
                dialog = page.get_by_role("dialog")
                dialog.get_by_label("Select Walls",exact=True).check()
                dialog.get_by_role("button", name="Select all", exact=True).click()
                dialog.get_by_role("button", name="Continue", exact=True).click()
                dialog.get_by_label("Area Name", exact=True).fill("QA Normal Walls")
                dialog.get_by_label("Brand").select_option(str(self.brand.pk))
                dialog.locator("label").filter(has_text=re.compile(r"^Service\s*No additional service")).locator("select").select_option(str(self.service.pk))
                dialog.get_by_label("Product",exact=True).select_option(str(self.product.pk))
                dialog.get_by_label("Assignment rate", exact=True).fill("10")
                for width in [360, 390, 430, 768, 1440]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    filename = f"group-material-dialog-{width}.png"
                    dialog.evaluate("async el => await Promise.all(el.getAnimations({subtree:true}).filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))")
                    page.screenshot(path=str(ARTIFACTS / filename))
                    footer = dialog.locator("footer").bounding_box()
                    results["screenshots"].append({"file": filename, "width": width, "scrollWidth": page.evaluate("document.documentElement.scrollWidth"), "clientWidth": page.evaluate("document.documentElement.clientWidth"), "footer_visible": footer["y"] >= 0 and footer["y"] + footer["height"] <= 1001})
                dialog.get_by_role("button", name="Save Paint Areas", exact=True).click()
                page.get_by_role("dialog").wait_for(state="hidden")
                results["steps"].append("Grouped two rooms, product and rate 10")
                results["grouped_body"] = page.locator("body").inner_text()
                results["grouped_buttons"] = page.get_by_role("button").all_text_contents()
                page.get_by_role("button", name="Create Paint Areas", exact=True).click()
                dialog = page.get_by_role("dialog")
                dialog.get_by_role("checkbox", name="Select Ceiling", exact=True).check()
                dialog.get_by_role("button", name="Select all", exact=True).click()
                dialog.get_by_role("button", name="Continue", exact=True).click()
                dialog.get_by_label("Area Name", exact=True).fill("QA Ceiling")
                dialog.get_by_label("Brand").select_option(str(self.brand.pk))
                dialog.get_by_label("Product",exact=True).select_option(str(self.texture.pk))
                dialog.get_by_label("Assignment rate", exact=True).fill("20")
                dialog.get_by_role("button", name="Save Paint Areas", exact=True).click()
                page.get_by_role("dialog").wait_for(state="hidden")
                results["steps"].append("Created ceiling group with different product and rate 20")
                def special_wall(name, service, rate, replace=True):
                    page.get_by_role("button", name="Add Special Wall", exact=True).click()
                    sheet = page.get_by_role("dialog")
                    sheet.get_by_label(re.compile("^Select Room")).select_option(str(self.room.pk))
                    if not replace:
                        sheet.get_by_role("checkbox", name="Exclude selected walls from standard painting", exact=True).uncheck()
                    sheet.get_by_role("checkbox", name=re.compile("^Wall 4")).check()
                    sheet.get_by_role("button", name="Continue", exact=True).click()
                    sheet.get_by_label("Wall / Surface Name", exact=True).fill(name)
                    sheet.get_by_label("Brand").select_option(str(self.brand.pk))
                    sheet.get_by_label("Product",exact=True).select_option(str(self.texture.pk))
                    sheet.locator("label").filter(has_text=re.compile(r"^Service\s*No additional service")).locator("select").select_option(str(service.pk))
                    sheet.get_by_label("Assignment rate", exact=True).fill(rate)
                    self.assertEqual(sheet.get_by_label("Quantity (saved measurement)").input_value(), "125")
                    if name == "QA Special Texture":
                        for width in [360,390,430,768,1440]:
                            page.set_viewport_size({"width":width,"height":1000})
                            sheet.evaluate("async el => await Promise.all(el.getAnimations({subtree:true}).filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))")
                            filename=f"special-wall-{width}.png"
                            page.screenshot(path=str(ARTIFACTS / filename))
                            results["screenshots"].append({"file":filename,"width":width,"scrollWidth":page.evaluate("document.documentElement.scrollWidth"),"clientWidth":page.evaluate("document.documentElement.clientWidth")})
                    sheet.get_by_role("button", name="Save Special Wall", exact=True).click()
                    return sheet
                special_wall("QA Special Texture", self.texture_service, "30").wait_for(state="hidden")
                normal = page.locator(".gq-assignment-card").filter(has=page.get_by_role("heading",name="QA Normal Walls",exact=True))
                self.assertIn("545",normal.inner_text())
                special_wall("QA Separate Primer", self.primer_service, "5", replace=False).wait_for(state="hidden")
                self.assertIn("545",normal.inner_text())
                duplicate = special_wall("Duplicate primer", self.primer_service, "5", replace=False)
                self.assertIn("already assigned",duplicate.get_by_role("alert").inner_text())
                duplicate.get_by_role("button",name="Close popup",exact=True).click()
                texture = page.locator(".gq-assignment-card").filter(has=page.get_by_role("heading",name="QA Special Texture",exact=True))
                texture.get_by_role("button",name="Delete",exact=True).click()
                self.assertIn("670",normal.inner_text())
                special_wall("QA Special Texture", self.texture_service, "30").wait_for(state="hidden")
                self.assertIn("545",normal.inner_text())
                results["steps"].append("Created, deleted and recreated replacement wall; primer retained; duplicate primer rejected; standard quantity 545")
                page.get_by_role("button", name="Continue", exact=True).click()
                page.get_by_label("Discount mode", exact=True).select_option("LINE")
                page.get_by_label("Line 1 discount type", exact=True).select_option("PERCENTAGE")
                page.get_by_label("Line 1 discount", exact=True).fill("10")
                page.get_by_label("Line 2 discount type", exact=True).select_option("FIXED")
                page.get_by_label("Line 2 discount", exact=True).fill("50")
                page.get_by_label("GST percentage", exact=True).fill("18")
                results["steps"].append("Set percentage and fixed line discounts")
                for width in [360, 390, 430, 768, 1440]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    page.get_by_role("button", name="Save draft", exact=True).scroll_into_view_if_needed()
                    page.evaluate("window.scrollTo(0, 0)")
                    self.assertEqual(page.evaluate("document.documentElement.scrollWidth"),width)
                    filename = f"create-pricing-{width}.png"
                    page.screenshot(path=str(ARTIFACTS / filename), full_page=True)
                    results["screenshots"].append({"file": filename, "width": width, "scrollWidth": page.evaluate("document.documentElement.scrollWidth"), "clientWidth": page.evaluate("document.documentElement.clientWidth")})
                page.set_viewport_size({"width": 1440, "height": 1000})
                results["create_pricing_labels"]=page.locator(".qp-item input,.qp-item select").evaluate_all("els=>els.map(el=>el.getAttribute('aria-label'))")
                page.get_by_role("button",name="Preview quotation",exact=True).click()
                preview = page.get_by_role("dialog",name="Quotation preview",exact=True)
                self.assertIn("13,251.40",preview.inner_text())
                self.assertEqual(db_read(lambda:Quotation.objects.count()),0)
                preview.locator("header").get_by_role("button").click()
                preview.wait_for(state="hidden")
                results["steps"].append("HTML preview matches computed total and creates no quotation")
                page.get_by_role("button", name="Save draft", exact=True).click()
                page.wait_for_url(re.compile(r"/quotations/\d+$"))
                page.get_by_role("link", name="Edit Draft", exact=False).wait_for()
                self.assertEqual(db_read(lambda:Quotation.objects.count()),1,"Repeated actions must not create additional quotations")
                results["steps"].append("Saved Draft and opened detail")
                results["detail_body"] = page.locator("body").inner_text()
                results["detail_buttons"] = page.get_by_role("button").all_text_contents()
                self.assertIn("13,251.40", results["detail_body"])
                quote_id = int(page.url.rsplit("/", 1)[1])
                def capture(stage):
                    for width in [360, 390, 430, 768, 1440]:
                        page.set_viewport_size({"width": width, "height": 1000})
                        page.evaluate("window.scrollTo(0, 0)")
                        filename = f"{stage}-{width}.png"
                        page.screenshot(path=str(ARTIFACTS / filename), full_page=True)
                        results["screenshots"].append({"file": filename, "width": width, "scrollWidth": page.evaluate("document.documentElement.scrollWidth"), "clientWidth": page.evaluate("document.documentElement.clientWidth")})
                    page.set_viewport_size({"width": 1440, "height": 1000})
                capture("draft-detail")
                page.get_by_role("link", name="Edit Draft", exact=False).click()
                def final_stage():
                    page.get_by_role("button",name="Continue",exact=True).click()
                    page.get_by_role("button",name="Continue",exact=True).click()
                    page.get_by_role("heading",name="Editable Pricing",exact=True).wait_for()
                final_stage()
                self.assertEqual(page.get_by_label("Line 1 discount",exact=True).input_value(),"10.00")
                self.assertEqual(page.get_by_label("Line 2 discount",exact=True).input_value(),"50.00")
                capture("edit-initial-pricing")
                self.assertEqual(page.locator('.qp-item input,.qp-item select').evaluate_all("els=>els.map(el=>el.getAttribute('aria-label'))"),results['create_pricing_labels'])
                results['steps'].append('Create/Edit pricing controls have identical fields and order')
                self.assertEqual(page.get_by_role('region',name='Final read-only review').locator('input,select,textarea').count(),0)
                page.get_by_label("Line 1 discount",exact=True).fill("11")
                refresh_dialogs=[]
                page.once('dialog',lambda dialog:(refresh_dialogs.append(dialog.type),dialog.accept()))
                page.reload(wait_until='networkidle')
                page.get_by_role('heading',name='Editable Pricing',exact=True).wait_for()
                self.assertEqual(refresh_dialogs,['beforeunload'])
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'11')
                results['steps'].append('Refresh warns and recovers unsaved Draft discounts in the same pricing stage')
                page.get_by_role('button',name='Previous step',exact=True).click()
                texture=page.locator('.gq-assignment-card').filter(has=page.get_by_role('heading',name='QA Special Texture',exact=True))
                texture.get_by_role('button',name='Edit',exact=True).click()
                sheet=page.get_by_role('dialog');sheet.get_by_role('button',name='Continue',exact=True).click()
                self.assertEqual(sheet.get_by_label('Assignment rate',exact=True).input_value(),'30.00')
                sheet.get_by_label('Assignment rate',exact=True).fill('35')
                sheet.get_by_label(re.compile('^Paint Coats')).select_option('3')
                sheet.get_by_role('button',name='Save Special Wall',exact=True).click();sheet.wait_for(state='hidden')
                capture('edit-assignments')
                requests_before=len(results.get('draft_requests',[]))
                page.get_by_role('button',name='Continue',exact=True).click()
                self.assertEqual(len(results.get('draft_requests',[])),requests_before,'Continue cannot save')
                page.get_by_label('Line 1 discount',exact=True).fill('15')
                page.once('dialog',lambda dialog:dialog.dismiss())
                page.locator('a[href="/quotations"]').first.click()
                self.assertTrue(page.url.endswith('/edit'))
                self.assertEqual(page.get_by_label('Line 1 discount',exact=True).input_value(),'15')
                capture('edit-pricing')
                page.set_viewport_size({'width':360,'height':1000})
                page.get_by_label('Notes',exact=True).fill('QA reviewed notes')
                page.get_by_label('Terms and conditions',exact=True).fill('QA reviewed terms')
                original_total=db_read(lambda:Quotation.objects.get(pk=quote_id).grand_total)
                fault["draft"]=True
                page.get_by_role("button",name="Save draft",exact=True).click()
                page.get_by_role("alert").filter(has_text="QA validation failure").wait_for()
                self.assertEqual(db_read(lambda:Quotation.objects.get(pk=quote_id).grand_total),original_total)
                self.assertEqual(page.get_by_label("Line 1 discount",exact=True).input_value(),"15")
                self.assertEqual(page.get_by_label("Notes",exact=True).input_value(),"QA reviewed notes")
                page.get_by_role("alert").filter(has_text="QA validation failure").scroll_into_view_if_needed()
                filename="save-error-360.png"
                page.screenshot(path=str(ARTIFACTS / filename))
                results["screenshots"].append({"file":filename,"width":360,"scrollWidth":page.evaluate("document.documentElement.scrollWidth"),"clientWidth":page.evaluate("document.documentElement.clientWidth")})
                results["steps"].append("Failed Save Draft shows validation error and retains edits; saved values unchanged")
                page.get_by_role("button", name="Save draft", exact=True).click()
                page.wait_for_url(re.compile(r"/quotations/\d+$"))
                page.get_by_role("link", name="Edit Draft", exact=False).wait_for()
                self.assertIn("13,667.35", page.locator("body").inner_text())
                self.assertEqual(db_read(lambda:Quotation.objects.get(pk=quote_id).notes),"QA reviewed notes")
                results["steps"].append("Explicitly saved edited rates, coats, notes, terms and line discount at 360px; total 13667.35")
                for kind, value, expected, width in [("PERCENTAGE", "10", "13,221.90", 390), ("FIXED", "125", "14,543.50", 430)]:
                    page.set_viewport_size({"width": width, "height": 1000})
                    page.get_by_role("link", name="Edit Draft", exact=False).click()
                    final_stage()
                    page.get_by_label("Discount mode", exact=True).select_option("OVERALL")
                    page.get_by_label("Overall discount type", exact=True).select_option(kind)
                    page.get_by_label("Overall discount", exact=True).fill(value)
                    before = len(results.get("draft_requests", []))

                    page.get_by_role("button", name="Save draft", exact=True).wait_for()
                    self.assertEqual(len(results.get("draft_requests", [])), before)
                    page.get_by_role("button", name="Save draft", exact=True).click()
                    page.wait_for_url(re.compile(r"/quotations/\d+$"))
                    page.get_by_role("link", name="Edit Draft", exact=False).wait_for()
                    self.assertIn(expected, page.locator("body").inner_text())
                    results["steps"].append(f"Explicitly saved overall {kind} discount at {width}px; total {expected}")
                page.get_by_role("link", name="Edit Draft", exact=False).click()
                final_stage()
                self.assertEqual(page.get_by_label("Overall discount", exact=True).input_value(), "125.00")
                self.assertEqual(page.get_by_label("Overall discount type", exact=True).input_value(), "FIXED")
                results["steps"].append("Reopened overall fixed discount after second save")
                page.get_by_role("button",name="Previous step",exact=True).click()
                primer=page.locator(".gq-assignment-card").filter(has=page.get_by_role("heading",name="QA Separate Primer",exact=True))
                primer.get_by_role("button",name="Delete",exact=True).click()
                self.assertIn("545",page.locator(".gq-assignment-card").filter(has=page.get_by_role("heading",name="QA Normal Walls",exact=True)).inner_text())
                page.get_by_role("button",name="Continue",exact=True).click()
                page.get_by_role("button",name="Save draft",exact=True).click()
                page.wait_for_url(re.compile(r"/quotations/\d+$"))
                page.get_by_role("link",name="Edit Draft",exact=False).wait_for()
                self.assertIn("13,806.00",page.locator("body").inner_text())
                self.assertEqual(db_read(lambda:Quotation.objects.get(pk=quote_id).items.count()),3)
                results["steps"].append("Deleted restored primer process and explicitly saved; standard wall area stays 545 and replacement texture remains")
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.goto(f"http://localhost:5173/quotations/{quote_id}")
                page.get_by_role("button", name="Download PDF", exact=False).wait_for()
                with page.expect_response(re.compile(r"/quotations/\d+/pdf/")) as pdf_response:
                    page.get_by_role("button", name="Download PDF", exact=False).click()
                pdf_bytes = pdf_response.value.body()
                (ARTIFACTS / "verified-draft.pdf").write_bytes(pdf_bytes)
                import pymupdf
                with pymupdf.open(stream=pdf_bytes, filetype="pdf") as document:
                    text = " ".join("".join(sheet.get_text() for sheet in document).split())
                    self.assertIn("13,806.00", text)
                    self.assertIn("125.00", text)
                    self.assertIn("Walls - Bedroom 1, Living Room", text)
                    self.assertIn("Ceiling - Bedroom 1", text)
                    self.assertIn("QA Texture", text)
                    self.assertIn("5,450.00", text)
                    self.assertIn("2,000.00", text)
                    self.assertIn("4,375.00",text)
                    results["pdf_group_labels"] = "PDF preserves rooms/surfaces but does not print the saved friendly group names QA Normal Walls / QA Ceiling"
                    document[0].get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4)).save(str(ARTIFACTS / "verified-pdf-page-1.png"))
                results["steps"].append("Browser-generated PDF matches saved preview total, discount and both groups")
                page.get_by_role("button",name="Close PDF preview",exact=True).click()
                page.get_by_role("link",name="Edit Draft",exact=False).click()
                final_stage()
                page.get_by_role("button",name="Save & Send",exact=True).wait_for()
                before=len(results.get("draft_requests",[]))
                page.once("dialog",lambda dialog:dialog.dismiss())
                page.get_by_role("button",name="Save & Send",exact=True).click()
                self.assertEqual(len(results.get("draft_requests",[])),before)
                page.once("dialog",lambda dialog:dialog.accept())
                with page.expect_response(re.compile(r"/quotations/\d+/submit/")) as sent_response:
                    page.get_by_role("button",name="Save & Send",exact=True).click()
                page.wait_for_url(re.compile(r"/quotations/\d+$"))
                page.get_by_role("button",name="Share",exact=True).wait_for()
                results["customer_login_returned"]=bool(sent_response.value.json().get("temporary_password"))
                page.get_by_role("heading",name="Final quotation submitted",exact=True).wait_for()
                if results["customer_login_returned"]:
                    page.get_by_text("Customer ID & login created",exact=True).wait_for()
                page.get_by_role("button",name="Done",exact=True).click()
                self.assertEqual(db_read(lambda:Quotation.objects.get(pk=quote_id).status),"SENT")
                self.assertEqual(db_read(lambda:Quotation.objects.count()),1)
                self.assertEqual(page.get_by_role("link",name="Edit Draft",exact=False).count(),0)
                capture("sent-detail")
                results["steps"].append("Send cancelled without requests, then confirmed Save & send issued the same quotation; existing customer login/share dialog preserved; Edit Draft hidden")
            except Exception as error:
                results["blocker"] = str(error)
                results["body"] = page.locator("body").inner_text()
                results["html"] = page.content()
                page.screenshot(path=str(ARTIFACTS / "blocker.png"), full_page=True)
            finally:
                results["screenshots"]=list({entry["file"]:entry for entry in results["screenshots"]}.values())
                (ARTIFACTS / "browser-results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
                context.unroute_all(behavior="wait")
                browser.close()
        self.assertFalse(results.get("blocker"), results.get("blocker"))



if __name__ == "__main__":
    # Browser fixtures need the current schema, not historical data migrations.
    settings.MIGRATION_MODULES = {app.label: None for app in django.apps.apps.get_app_configs()}
    raise SystemExit(DiscoverRunner(verbosity=1, interactive=False).run_tests(["__main__.BrowserAudit"]))
