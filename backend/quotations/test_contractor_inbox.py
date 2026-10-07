from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser, ContractorProfile
from quotations.models import ContractorConnection, PortalNotification


class ContractorInboxTests(APITestCase):
    def setUp(self):
        self.sender = BharathUser.objects.create_user(mobile="9000000931", password="Test123!", role="CONTRACTOR", first_name="Sender")
        self.recipient = BharathUser.objects.create_user(mobile="9000000932", password="Test123!", role="CONTRACTOR", first_name="Recipient")
        self.stranger = BharathUser.objects.create_user(mobile="9000000933", password="Test123!", role="CONTRACTOR")
        ContractorProfile.objects.update_or_create(user=self.sender, defaults={"company_name": "XYZ Contractor", "owner_name": "Owner", "service_areas": "Whitefield", "work_skills": "Waterproofing"})
        self.client.force_authenticate(self.sender)

    def request_connection(self):
        return self.client.post(reverse("contractor-connection-list-create"), {"recipient": self.recipient.id, "message": "Need a partner for terrace work."}, format="json")

    def test_request_delivers_notification_message_and_sender_profile(self):
        response = self.request_connection()
        self.assertEqual(response.status_code, 201, response.data)
        notification = PortalNotification.objects.get(recipient=self.recipient, event_type="CONTRACTOR_CONNECTION_REQUEST")
        self.assertEqual(notification.actor, self.sender)
        self.assertIn("XYZ Contractor", notification.message)
        self.assertIn("Need a partner", notification.message)
        self.assertEqual(notification.link, f"/messages?connection={response.data['id']}")
        self.client.force_authenticate(self.recipient)
        rows = self.client.get(reverse("contractor-connection-list-create"), {"status": "PENDING"}).data
        row = next(row for row in rows if row["id"] == response.data["id"])
        self.assertEqual(row["viewer_authority"], "RECIPIENT")
        self.assertEqual(row["message"], "Need a partner for terrace work.")
        self.assertEqual(row["requester_details"]["company_name"], "XYZ Contractor")
        self.assertEqual(row["requester_details"]["mobile"], self.sender.mobile)

    def test_recipient_accepts_and_sender_is_notified(self):
        response = self.request_connection()
        self.client.force_authenticate(self.recipient)
        url = reverse("contractor-connection-action", args=[response.data["id"], "accept"])
        accepted = self.client.post(url, {}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data["status"], "CONNECTED")
        self.assertTrue(PortalNotification.objects.filter(recipient=self.sender, event_type="CONTRACTOR_CONNECTION_RESPONSE", title="Connection accepted").exists())
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)

    def test_sender_cannot_accept_or_decline_and_stranger_cannot_see_request(self):
        response = self.request_connection()
        for action in ("accept", "reject"):
            url = reverse("contractor-connection-action", args=[response.data["id"], action])
            self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(reverse("contractor-connection-list-create")).data, [])

    def test_duplicate_request_does_not_duplicate_notification(self):
        self.assertEqual(self.request_connection().status_code, 201)
        self.assertEqual(self.request_connection().status_code, 400)
        self.assertEqual(PortalNotification.objects.filter(recipient=self.recipient, event_type="CONTRACTOR_CONNECTION_REQUEST").count(), 1)

    def test_reversed_reconnection_goes_to_current_recipient(self):
        row = ContractorConnection.objects.create(requester=self.recipient, recipient=self.sender, status="DISCONNECTED")
        response = self.request_connection()
        self.assertEqual(response.status_code, 201, response.data)
        row.refresh_from_db()
        self.assertEqual(row.requester_id, self.sender.id)
        self.assertEqual(row.recipient_id, self.recipient.id)
        self.client.force_authenticate(self.recipient)
        url = reverse("contractor-connection-action", args=[row.id, "reject"])
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 200)

    def test_invalid_message_does_not_create_request_or_notification(self):
        response = self.client.post(reverse("contractor-connection-list-create"), {"recipient": self.recipient.id, "message": "x" * 2001}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(ContractorConnection.objects.exists())
        self.assertFalse(PortalNotification.objects.filter(event_type="CONTRACTOR_CONNECTION_REQUEST").exists())
