import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'inventory_system.settings')
django.setup()

from django.contrib.auth.models import User
from django.contrib.sites.models import Site
from allauth.socialaccount.models import SocialApp

def run_setup():
    print("🚀 Running Docker Setup...")

    # 1. Ensure Superuser exists
    admin_user = os.getenv('DJANGO_SUPERUSER_USERNAME', 'admin')
    admin_email = os.getenv('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
    admin_password = os.getenv('DJANGO_SUPERUSER_PASSWORD', 'admin123')

    if not User.objects.filter(username=admin_user).exists():
        print(f"👤 Creating superuser: {admin_user}")
        User.objects.create_superuser(admin_user, admin_email, admin_password)
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

    print("✅ Setup Complete!")

if __name__ == "__main__":
    run_setup()
