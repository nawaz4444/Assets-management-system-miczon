# Forgot Password Feature - Quick Start Guide

## ✅ Setup Complete!

Your admin account has been configured:
- **Username**: `nawaz`
- **Email**: `nawaz@miczon.com`

## How to Test the Feature

### Step 1: Access the Forgot Password Page
1. Navigate to: `http://localhost:3000/login`
2. Click the **"Forgot Password?"** link

### Step 2: Request Password Reset
1. Enter your email: `nawaz@miczon.com`
2. Click **"Send Reset Link"**
3. You'll see a success message

### Step 3: Get the Reset Link
Since we're in development mode, the email will be printed to the **Django console**.

**Check the terminal where `python manage.py runserver` is running.**

You'll see something like:
```
Content-Type: text/plain; charset="utf-8"
MIME-Version: 1.0
Content-Transfer-Encoding: 7bit
Subject: Password Reset Request - Inventory System
From: noreply@inventory.com
To: nawaz@miczon.com

Hello nawaz,

You requested a password reset for your Inventory System account.

Click the link below to reset your password:
http://localhost:3000/reset-password/MQ/xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx

This link will expire in 1 hour.
```

### Step 4: Use the Reset Link
1. **Copy the reset link** from the console
2. **Paste it in your browser** address bar
3. The page will validate the token automatically

### Step 5: Set New Password
1. Enter your new password (minimum 8 characters)
2. Confirm the password
3. Click **"Reset Password"**
4. You'll be automatically redirected to login after 3 seconds

### Step 6: Login with New Password
1. Use username: `nawaz`
2. Use your **new password**
3. You should be logged in successfully!

## Features Included

✨ **Modern UI** with Material-UI components
🔒 **Secure tokens** that expire in 1 hour
📧 **Email notifications** (console in dev, SMTP in production)
✅ **Password validation** (minimum 8 characters)
🔄 **Auto-redirect** after successful reset
👁️ **Password visibility toggle** for better UX
⚡ **Loading states** and error handling

## Troubleshooting

**Q: I don't see the email in the console**
- Make sure the Django server is running
- Check the terminal window where `python manage.py runserver` is running
- Scroll up to find the email output

**Q: The reset link says "Invalid or expired token"**
- Tokens expire after 1 hour
- Request a new reset link
- Make sure you copied the complete URL

**Q: I can't login after resetting**
- Make sure you're using the NEW password
- Clear your browser cache
- Try the forgot password flow again

## Production Setup (Optional)

To send real emails in production, edit `inventory_system/settings.py`:

```python
# Replace console backend with SMTP
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'nawaz@miczon.com'
EMAIL_HOST_PASSWORD = 'your-app-password'
DEFAULT_FROM_EMAIL = 'nawaz@miczon.com'
```

For Gmail, you'll need to:
1. Enable 2-Factor Authentication
2. Generate an App Password at: https://myaccount.google.com/apppasswords

---

**Ready to test!** 🚀

Navigate to `http://localhost:3000/login` and click "Forgot Password?" to begin.
