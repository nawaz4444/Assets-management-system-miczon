# Password Reset Feature - Setup Instructions

## Overview
A complete "Forgot Password" feature has been implemented for the Inventory Management System.

## What's Been Added

### Backend (Django)
1. **Email Configuration** in `settings.py`:
   - Development mode: Emails print to console
   - Production mode: SMTP configuration ready (commented out)

2. **Three API Endpoints**:
   - `POST /api/password-reset/request/` - Request password reset
   - `POST /api/password-reset/validate/` - Validate reset token
   - `POST /api/password-reset/confirm/` - Confirm new password

3. **Security Features**:
   - Secure token generation using Django's built-in token generator
   - 1-hour token expiration
   - Password validation (minimum 8 characters)
   - No user enumeration (same response whether email exists or not)

### Frontend (React)
1. **ForgotPassword.jsx** - Email submission page
2. **ResetPassword.jsx** - Password reset form with token validation
3. **Updated Login.jsx** - Added "Forgot Password?" link
4. **Updated App.jsx** - Added routes for password reset flow

## Setup Instructions

### 1. Ensure Admin User Has Email
For the password reset to work, users must have an email address. To set one:

```bash
# Access Django shell
python manage.py shell
```

Then run:
```python
from django.contrib.auth.models import User
admin = User.objects.get(username='admin')  # Replace 'admin' with your username
admin.email = 'admin@example.com'  # Set email
admin.save()
print(f"Email set to: {admin.email}")
exit()
```

### 2. Test the Feature

#### Development Testing (Console Email Backend)
1. Start the Django server (already running)
2. Navigate to `http://localhost:3000/login`
3. Click "Forgot Password?"
4. Enter the admin email address
5. Check the **Django console** for the reset email with the link
6. Copy the reset link and paste it in your browser
7. Set a new password

#### Production Setup (Real Email)
To send actual emails, update `settings.py`:

```python
# Comment out console backend
# EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Uncomment and configure SMTP
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your-email@gmail.com'
EMAIL_HOST_PASSWORD = 'your-app-password'  # Use App Password for Gmail
DEFAULT_FROM_EMAIL = 'your-email@gmail.com'
```

**For Gmail:**
1. Enable 2-Factor Authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the App Password (not your regular password)

## How It Works

1. **User clicks "Forgot Password?"** on login page
2. **Enters email address** → Backend generates secure token
3. **Email sent** with reset link (format: `/reset-password/{uid}/{token}`)
4. **User clicks link** → Frontend validates token
5. **User enters new password** → Backend updates password
6. **Auto-redirect to login** with success message

## Security Features

✅ Tokens expire after 1 hour
✅ One-time use tokens (invalidated after password change)
✅ No user enumeration (same response for valid/invalid emails)
✅ Password strength validation
✅ Secure token generation using Django's cryptographic functions

## Testing Checklist

- [ ] Admin user has email set
- [ ] Can access forgot password page
- [ ] Email is sent (check console in dev mode)
- [ ] Reset link works
- [ ] Can set new password
- [ ] Old password no longer works
- [ ] New password works for login
- [ ] Expired/invalid tokens show error message
- [ ] Can request new reset if link expired

## Troubleshooting

**Email not appearing in console?**
- Check Django server console output
- Verify user email is set in database

**Token invalid error?**
- Tokens expire after 1 hour
- Request a new reset link

**Can't login after reset?**
- Ensure you're using the NEW password
- Clear browser cache/localStorage

## Next Steps

For production deployment:
1. Configure SMTP settings
2. Customize email template
3. Add rate limiting to prevent abuse
4. Consider adding CAPTCHA to reset request form
