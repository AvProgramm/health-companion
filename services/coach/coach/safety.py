"""Refuse what a diary app should never try to answer, before any search or model runs."""
import re
from dataclasses import dataclass

# Things a person might be taking, for the rules about doses
MEDICINES = r'insulin|metformin|medicine|medication|meds|tablets?|pills?|statins?|paracetamol|ibuprofen'
# Moments in time, which turn a question about food into a question about the diary
LOGGED_TIMES = r'today|yesterday|last (night|week)|this week|on (mon|tues|wednes|thurs|fri|satur|sun)day'


@dataclass(frozen=True)
class Refusal:
    """One kind of message that must not be answered, and what to say instead."""
    kind: str
    pattern: re.Pattern
    message: str


def rule(kind, pattern, message):
    """Return a refusal rule with its pattern compiled to ignore case."""
    return Refusal(kind, re.compile(pattern, re.IGNORECASE), message)


# Checked in order, most urgent first; a new kind of refusal is one more entry here
RULES = (
    rule('emergency', r"chest (pain|pressure|tightness)|heart attack|having a stroke|(can'?t|cannot|struggling to|trouble) breath|pass(ed|ing)? out|unconscious|overdos|seizure|severe bleeding|coughing (up )?blood",
         'This could be urgent. Please call your local emergency number or go to the nearest emergency department now.'),
    rule('self_harm', r"\b(kill|hurt|harm)\s+myself\b|suicid|self[- ]?harm|end(ing)? my life|end it all|(don'?t|do not) want to (live|be alive)",
         'I am sorry you are going through this, and you deserve support right now. Please call your local emergency number or a crisis line, or reach out to someone you trust.'),
    rule('dosing', rf'\b(dose|dosage)\b|\bunits? of insulin\b|\bhow (much|many)\b[^.?!]*\b({MEDICINES})\b|\b(increase|decrease|reduce|raise|lower|change|adjust|stop|skip|double|halve)\s+(taking\s+)?(my\s+|the\s+)?({MEDICINES})\b',
         'I cannot advise on doses or changing medicine. Please ask your doctor, pharmacist or care team, and do not change a dose on your own.'),
    rule('diagnosis', r"\bdiagnos(e|is) (me|my)\b|\bcan you diagnose\b|what('?s| is) wrong with me|\bdo i have (diabetes|prediabetes|cancer|hypertension|high blood pressure|anaemia|anemia|covid|depression|an eating disorder|a disease|an infection|a tumou?r)\b|\bam i (diabetic|prediabetic|anaemic|anemic|depressed)\b|\bis (this|it) (cancer|diabetes|a tumou?r)\b",
         'I cannot diagnose conditions. A doctor can check this properly. I can share general guidance on sleep, food or activity.'),
    rule('extreme_diet', r'\b(lose|drop|shed)\s+(([3-9]|\d{2,})\s*(kg|kilos?)|([7-9]|\d{2,})\s*(pounds?|lbs?))\s+(in|per)\s+(a\s+|one\s+|\d+\s+)?(day|week)s?\b|\b(eat|eating|live on|survive on)\s+(only\s+|just\s+)?[1-9]\d{0,2}\s*(calories|kcal|cal)\b|\bstarv(e|ing) myself\b|\bmake myself (vomit|sick|throw up)\b|\bpurg(e|ing)\b|\blaxatives?\b',
         'I will not help with extreme dieting, because it can be harmful. A doctor or dietitian can help you set a safe goal.'),
    rule('injection', r"\b(ignore|disregard|forget)\b[^.?!]*\b(instructions?|rules?|prompts?)\b|\bsystem prompt\b|\b(another|other)\s+(user|person|people)\b|\bsomeone else'?s\b",
         'I can only answer general health questions from reviewed guidance, and I cannot see anyone\'s diary.'),
    rule('diary', rf'\bmy (protein|calories|carbs?|fat|fibre|fiber|sugar|sodium|meals?|weight|sleep|workouts?)\b[^.?!]*\b({LOGGED_TIMES})\b|\bdid i (eat|log|drink|sleep|train)\b|\bmy (diary|log)\b',
         'Your diary stays on this device, so the Coach cannot see it. Use the box on Today to ask about what you have logged.'),
)


def check_safety(text):
    """Return the first refusal that applies to a message, or None if it can be answered."""
    return next((refusal for refusal in RULES if refusal.pattern.search(text)), None)
