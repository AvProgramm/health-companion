"""Use reviewed manufacturer labels for exact product names and explicit counts."""
from .databases import Match, average_matches
from .models import Nutrients, Source
from .portions import explicit_piece_basis

# UK Original, per two biscuits (37.5 g), reviewed against the manufacturer's label on 11 Nov.
_ORIGINAL = Match(
    nutrients=Nutrients(kcal=136, protein_g=4.5, carbs_g=26, fibre_g=3.8, total_sugar_g=1.6,
        added_sugar_g=None, fat_g=0.8, satfat_g=0.2, unsatfat_g=None, sodium_mg=None),
    source=Source(provider='Weetabix UK', description='Weetabix Original, per two biscuits (37.5 g).',
        url='https://weetabix.co.uk/our-products/original-classic/weetabix/'),
    unit='piece',
    amount=2,
)

# Use exact aliases so chocolate, regional labels and other variants keep their own lookup.
_LABELS = {'weetabix': _ORIGINAL, 'weetabix original': _ORIGINAL, 'original weetabix': _ORIGINAL}


def label_estimate(name, portion_text):
    """Scale the matching label's published count to the requested number of pieces."""
    label = _LABELS.get(' '.join(name.casefold().split()))
    # Ignore an unmatched name because this label only describes the Original product.
    if label is None:
        return None
    basis = explicit_piece_basis(portion_text)
    # Ignore an unspecified count because it cannot be compared with a two-biscuit label.
    if basis is None:
        return None

    result = average_matches([label], basis)
    return result.model_copy(update={'reason': 'Scaled from the published UK Original label. Check your packet.'})
