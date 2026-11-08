"""Serve estimate and coach requests on the laptop loopback interface."""
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .exercises import load_library
from .llm import ask_groq
from .models import EstimateRequest, Estimate, TrainerReply, TrainerRequest
from .pipeline import estimate_food
from .trainer import plan_session

# Only the repository root .env is read; nothing is exposed through Vite.
load_dotenv(Path(__file__).resolve().parents[3] / '.env')
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])
# Read once, because the bundled library only changes with a new build
EXERCISES = load_library()
# The only pages allowed to call this service
LOCAL_ORIGINS = ('http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:5173', 'http://127.0.0.1:5173')


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    """Return a generic validation error without echoing personal input."""
    return JSONResponse(status_code=422, content={'detail': 'Send only the fields this screen asks for.'})


def check_local(request):
    """Refuse a request from another site or one that is not JSON."""
    # Ignore an unrelated browser origin because this service is laptop-only.
    origin = request.headers.get('origin')
    if origin and origin not in LOCAL_ORIGINS:
        raise HTTPException(403, 'Open the local diary to use this service.')
    if not request.headers.get('content-type', '').startswith('application/json'):
        raise HTTPException(415, 'Send a JSON request.')


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
    return await plan_session(item, EXERCISES, ask_groq)
