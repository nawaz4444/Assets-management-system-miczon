from allauth.account.adapter import DefaultAccountAdapter
from rest_framework.authtoken.models import Token
import urllib.parse

class CustomAccountAdapter(DefaultAccountAdapter):
    def get_login_redirect_url(self, request):
        url = super().get_login_redirect_url(request)
        if request.user.is_authenticated:
            token, _ = Token.objects.get_or_create(user=request.user)
            # Append token safely handling existing query params
            parsed = urllib.parse.urlparse(url)
            query = dict(urllib.parse.parse_qsl(parsed.query))
            query['token'] = token.key
            query['user_id'] = request.user.id
            parsed = parsed._replace(query=urllib.parse.urlencode(query))
            return urllib.parse.urlunparse(parsed)
        return url
