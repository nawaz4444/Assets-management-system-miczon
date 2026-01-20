"""
Quick script to set email for admin user
Run this with: python setup_admin_email.py
"""

import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'inventory_system.settings')
django.setup()

from django.contrib.auth.models import User

def setup_admin_email():
    print("=" * 50)
    print("Admin Email Setup")
    print("=" * 50)
    
    # List all users
    users = User.objects.all()
    print(f"\nFound {users.count()} user(s):")
    for user in users:
        print(f"  - {user.username} (Email: {user.email or 'NOT SET'})")
    
    # Get username
    username = input("\nEnter username to update (or press Enter for 'admin'): ").strip()
    if not username:
        username = 'admin'
    
    try:
        user = User.objects.get(username=username)
        print(f"\nFound user: {user.username}")
        print(f"Current email: {user.email or 'NOT SET'}")
        
        # Get new email
        new_email = input("\nEnter new email address: ").strip()
        
        if not new_email:
            print("❌ Email cannot be empty!")
            return
        
        # Validate basic email format
        if '@' not in new_email or '.' not in new_email:
            print("❌ Invalid email format!")
            return
        
        # Update email
        user.email = new_email
        user.save()
        
        print(f"\n✅ Success! Email updated to: {user.email}")
        print(f"\nYou can now use this email for password reset.")
        
    except User.DoesNotExist:
        print(f"\n❌ User '{username}' not found!")
        print("\nAvailable users:")
        for user in users:
            print(f"  - {user.username}")

if __name__ == '__main__':
    setup_admin_email()
