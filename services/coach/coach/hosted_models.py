"""List every hosted model once: where it answers, and where its settings live on the laptop."""
import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class HostedModel:
    """Describe one OpenAI-compatible provider."""
    url: str
    key_setting: str
    model_setting: str
    default_model: str
    # The provider's own page, shown as plain text beside an estimate it wrote
    website: str
    # Whether an estimate may send our strict JSON schema, which only Groq documents
    strict_schema: bool = False
    # Extra request fields a coach sends to this provider
    coach_fields: dict = field(default_factory=dict)

    def key(self):
        """Return the laptop's key for this provider, or an empty string when none is set."""
        return os.getenv(self.key_setting, '')

    def model(self):
        """Return the model to ask, where a blank setting means the default."""
        return os.getenv(self.model_setting) or self.default_model


# Every hosted model, by the name shown on a card; a new provider is one more entry here.
# - Only Groq gets a reasoning level, because Google's guide does not list this Gemini model
#   among those that take one.
# - Gemini's default was Google's fastest stable free model on 9 Nov 2026, because an estimate
#   allows only six seconds.
# - Hugging Face downloads no weights; it is hosted inference like the other two.
HOSTED_MODELS = {
    'Groq': HostedModel('https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', 'GROQ_MODEL', 'openai/gpt-oss-20b',
                        'https://groq.com/', strict_schema=True, coach_fields={'reasoning_effort': 'low'}),
    'Gemini': HostedModel('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'GEMINI_API_KEY', 'GEMINI_MODEL',
                          'gemini-3.5-flash-lite', 'https://aistudio.google.com/'),
    'Hugging Face': HostedModel('https://router.huggingface.co/v1/chat/completions', 'HF_TOKEN', 'HF_MODEL',
                                'meta-llama/Llama-3.1-8B-Instruct:cheapest', 'https://huggingface.co/'),
}
