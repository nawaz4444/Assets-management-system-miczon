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

    # 3. Ensure Google SocialApp exists (prevents ExistError)
    # Note: User must update ClientID/Secret via /admin or .env later
    google_app, created = SocialApp.objects.get_or_create(
        provider='google',
        defaults={
            'name': 'Google Login',
            'client_id': os.getenv('GOOGLE_CLIENT_ID', 'placeholder-client-id'),
            'secret': os.getenv('GOOGLE_CLIENT_SECRET', 'placeholder-secret'),
        }
    )
    if created:
        google_app.sites.add(site)
        print("🔑 Google SocialApp created (Placeholder). Update in Admin panel.")
    else:
        print("🔑 Google SocialApp already exists.")

    print("✅ Setup Complete!")

if __name__ == "__main__":
    run_setup()
