# Email delivery via Brevo (production)

DigitalOcean blocks outbound SMTP ports (25/465/587), so Gmail/SMTP sending
fails on the droplet. We send through **Brevo's transactional email HTTP API**
over port 443 instead, using `django-anymail`.

All application email code is unchanged — only the email *backend* switches.
Django auto-selects the Brevo backend whenever `BREVO_API_KEY` is set
(see `inventory_system/settings.py`). Without it, behaviour is unchanged
(SMTP if configured, else the console backend).

## One-time Brevo account setup

1. **Verify the sender address.**
   Brevo → *Senders, Domains & Dedicated IPs* → **Senders** → *Add a sender*.
   Use `nawaz@miczon.com`. Click the verification link Brevo emails.
   (Optional, better deliverability: verify the whole `miczon.com` domain by
   adding the DKIM/SPF DNS records Brevo provides.)

2. **Create an API key.**
   Brevo → *SMTP & API* → **API Keys** → *Generate a new API key*.
   Copy the value (starts with `xkeysib-`). Treat it as a secret.

## Deploy to the droplet

A new Python package (`django-anymail`) is added, so the backend image must be
rebuilt.

```bash
cd /path/to/asset-management
git pull                       # after the settings/requirements changes are pushed

# Add the key + verified sender to the environment (do NOT commit .env)
printf '\nBREVO_API_KEY=xkeysib-YOUR-KEY-HERE\nDEFAULT_FROM_EMAIL=AssetZone <nawaz@miczon.com>\n' >> .env

# Rebuild + restart just the backend
docker-compose -f docker-compose.yml up -d --build backend
```

If `docker-compose up --build backend` hits the old
`KeyError: 'ContainerConfig'` bug, use the workaround:

```bash
docker-compose -f docker-compose.yml build backend
docker-compose -f docker-compose.yml rm -sf backend
docker-compose -f docker-compose.yml up -d --no-deps backend
```

## Verify

Check the backend picked Brevo:

```bash
docker exec inventory_backend python -c "from django.conf import settings; print(settings.EMAIL_BACKEND)"
# -> anymail.backends.brevo.EmailBackend
```

Send a test message:

```bash
docker exec inventory_backend python manage.py shell -c "
from django.core.mail import send_mail
send_mail('AssetZone test', 'Brevo delivery works.', None, ['you@example.com'])
print('sent')
"
```

A real email should arrive. If Brevo rejects it, the most common causes are an
unverified sender (`DEFAULT_FROM_EMAIL` must match a verified Brevo sender) or a
bad/disabled API key.
