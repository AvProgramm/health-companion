"""Read explicit portions without converting a container into grams."""
import re
from .models import Basis

# Counted containers share the existing piece basis; their names stay in the model request.
_COUNT_UNITS = ('piece', 'plate', 'packet', 'bowl', 'serving', 'cup', 'glass', 'can', 'slice', 'spoon', 'mug')
# Keep singular and plural spellings in one map, including glasses.
_COUNT_WORDS = {word: unit for unit in _COUNT_UNITS for word in (unit, unit + ('es' if unit == 'glass' else 's'))}
# Match a complete portion, so food names and unsupported units cannot become measurements.
_PORTION = re.compile(r'\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|' + '|'.join(_COUNT_WORDS) + r')?\s*', re.I)


def portion_basis(text):
    """Read an explicit physical portion or retain a count of named containers."""
    match = _PORTION.fullmatch(text)
    # Ignore an unrecognised portion because converting it would invent a measurement.
    if match is None:
        return Basis(amount=1, unit='piece')
    unit = (match[2] or 'piece').lower()
    unit = 'piece' if unit in _COUNT_WORDS else {'ml': 'mL', 'l': 'L'}.get(unit, unit)
    return Basis(amount=float(match[1].replace(',', '.')), unit=unit)


def one_serving_text(text):
    """Keep the named container while asking a model about exactly one serving."""
    match = _PORTION.fullmatch(text)
    unit = _COUNT_WORDS.get((match[2] or '').lower()) if match else None
    # A bare count or piece still means one item, not a newly guessed container.
    return f'1 {unit}' if unit and unit not in ('piece', 'serving') else '1'
