"""Email transport for budget notifications. Mirrors the inventory app's
background, one-message-per-recipient sender so a mail problem never blocks a
request and each recipient gets a well-delivered message."""
import logging
import threading

from django.conf import settings
from django.core.mail import EmailMessage, get_connection

logger = logging.getLogger(__name__)


def valid_emails(employees):
    """Distinct real emails from Employee objects (skip blanks and unknown-* placeholders)."""
    seen = []
    for emp in employees:
        email = (getattr(emp, 'email', '') or '').strip()
        if email and not email.lower().startswith('unknown-') and email not in seen:
            seen.append(email)
    return seen


def _send(recipients, subject, body, from_email):
    try:
        connection = get_connection()
        connection.open()
    except Exception:
        logger.exception("budgets: could not open mail connection")
        return
    sent = 0
    for email in recipients:
        try:
            EmailMessage(subject=subject, body=body, from_email=from_email, to=[email], connection=connection).send(fail_silently=False)
            sent += 1
        except Exception:
            logger.exception("budgets: failed to send email to %s", email)
    try:
        connection.close()
    except Exception:
        pass
    logger.info("budgets: notification emails sent %s/%s", sent, len(recipients))


def queue_emails(recipients, subject, body):
    if not recipients:
        return 0
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    threading.Thread(target=_send, args=(recipients, subject, body, from_email), daemon=True).start()
    return len(recipients)
