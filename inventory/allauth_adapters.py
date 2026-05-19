from allauth.account.adapter import DefaultAccountAdapter
from rest_framework.authtoken.models import Token
import urllib.parse

class CustomAccountAdapter(DefaultAccountAdapter):
    def _append_token_to_url(self, url, user):
        if user.is_authenticated:
            token, _ = Token.objects.get_or_create(user=user)
            parsed = urllib.parse.urlparse(url)
            query = dict(urllib.parse.parse_qsl(parsed.query))
            query['token'] = token.key
            query['user_id'] = user.id
            parsed = parsed._replace(query=urllib.parse.urlencode(query))
            return urllib.parse.urlunparse(parsed)
        return url

    def get_login_redirect_url(self, request):
        url = super().get_login_redirect_url(request)
        return self._append_token_to_url(url, request.user)

    def get_signup_redirect_url(self, request):
        url = super().get_signup_redirect_url(request)
        return self._append_token_to_url(url, request.user)
