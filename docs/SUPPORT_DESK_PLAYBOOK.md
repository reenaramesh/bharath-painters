# Support Desk playbook

## Access

- An administrator creates and disables support accounts from **Support Staff**.
- Support staff see **Support Desk** and **Recovery Center**. They do not receive admin dashboard, billing, master-data or chat moderation permissions.
- Every support action needs an open ticket and a reason. Record links and private notes appear in the ticket history. The administrator can review the recent action log from Support Staff.
- Never ask a user for a password, PIN, one-time code, payment card number or banking credential. Staff cannot set a customer's password.
- Search by phone number, Bharath ID or email in Recovery Center. Phone searches normalize Indian `0` and `+91` forms and preserve explicit international country codes. The account card shows whether the account is active, has a usable password and has a verified recovery email.
- When a verification code is requested, the account holder receives an in-app notification that the code was sent to their email. The notification does not contain the code. Guide the holder to enter the emailed code in their own session; never ask them to read it out or type it into a support ticket.

## Standard workflow

1. Open the ticket, set its priority and assign a staff member.
2. Confirm the requester and search the affected account, customer, property, area calculation, quotation or invoice in Recovery Center.
3. Link the record to the ticket and add a private note with what was observed.
4. Apply an available action only when its owner raised the ticket and the action fits the record's current state. The API enforces these checks.
5. Reply to the requester with the result, then resolve the ticket. Reopen it if the issue returns.
6. Set **Needs administrator** for financial corrections, disputed identity, blocked conversations, or unavailable backups. Add a private note before escalating. Administrators receive a notification.

## Common cases

| Issue | Staff action | Escalate when |
| --- | --- | --- |
| Cannot sign in | Check account status; send recovery instructions to its verified email after the owner raises a ticket. | Email is unverified, the account is disabled, or identity is disputed. |
| Deleted mobile still reserved | Search the old account and record its ID in a private note. | An administrator must select the deleted account and release its number. Suspended accounts must not be released automatically. |
| Customer connection | Explain accept, reject, reconnect and unblock controls to the customer. | Ownership or consent is disputed. |
| Area calculation | Find the reference and ask the contractor to edit or resubmit an editable record. | The record is locked, quoted, or appears missing. |
| Quotation draft deleted | Restore the draft from Recovery Center when the contractor raised the ticket and no invoice or schedule exists. | The quotation was sent, approved, scheduled or invoiced. Use its revision process. |
| Invoice or payment | Link the invoice, capture the disputed amount and record a private note, then set **Needs administrator**. | Cancellation, replacement, payment reversal, totals and tax disputes need administrator review. A quotation's invoice link must be handled before issuing a replacement. |
| Messages or safety | Link the ticket and keep evidence in private notes. | Fraud, threats, blocking, or disclosure of personal information is reported. Chat moderation remains admin-only. |
| Live error or missing data | Record the exact URL, time, account ID, error text and affected reference number. | Database restore, deployment, external service or server access is required. |

## Data recovery limits

- Deleted quotation drafts are retained from this update onward and can be restored. Older drafts that were physically deleted require a database backup.
- Issued invoices, payments, submitted measurements and completed projects are not directly edited by support staff. Their financial or historical effects require administrator review.
- A cancelled or deleted account keeps references needed by historical business documents. Its former mobile number may be released, but staff must not repurpose its Bharath ID.
- Keep production backups and a documented restore procedure. The Support Desk cannot restore records that no longer exist in the database or a backup.

## Before enabling support staff on a deployment

- Apply the new `accounts.0028` and `quotations.0101` migrations to that deployment's database. On a host without an interactive shell, configure the backend startup command to run `python manage.py migrate --noinput` before its existing web-server command. Do not point the local development command at the production database.
- Set `FRONTEND_URL` to the public frontend origin so recovery emails open the correct site. Configure SMTP email delivery before using the recovery-email action.
- Create the first staff account from the administrator's **Support Staff** page. Save the one-time password securely and ask the staff member to change it after sign-in.
- Keep the backend and frontend on the same release when enabling the new role. Until both are deployed, the staff portal and its API may not agree on available actions.
