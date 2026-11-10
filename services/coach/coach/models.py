"""Validate every request and reply that crosses the service boundary."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

# The hosted model that wrote a reply; unset when the words on screen are not a model's
AnsweredBy = Annotated[str, Field(min_length=1, max_length=40)] | None


class StrictModel(BaseModel):
    """Reject extra fields and non-finite numbers at every boundary."""
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


# The equipment and areas the Trainer card can send, matching the app's own lists
Equipment = Literal['dumbbells', 'band', 'pull_up_bar', 'kettlebells', 'barbell', 'ez_curl_bar', 'cable', 'machine',
                    'medicine_ball', 'exercise_ball', 'foam_roll']
Area = Literal['push', 'pull', 'legs', 'core']


class TrainerRequest(StrictModel):
    """Accept only what the person typed or picked on the Trainer card."""
    goal: str = Field(min_length=1, max_length=200)
    minutes: int = Field(ge=1, le=600)
    equipment: list[Equipment] = Field(max_length=11)
    areas: list[Area] = Field(min_length=1, max_length=4)
    level: Literal['beginner', 'intermediate', 'expert']


class TrainerReply(StrictModel):
    """Return a ranked proposal that the phone still has to check."""
    exerciseIds: list[str] = Field(max_length=16)
    reason: str = Field(min_length=1, max_length=300)
    source: Literal['ai', 'library', 'refused']
    answeredBy: AnsweredBy = None


class CoachRequest(StrictModel):
    """Accept the typed question and, only when the person switched it on, one line per recent diary day."""
    question: str = Field(min_length=1, max_length=300)
    context: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(default=[], max_length=7)


class CoachClaim(StrictModel):
    """Hold one sentence and the cards behind it; a general answer has none."""
    text: str = Field(min_length=1, max_length=300)
    cites: list[int] = Field(max_length=3)


class CoachSource(StrictModel):
    """Identify one reviewed card, shown as plain text."""
    number: int = Field(ge=1)
    title: str
    source: str
    sourceDate: str
    url: str
    excerpt: str


class CoachReply(StrictModel):
    """Return a checked answer, the evidence itself, or an honest reason for neither."""
    mode: Literal['answer', 'general', 'excerpts', 'no_evidence', 'refused']
    message: str = Field(min_length=1, max_length=400)
    claims: list[CoachClaim] = Field(max_length=4)
    sources: list[CoachSource] = Field(max_length=3)
    answeredBy: AnsweredBy = None


class NutritionistRequest(StrictModel):
    """Accept only the goal the person typed."""
    goal: str = Field(min_length=1, max_length=200)


class NutritionistSuggestion(StrictModel):
    """Hold one idea: text for the entry box, and the checked reason behind it."""
    title: str = Field(min_length=1, max_length=60)
    entry: str = Field(min_length=1, max_length=100)
    why: CoachClaim


class NutritionistReply(StrictModel):
    """Return checked food ideas, the evidence itself, or an honest reason for neither."""
    mode: Literal['suggestions', 'excerpts', 'no_evidence', 'refused']
    message: str = Field(min_length=1, max_length=400)
    suggestions: list[NutritionistSuggestion] = Field(max_length=3)
    sources: list[CoachSource] = Field(max_length=3)
    answeredBy: AnsweredBy = None


class EstimateRequest(StrictModel):
    """Accept only the food name and portion text."""
    name: str = Field(min_length=1, max_length=80)
    portionText: str = Field(max_length=80)


class BarcodeRequest(StrictModel):
    """Accept only the digits printed under a barcode."""
    code: str = Field(pattern=r'^\d{8,14}$')


class Basis(StrictModel):
    """Describe the exact portion covered by the returned values."""
    amount: float = Field(gt=0)
    unit: Literal['g', 'kg', 'mL', 'L', 'piece']


class Nutrients(StrictModel):
    """Require every nutrient key while allowing unknown values."""
    kcal: float | None = Field(ge=0)
    protein_g: float | None = Field(ge=0)
    carbs_g: float | None = Field(ge=0)
    fibre_g: float | None = Field(ge=0)
    total_sugar_g: float | None = Field(ge=0)
    added_sugar_g: float | None = Field(ge=0)
    fat_g: float | None = Field(ge=0)
    satfat_g: float | None = Field(ge=0)
    # Monounsaturated plus polyunsaturated; unknown unless both parts are known
    unsatfat_g: float | None = Field(ge=0)
    # Milligrams, as printed on labels
    sodium_mg: float | None = Field(ge=0)


class Spread(StrictModel):
    """Keep a non-negative lower and upper bound."""
    low: float = Field(ge=0)
    high: float = Field(ge=0)


class Source(StrictModel):
    """Identify each record used without inventing a citation."""
    provider: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=240)
    url: str = Field(pattern=r'^https://', max_length=500)


class Estimate(StrictModel):
    """Check a database or model proposal before it reaches the browser."""
    basis: Basis
    nutrients: Nutrients
    range: dict[str, Spread | None]
    sourceKind: Literal['database', 'ai_estimate', 'web_estimate']
    reason: str = Field(min_length=1, max_length=500)
    sources: list[Source] = Field(min_length=1, max_length=12)

    @model_validator(mode='after')
    def check_ranges(self):
        """Reject missing bounds or bounds that contradict the centre value."""
        values = self.nutrients.model_dump()
        # Ignore an empty proposal because it cannot help the user estimate nutrition.
        if all(value is None for value in values.values()):
            raise ValueError('No nutrition values were returned. Try a clearer food name and portion.')
        if self.range.keys() != values.keys():
            raise ValueError('Return a range key for every nutrient.')
        for key, value in values.items():
            spread = self.range[key]
            if value is None:
                if spread is not None:
                    raise ValueError('Keep an unknown nutrient range null.')
            elif spread is None or not spread.low <= value <= spread.high:
                raise ValueError('Keep each value inside its range.')
        return self


class BarcodeReply(StrictModel):
    """Return one packaged food's name and label values."""
    name: str = Field(min_length=1, max_length=80)
    estimate: Estimate


class PhotoRequest(StrictModel):
    """Accept only one photo, already shrunk on the phone to a small JPEG."""
    image: str = Field(pattern=r'^data:image/jpeg;base64,[A-Za-z0-9+/=]+$', max_length=1_500_000)


class PhotoFood(StrictModel):
    """Hold one food seen in a photo: its name, and how it would be typed in the diary."""
    name: str = Field(min_length=1, max_length=40)
    entry: str = Field(min_length=1, max_length=60)


class PhotoReply(StrictModel):
    """Return the checked foods in a photo, or an honest reason for none."""
    mode: Literal['foods', 'nothing']
    message: str = Field(min_length=1, max_length=200)
    foods: list[PhotoFood] = Field(max_length=8)
    answeredBy: AnsweredBy = None
