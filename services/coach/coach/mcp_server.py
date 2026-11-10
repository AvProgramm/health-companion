"""Serve two read-only tools to an MCP client over stdio, with hand-written JSON-RPC."""
import json
import sys
from pathlib import Path
from .rag.retriever import knowledge

# The MCP revision this server speaks
PROTOCOL_VERSION = '2025-06-18'
# A fictional diary day, so no real record can ever reach a client
DEMO_DAY_FILE = Path(__file__).resolve().parents[3] / 'eval' / 'fixtures' / 'ledger_golden.json'
# JSON-RPC's standard error codes
PARSE_ERROR = -32700
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602

# Exactly what a client may call
TOOL_LIST = [
    {'name': 'search_evidence', 'description': 'Search the reviewed health guidance cards.',
     'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query'], 'additionalProperties': False}},
    {'name': 'get_demo_day', 'description': 'Return one fictional diary day. Never real data.',
     'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}},
]


def search_evidence(arguments):
    """Return the reviewed cards for a query, with their sources."""
    # Ignore a query that is not text, because there is nothing to search for
    query = arguments.get('query')
    if not isinstance(query, str) or not query.strip():
        raise ValueError('Send a query as text.')
    return [{'title': card['title'], 'text': card['text'], 'source': card['source'], 'date': card['source_date'], 'url': card['url']} for card in knowledge().search(query)]


def get_demo_day(_arguments):
    """Return the fictional day from the golden fixture."""
    return json.loads(DEMO_DAY_FILE.read_text(encoding='utf-8'))


# The code behind each listed tool
TOOLS = {'search_evidence': search_evidence, 'get_demo_day': get_demo_day}


def initialize(_params):
    """Return what this server is and what it can do."""
    return {'protocolVersion': PROTOCOL_VERSION, 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'health-companion', 'version': '0.1.0'}}


def ping(_params):
    """Return an empty result, which is how MCP answers a ping."""
    return {}


def list_tools(_params):
    """Return the two tools a client may call."""
    return {'tools': TOOL_LIST}


def call_tool(params):
    """Return one tool's output as MCP text content."""
    # Refuse anything that is not on the fixed list
    tool = TOOLS.get(params.get('name'))
    if tool is None:
        raise ValueError(f"Unknown tool. Available: {', '.join(TOOLS)}.")
    return {'content': [{'type': 'text', 'text': json.dumps(tool(params.get('arguments') or {}))}], 'isError': False}


# Every method this server answers; a new one is one more entry here
METHODS = {'initialize': initialize, 'ping': ping, 'tools/list': list_tools, 'tools/call': call_tool}


def error(identifier, code, message):
    """Return a JSON-RPC error response."""
    return {'jsonrpc': '2.0', 'id': identifier, 'error': {'code': code, 'message': message}}


def handle(request):
    """Return the response to one JSON-RPC message, or None for a notification."""
    # Ignore a notification, because JSON-RPC forbids answering one
    if 'id' not in request:
        return None
    identifier = request['id']

    # Refuse a method this server does not offer
    method = METHODS.get(request.get('method'))
    if method is None:
        return error(identifier, METHOD_NOT_FOUND, 'Unknown method.')

    # Run it, reporting bad arguments as a protocol error
    try:
        return {'jsonrpc': '2.0', 'id': identifier, 'result': method(request.get('params') or {})}
    except ValueError as problem:
        return error(identifier, INVALID_PARAMS, str(problem))


def serve(lines, write):
    """Answer each line of input, writing one response object for each request."""
    for line in lines:
        # Ignore a blank line, because it carries no message
        if not line.strip():
            continue

        # Report anything that is not one JSON object, and keep serving
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError
        except ValueError:
            write(error(None, PARSE_ERROR, 'Send one JSON object per line.'))
            continue

        response = handle(request)
        if response is not None:
            write(response)


def write_line(response):
    """Write one response to stdout, flushing so the client sees it at once."""
    sys.stdout.write(json.dumps(response) + '\n')
    sys.stdout.flush()


if __name__ == '__main__':
    serve(sys.stdin, write_line)
