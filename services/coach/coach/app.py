"""Serve food-only estimate requests on the laptop loopback interface."""
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .models import EstimateRequest, Estimate
from .pipeline import estimate_food

# Only the repository root .env is read; nothing is exposed through Vite.
load_dotenv(Path(__file__).resolve().parents[3] / '.env')
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    """Return a generic validation error without echoing personal input."""
    return JSONResponse(status_code=422, content={'detail': 'Send only a food name and portion text.'})


@app.post('/api/estimate', response_model=Estimate)
async def estimate(request: Request, item: EstimateRequest):
    """Return a validated proposal without storing any submitted text."""
    # Ignore an unrelated browser origin because this service is laptop-only.
    origin = request.headers.get('origin')
    if origin and origin not in ('http://localhost:4173', 'http://127.0.0.1:4173',
                                  'http://localhost:5173', 'http://127.0.0.1:5173'):
        raise HTTPException(403, 'Open the local diary to request an estimate.')
    if not request.headers.get('content-type', '').startswith('application/json'):
        raise HTTPException(415, 'Send a JSON estimate request.')
    if not item.name.strip():
        raise HTTPException(422, 'Enter a food name.')
    result = await estimate_food(item.name.strip(), item.portionText.strip())
    if result is None:
        raise HTTPException(503, 'No estimate is available. Add the food manually or try again later.')
    return result
