"""Check the packet photo flow without sending an image to a provider."""
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from coach.app import app


# Use a fictional image and products independent of Open Food Facts.
IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='


class PacketLabelTests(unittest.TestCase):
    def test_any_barcode_can_use_its_printed_basis_and_exact_values(self):
        """Read a gram label or a volume serving and preserve missing values."""
        for code, basis in (
            ('9556001234567', {'amount': 100, 'unit': 'g'}),
            ('12345678', {'amount': 30, 'unit': 'mL'}),
        ):
            with self.subTest(code=code):
                ask = AsyncMock(return_value={
                    'name': 'Fictional spread', 'barcode': code, 'basis': basis,
                    'values': {'energy_kj': '418.4 kJ', 'fat_g': '8 g', 'protein_g': '<1 g',
                               'sodium_mg': '35 mg', 'monofat_g': '2 g', 'polyfat_g': '1 g'},
                })
                with patch('coach.app.HostedConversation', return_value=ask) as conversation:
                    response = TestClient(app).post('/api/barcode/label', json={
                        'code': code, 'name': '', 'image': IMAGE,
                    })

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['name'], 'Fictional spread')
                estimate = response.json()['estimate']
                self.assertEqual(estimate['basis'], basis)
                self.assertAlmostEqual(estimate['nutrients']['kcal'], 100, places=9)
                self.assertEqual(estimate['nutrients']['fat_g'], 8)
                self.assertEqual(estimate['nutrients']['sodium_mg'], 35)
                self.assertEqual(estimate['nutrients']['unsatfat_g'], 3)
                self.assertIsNone(estimate['nutrients']['protein_g'])
                conversation.assert_called_once_with(('Gemini',))
                ask.assert_awaited_once()

    def test_refuses_a_different_visible_barcode_or_conflicting_values(self):
        """Keep a different packet and contradictory nutrition out of the draft."""
        for barcode, values, expected in (
            ('12345678', {'kcal': '100 kcal'}, 409),
            (None, {'kcal': '100 kcal', 'energy_kj': '42 kJ'}, 422),
            (None, {'protein_g': '<1 g'}, 422),
        ):
            with self.subTest(barcode=barcode, values=values):
                ask = AsyncMock(return_value={'name': None, 'barcode': barcode,
                    'basis': {'amount': 100, 'unit': 'g'}, 'values': values})
                with patch('coach.app.HostedConversation', return_value=ask):
                    response = TestClient(app).post('/api/barcode/label', json={
                        'code': '9556001234567', 'name': 'Fictional spread', 'image': IMAGE,
                    })
                self.assertEqual(response.status_code, expected)

    def test_uses_the_user_supplied_name_when_the_panel_has_no_name(self):
        """Allow a label photo without a product name or visible barcode."""
        ask = AsyncMock(return_value={'name': None, 'barcode': None, 'basis': {'amount': 100, 'unit': 'g'},
                                      'values': {'fat_g': '8 g'}})
        with patch('coach.app.HostedConversation', return_value=ask):
            response = TestClient(app).post('/api/barcode/label', json={
                'code': '9556001234567', 'name': 'Fictional spread', 'image': IMAGE,
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['name'], 'Fictional spread')
