"""Retrieve bounded public nutrition evidence without reading a diary."""
from dataclasses import dataclass
import ipaddress
import os
import re
from urllib.parse import urlsplit
import httpx
from .databases import relevant

# Three short excerpts keep retrieval bounded for the phone request deadline.
MAX_SOURCES = 3
MAX_CONTENT_LENGTH = 1800


@dataclass
class WebEvidence:
    """Keep an actual retrieved URL beside its untrusted excerpt."""
    id: str
    title: str
    url: str
    content: str


def public_url(value):
    """Accept public HTTPS links without credentials or local addresses."""
    if not isinstance(value, str) or len(value) > 500:
        return False
    parsed = urlsplit(value)
    host = parsed.hostname or ''
    if parsed.scheme != 'https' or not host or parsed.username or parsed.password or host == 'localhost' or host.endswith(('.local', '.localhost')):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return '.' in host


def parse_search_results(payload, name):
    """Keep relevant public snippets that actually mention numeric nutrition."""
    results = payload.get('results') if isinstance(payload, dict) else None
    if not isinstance(results, list):
        return []
    evidence = []
    seen = set()
    for item in results:
        if not isinstance(item, dict) or not public_url(item.get('url')):
            continue
        title, content, url = item.get('title'), item.get('content'), item['url']
        if not isinstance(title, str) or not isinstance(content, str) or url in seen:
            continue
        if not relevant(name, title + ' ' + content) or not re.search(r'\d.*(?:kcal|calories|protein|fat)', content, re.I):
            continue
        # Ignore long HTML because only a short plain-text evidence excerpt is needed.
        content = re.sub(r'<[^>]+>', ' ', content)
        evidence.append(WebEvidence(f'source-{len(evidence) + 1}', title[:240], url, content[:MAX_CONTENT_LENGTH]))
        seen.add(url)
        if len(evidence) == MAX_SOURCES:
            break
    return evidence


async def search_nutrition(name, portion_text):
    """Search public nutrition pages only when composition lookup misses."""
    key = os.getenv('TAVILY_API_KEY', '')
    if not key:
        return []
    async with httpx.AsyncClient(timeout=3.0) as client:
        response = await client.post('https://api.tavily.com/search', headers={'Authorization': f'Bearer {key}'}, json={
            'query': f'{name} {portion_text} nutrition calories protein per serving',
            'search_depth': 'basic', 'max_results': 5, 'include_answer': False,
            'include_raw_content': False, 'include_images': False,
        })
    response.raise_for_status()
    return parse_search_results(response.json(), name)
