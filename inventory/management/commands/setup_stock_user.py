from django.core.management.base import BaseCommand
from django.contrib.auth.models import User, Group


class Command(BaseCommand):
    help = 'Create or configure a stock-only user restricted to the Stock section app.'

    def add_arguments(self, parser):
        parser.add_argument('--username', type=str, default='stock_user', help='Username for the stock user (default: stock_user)')
        parser.add_argument('--password', type=str, default='StockPass@2026', help='Password for the stock user (default: StockPass@2026)')
        parser.add_argument('--email', type=str, default='stock@miczon.com', help='Email for the stock user (default: stock@miczon.com)')

    def handle(self, *args, **options):
        username = options['username'].strip()
        password = options['password']
        email = options['email'].strip()

        group, _ = Group.objects.get_or_create(name='Stock Only')

        user, created = User.objects.get_or_create(username=username, defaults={'email': email})
        user.email = email
        user.set_password(password)
        user.is_active = True
        user.is_staff = False
        user.is_superuser = False
        user.save()

        user.groups.add(group)

        action_text = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(
            f"Successfully {action_text.lower()} stock-only user:\n"
            f"  Username: {username}\n"
            f"  Password: {password}\n"
            f"  Group:    {group.name}\n"
            f"  Access:   Restricted to Stock section only"
        ))
