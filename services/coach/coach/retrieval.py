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
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ''
    except ValueError:
        # Ignore a malformed URL because it cannot be a usable source link.
        return False
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


async def search_barcode_labels(code, domains):
    """Retrieve bounded retailer excerpts using only the scanned barcode."""
    key = os.getenv('TAVILY_API_KEY', '')
    if not key:
        return []
    async with httpx.AsyncClient(timeout=4.0) as client:
        response = await client.post('https://api.tavily.com/search', headers={'Authorization': f'Bearer {key}'}, json={
            'query': f'"{code}" barcode product nutrition label energy fat per 100 g',
            'search_depth': 'basic', 'max_results': 5, 'include_domains': list(domains),
            'include_answer': False, 'include_raw_content': False, 'include_images': False,
        })
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get('results'), list):
        raise ValueError('The public label search returned an invalid result.')
    return parse_search_results(payload, code)


async def search_missing_nutrients(name, portion_text, missing):
    """Search once for missing labels with two small snippets and no generated answer."""
    key = os.getenv('TAVILY_API_KEY', '')
    if not key:
        return []
    labels = {'kcal': 'energy kcal', 'protein_g': 'protein', 'carbs_g': 'carbohydrate', 'fibre_g': 'dietary fibre',
        'total_sugar_g': 'total sugar', 'added_sugar_g': 'added sugar', 'fat_g': 'total fat',
        'satfat_g': 'saturated fat', 'unsatfat_g': 'unsaturated fat', 'sodium_mg': 'sodium mg'}
    query = f'{name} {portion_text} ' + ' '.join(labels[item] for item in missing) + ' nutrition per 100 g'
    async with httpx.AsyncClient(timeout=1.5) as client:
        response = await client.post('https://api.tavily.com/search', headers={'Authorization': f'Bearer {key}'}, json={
            'query': query, 'search_depth': 'basic', 'max_results': 2,
            'include_answer': False, 'include_raw_content': False, 'include_images': False,
        })
    response.raise_for_status()
    payload = response.json()
    results = payload.get('results', []) if isinstance(payload, dict) else []
    evidence = []
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict) or not public_url(item.get('url')):
            continue
        title, content = item.get('title'), item.get('content')
        if not isinstance(title, str) or not isinstance(content, str) or not relevant(name, title + ' ' + content):
            continue
        evidence.append(WebEvidence(f'missing-{len(evidence)+1}', title[:240], item['url'], content[:600]))
        if len(evidence) == 2:
            break
    return evidence
