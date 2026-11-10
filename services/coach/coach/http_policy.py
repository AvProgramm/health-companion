"""Read exact deployment hosts and frontend origins while preserving local defaults."""
import os
import re
from urllib.parse import urlsplit

# Keep the current local preview, dev server and test client available.
_LOCAL_HOSTS = ('127.0.0.1', 'localhost', 'testserver')
_LOCAL_ORIGINS = ('http://localhost:4173', 'http://127.0.0.1:4173',
                  'http://localhost:5173', 'http://127.0.0.1:5173')
# Require individual DNS labels or IPv4 labels, never wildcard/scheme/path settings.
_HOST = re.compile(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*')


def checked_host(value):
    """Return one exact hostname or reject an unsafe deployment setting."""
    value = value.strip().lower()
    if len(value) > 253 or _HOST.fullmatch(value) is None:
        raise ValueError('Deployment hosts must be exact hostnames without wildcards, schemes, ports or paths.')
    return value


def checked_origin(value):
    """Return a bare HTTPS deployment origin, allowing HTTP only for local use."""
    parsed = urlsplit(value.strip())
    host = checked_host(parsed.hostname or '')
    # Ignore a broad, insecure or non-origin URL because it cannot identify one frontend.
    if (parsed.scheme not in ('http', 'https') or (parsed.scheme == 'http' and host not in _LOCAL_HOSTS)
            or parsed.username is not None or parsed.password is not None
            or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise ValueError('Frontend origins must be exact HTTPS origins without credentials, paths or queries.')
    port = parsed.port
    default_port = 443 if parsed.scheme == 'https' else 80
    suffix = f':{port}' if port is not None and port != default_port else ''
    return f'{parsed.scheme}://{host}{suffix}'


def read_http_policy():
    """Return local defaults plus explicitly configured deployment hosts and origins."""
    hosts = [*_LOCAL_HOSTS]
    origins = [*_LOCAL_ORIGINS]
    # Render supplies this exact service hostname; it is not an allowance for all Render apps.
    deployed_host = os.getenv('RENDER_EXTERNAL_HOSTNAME', '').strip()
    if deployed_host:
        hosts.append(checked_host(deployed_host))
    for value in os.getenv('COACH_ALLOWED_HOSTS', '').split(','):
        if value.strip():
            hosts.append(checked_host(value))
    for value in os.getenv('COACH_ALLOWED_ORIGINS', '').split(','):
        if value.strip():
            origins.append(checked_origin(value))
    return tuple(dict.fromkeys(hosts)), tuple(dict.fromkeys(origins))
