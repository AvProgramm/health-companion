"""Check the MCP server offers exactly its two tools and refuses everything else."""
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from coach import mcp_server


def call(method, params=None, identifier=1):
    """Return the server's response to one request."""
    return mcp_server.handle({'jsonrpc': '2.0', 'id': identifier, 'method': method, 'params': params or {}})


class McpTests(unittest.TestCase):
    def test_lists_exactly_the_two_tools(self):
        self.assertEqual({tool['name'] for tool in call('tools/list')['result']['tools']}, {'search_evidence', 'get_demo_day'})

    def test_a_notification_gets_no_reply(self):
        self.assertIsNone(mcp_server.handle({'jsonrpc': '2.0', 'method': 'notifications/initialized'}))

    def test_an_unknown_tool_fails(self):
        self.assertEqual(call('tools/call', {'name': 'read_diary'})['error']['code'], mcp_server.INVALID_PARAMS)

    def test_an_unknown_method_fails(self):
        self.assertEqual(call('resources/list')['error']['code'], mcp_server.METHOD_NOT_FOUND)

    def test_a_search_needs_text(self):
        self.assertEqual(call('tools/call', {'name': 'search_evidence', 'arguments': {'query': 3}})['error']['code'], mcp_server.INVALID_PARAMS)

    def test_a_search_returns_cards_with_their_sources(self):
        class FakeRetriever:
            def search(self, _query):
                return [{'title': 'Fictional', 'text': 'Fictional text.', 'source': 'Fictional source', 'source_date': '2026-01-26', 'url': 'https://example.org/a', 'licence': 'not sent'}]

        with patch.object(mcp_server, 'knowledge', return_value=FakeRetriever()):
            found = json.loads(call('tools/call', {'name': 'search_evidence', 'arguments': {'query': 'salt'}})['result']['content'][0]['text'])
        self.assertEqual(found, [{'title': 'Fictional', 'text': 'Fictional text.', 'source': 'Fictional source', 'date': '2026-01-26', 'url': 'https://example.org/a'}])

    def test_bad_input_is_reported_and_serving_continues(self):
        replies = []
        mcp_server.serve(['not json\n', '[1]\n', '\n', json.dumps({'id': 2, 'method': 'ping'}) + '\n'], replies.append)
        self.assertEqual([reply.get('error', {}).get('code') for reply in replies], [mcp_server.PARSE_ERROR, mcp_server.PARSE_ERROR, None])
        self.assertEqual(replies[2], {'jsonrpc': '2.0', 'id': 2, 'result': {}})

    def test_a_real_process_answers_over_stdin_and_stdout(self):
        coach = Path(__file__).resolve().parents[1]
        messages = [{'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}, {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
                    {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'get_demo_day'}}, {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'read_diary'}}]
        done = subprocess.run([sys.executable, '-m', 'coach.mcp_server'], input=''.join(json.dumps(item) + '\n' for item in messages), capture_output=True, text=True, cwd=coach, env={**os.environ, 'PYTHONPATH': str(coach)}, timeout=60)
        replies = [json.loads(line) for line in done.stdout.splitlines()]
        self.assertEqual([reply['id'] for reply in replies], [1, 2, 3])
        self.assertEqual(replies[0]['result']['serverInfo']['name'], 'health-companion')
        self.assertFalse(replies[1]['result']['isError'])
        self.assertIn('error', replies[2])


if __name__ == '__main__':
    unittest.main()
