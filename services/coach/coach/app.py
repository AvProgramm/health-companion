"""Serve estimate and coach requests on the laptop loopback interface."""
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .cloud.config import web_config
from .cloud.session import verify_session
from .http_policy import read_http_policy
from .barcode import look_up_barcode
from .exercises import load_library
from .failures import PROVIDER_FAILURES
from .llm import COACH_MODELS, PHOTO_MODELS, HostedConversation
from .models import BarcodeReply, BarcodeRequest, CoachReply, CoachRequest, EstimateRequest, Estimate, NutritionistReply, NutritionistRequest, PacketLabelRequest, PhotoReply, PhotoRequest, TrainerReply, TrainerRequest
from .nutritionist import suggest_meals
from .packet_label import PacketBarcodeMismatch, read_packet_label
from .photo import list_foods
from .pipeline import estimate_food
from .rag.answer import answer_question
from .rag.retriever import knowledge
from .trainer import evidence_tool, plan_session

# Only the repository root .env is read; nothing is exposed through Vite.
load_dotenv(Path(__file__).resolve().parents[3] / '.env')
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# Keep exact local defaults, adding only configured deployment hosts and origins.
ALLOWED_HOSTS, ALLOWED_ORIGINS = read_http_policy()
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)
# Read once, because the bundled library only changes with a new build
EXERCISES = load_library()


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    """Return a generic validation error without echoing personal input."""
    return JSONResponse(status_code=422, content={'detail': 'Send only the fields this screen asks for.'})


def check_local(request):
    """Refuse a request from another site or one that is not JSON."""
    # Ignore an unrelated browser origin because only explicitly allowed frontends may use this boundary.
    origin = request.headers.get('origin')
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(403, 'Open the local diary to use this service.')
    if not request.headers.get('content-type', '').startswith('application/json'):
        raise HTTPException(415, 'Send a JSON request.')


async def credited(coach_reply, written_by_model, names=COACH_MODELS):
    """
    Return one coach's reply, naming the model that answered only when its words are on screen.

    Each request gets its own conversation, so two people asking at once cannot be
    credited with each other's model.
    """
    conversation = HostedConversation(names)
    reply = await coach_reply(conversation)
    return reply.model_copy(update={'answeredBy': conversation.answered_by}) if written_by_model(reply) else reply


@app.post('/api/estimate', response_model=Estimate)
async def estimate(request: Request, item: EstimateRequest):
    """Return a validated proposal without storing any submitted text."""
    check_local(request)
    if not item.name.strip():
        raise HTTPException(422, 'Enter a food name.')
    result = await estimate_food(item.name.strip(), item.portionText.strip())
    if result is None:
        raise HTTPException(503, 'No estimate is available. Add the food manually or try again later.')
    return result


@app.post('/api/trainer', response_model=TrainerReply)
async def trainer(request: Request, item: TrainerRequest):
    """Return ranked exercises for the goal, as a proposal the phone still checks."""
    check_local(request)
    return await credited(lambda ask: plan_session(item, EXERCISES, ask, [evidence_tool(knowledge())]), lambda reply: reply.source == 'ai')


@app.post('/api/nutritionist', response_model=NutritionistReply)
async def nutritionist(request: Request, item: NutritionistRequest):
    """Return checked food ideas for the typed goal, which only ever become drafts."""
    check_local(request)
    if not item.goal.strip():
        raise HTTPException(422, 'Tell the Nutritionist what you are looking for.')
    return await credited(lambda ask: suggest_meals(item.goal.strip(), knowledge(), ask), lambda reply: reply.mode == 'suggestions')


@app.post('/api/barcode', response_model=BarcodeReply)
async def barcode(request: Request, item: BarcodeRequest):
    """Return one packaged food's label values; only the barcode number is sent."""
    check_local(request)
    # Distinguish an unavailable provider from a completed search without a match.
    try:
        found = await look_up_barcode(item.code)
    except PROVIDER_FAILURES:
        raise HTTPException(503, 'Barcode lookup is temporarily unavailable.') from None
    if found is None:
        raise HTTPException(404, 'No matching label was found for this barcode.')
    return found


@app.post('/api/barcode/label', response_model=BarcodeReply)
async def barcode_label(request: Request, item: PacketLabelRequest):
    """Transcribe a label only from the photo the person chose to send."""
    check_local(request)
    try:
        result = await read_packet_label(item.image, item.code, item.name, HostedConversation(PHOTO_MODELS))
    except PacketBarcodeMismatch as problem:
        raise HTTPException(409, str(problem)) from problem
    except PROVIDER_FAILURES as problem:
        raise HTTPException(503, 'The label reader is unavailable right now.') from problem
    if result is None:
        raise HTTPException(422, 'Use a clear nutrition panel photo and supply the product name if needed.')
    return result


@app.post('/api/coach', response_model=CoachReply)
async def coach(request: Request, item: CoachRequest):
    """Return an answer checked against reviewed cards, or an honest reason for none."""
    check_local(request)
    # Ignore diary context because the selected Gemini account is on the unpaid tier.
    if item.context:
        raise HTTPException(403, 'Diary sharing is paused for the current free-tier setup. Send only your question.')
    if not item.question.strip():
        raise HTTPException(422, 'Type a question first.')
    return await credited(lambda ask: answer_question(item.question.strip(), knowledge(), ask, item.context), lambda reply: reply.mode in ('answer', 'general'))


@app.post('/api/photo', response_model=PhotoReply)
async def photo(request: Request, item: PhotoRequest):
    """Return foods from one explicitly selected photo without saving it."""
    check_local(request)
    return await credited(lambda ask: list_foods(item.image, ask), lambda reply: reply.mode == 'foods', PHOTO_MODELS)


@app.get('/api/firebase/config')
async def firebase_config():
    """Return only public Firebase app settings without caching them."""
    return JSONResponse(web_config(), headers={'Cache-Control': 'no-store'})


@app.post('/api/firebase/account')
async def firebase_account(request: Request):
    """Return the verified account without accepting a caller-selected owner."""
    check_local(request)
    session = await verify_session(request.headers.get('authorization'))
    return JSONResponse({'uid': session.uid, 'displayName': session.display_name}, headers={'Cache-Control': 'no-store'})


@app.get('/api/health')
async def health():
    """Report completed service startup without calling providers or exposing settings."""
    return JSONResponse({'status': 'ok'}, headers={'Cache-Control': 'no-store'})
