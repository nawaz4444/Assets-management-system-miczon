import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'inventory_system.settings')
django.setup()

from django.contrib.auth.models import User
from django.contrib.sites.models import Site
from allauth.socialaccount.models import SocialApp

def run_setup():
    print("🚀 Running Docker Setup...")

    # 1. Ensure Superuser exists (credentials MUST be provided via environment).
    admin_user = os.getenv('DJANGO_SUPERUSER_USERNAME')
    admin_email = os.getenv('DJANGO_SUPERUSER_EMAIL')
    admin_password = os.getenv('DJANGO_SUPERUSER_PASSWORD')

    if not (admin_user and admin_password):
        print("⚠️  Skipping superuser creation: set DJANGO_SUPERUSER_USERNAME and "
              "DJANGO_SUPERUSER_PASSWORD (and optionally DJANGO_SUPERUSER_EMAIL) to bootstrap one.")
    elif not User.objects.filter(username=admin_user).exists():
        print(f"👤 Creating superuser: {admin_user}")
        User.objects.create_superuser(admin_user, admin_email or '', admin_password)
    else:
        print(f"👤 Superuser {admin_user} already exists.")

    # 2. Ensure Site exists (allauth needs this)
    site_id = getattr(django.conf.settings, 'SITE_ID', 1)
    site, created = Site.objects.get_or_create(id=site_id)
    site.domain = 'localhost:8000'
    site.name = 'Inventory System'
    site.save()
    print(f"🌐 Site configured: {site.domain}")

    # 3. Ensure single Google SocialApp exists (prevents MultipleObjectsReturned Error)
    google_apps = list(SocialApp.objects.filter(provider='google'))
    if len(google_apps) > 1:
        for app in google_apps[1:]:
            app.delete()
        google_app = google_apps[0]
        print("🔑 Cleaned up duplicate Google SocialApps.")
    elif len(google_apps) == 1:
        google_app = google_apps[0]
        print("🔑 Google SocialApp already exists.")
    else:
        google_app = SocialApp.objects.create(
            provider='google',
            name='Google Login',
            client_id=os.getenv('GOOGLE_CLIENT_ID', 'placeholder-client-id'),
            secret=os.getenv('GOOGLE_CLIENT_SECRET', 'placeholder-secret'),
        )
        google_app.sites.add(site)
        print("🔑 Google SocialApp created.")

    # 4. Ensure stock-only user exists
    from django.contrib.auth.models import Group
    stock_group, _ = Group.objects.get_or_create(name='Stock Only')
    stock_u, s_created = User.objects.get_or_create(username='stock_user', defaults={'email': 'stock@miczon.com'})
    stock_u.set_password('StockPass@2026')
    stock_u.is_active = True
    stock_u.is_staff = False
    stock_u.is_superuser = False
    stock_u.save()
    stock_u.groups.add(stock_group)
    print(f"📦 Stock-only user {'created' if s_created else 'verified'}: stock_user")

    print("✅ Setup Complete!")

if __name__ == "__main__":
    run_setup()
