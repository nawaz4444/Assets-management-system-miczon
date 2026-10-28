import logging
from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class RecoveryThrottle(AnonRateThrottle):
    rate = '10/hour'
    scope = 'password_recovery'


class RecoveryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RecoveryThrottle]

    def get_user(self, data, lock=False):
        if not all(isinstance(data.get(field), str) and 0 < len(data[field]) <= 512 for field in ('uid', 'token')):
            return None
        try:
            uid = force_str(urlsafe_base64_decode(data.get('uid', '')))
            users = get_user_model().objects
            if lock:
                users = users.select_for_update()
            user = users.get(pk=uid, is_active=True)
            if default_token_generator.check_token(user, data.get('token', '')):
                return user
        except (ValueError, TypeError, OverflowError, UnicodeDecodeError, get_user_model().DoesNotExist):
            pass
        return None


class PasswordResetRequest(RecoveryView):
    def post(self, request):
        email = serializers.EmailField().run_validation(request.data.get('email'))
        # The same public response is used for known and unknown addresses.
        for user in get_user_model().objects.filter(email__iexact=email, is_active=True):
            if not user.has_usable_password():
                continue
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            url = f'{settings.FRONTEND_URL.rstrip("/")}/reset-password/{uid}/{token}'
            try:
                send_mail('Reset your AssetZone password', f'Use this link to reset your password:\n\n{url}\n\nIf you did not request this, ignore this email.', settings.DEFAULT_FROM_EMAIL, [user.email])
            except Exception:
                logger.exception('Password recovery email delivery failed')
        return Response({'status': 'success', 'message': 'If an eligible account exists, a reset link will be sent to that email address.'})


class PasswordResetValidate(RecoveryView):
    def post(self, request):
        user = self.get_user(request.data)
        if not user:
            return Response({'message': 'This reset link is invalid or expired.'}, status=400)
        return Response({'status': 'success', 'username': user.get_username()})


class PasswordResetConfirm(RecoveryView):
    @transaction.atomic
    def post(self, request):
        user = self.get_user(request.data, lock=True)
        if not user:
            return Response({'message': 'This reset link is invalid or expired.'}, status=400)
        password = serializers.CharField(trim_whitespace=False, max_length=4096).run_validation(request.data.get('new_password'))
        try:
            password_validation.validate_password(password, user)
        except ValidationError as error:
            return Response({'message': ' '.join(error.messages)}, status=400)
        user.set_password(password)
        user.save(update_fields=['password'])
        Token.objects.filter(user=user).delete()
        return Response({'status': 'success', 'message': 'Password reset. Sign in with your new password.'})
