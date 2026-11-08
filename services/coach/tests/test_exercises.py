"""Check the Trainer's exercise search against kit, areas, level and variety."""
import random
import unittest
from coach.exercises import load_library, search_exercises

# Every planner area and the widest level, so a test can vary one filter at a time
ALL_AREAS = ['push', 'pull', 'legs', 'core']
WIDEST_LEVEL = 'expert'
# More than the library holds, so limit cannot hide a result
NO_LIMIT = 1000
# No kit, a home set and a full gym
KITS = [[], ['dumbbells', 'band', 'kettlebells', 'pull_up_bar'],
        ['dumbbells', 'band', 'pull_up_bar', 'kettlebells', 'barbell', 'ez_curl_bar', 'cable', 'machine',
         'medicine_ball', 'exercise_ball', 'foam_roll']]


def fictional(name, equipment=(), category='legs', level='beginner', muscle='quadriceps', kind='strength', mechanic='compound'):
    """Return a fictional library entry where only the fields under test vary."""
    return {'id': f'fictional:{name}', 'name': name, 'category': category,
            'equipment': None if equipment is None else list(equipment), 'untracked': None, 'requires': [], 'minutes': 5,
            'cue': 'Fictional cue.', 'primaryMuscles': [muscle], 'imagePath': None, 'sourceEquipment': 'fictional',
            'level': level, 'kind': kind, 'mechanic': mechanic}


def names(found):
    """Return the names of the entries, for readable expectations."""
    return [entry['name'] for entry in found]


class EquipmentTests(unittest.TestCase):
    """Never offer the Trainer an exercise that needs kit the person does not have."""

    def test_keeps_bodyweight_and_owned_kit_only(self):
        """Keep exercises you can do with your kit, and refuse one whose kit is unknown."""
        entries = [fictional('squat', []), fictional('goblet squat', ['dumbbells']),
                   fictional('barbell squat', ['barbell']), fictional('banded goblet squat', ['dumbbells', 'band']),
                   fictional('mystery squat', None)]
        found = search_exercises(entries, ALL_AREAS, ['dumbbells'], WIDEST_LEVEL, NO_LIMIT)
        self.assertEqual(sorted(names(found)), ['goblet squat', 'squat'])

    def test_no_result_in_the_real_library_needs_missing_kit(self):
        """Hold for every exercise in the bundled library, at no kit, home kit and full gym."""
        library = load_library()
        for kit in KITS:
            found = search_exercises(library, ALL_AREAS, kit, WIDEST_LEVEL, NO_LIMIT)
            self.assertGreater(len(found), 0, kit)
            for entry in found:
                self.assertIsNotNone(entry['equipment'], entry['name'])
                self.assertLessEqual(set(entry['equipment']), set(kit), entry['name'])


class FilterTests(unittest.TestCase):
    """Run every hard filter before a model sees anything."""

    def test_returns_only_the_chosen_areas(self):
        """Leave out other areas, and an exercise with no area at all."""
        entries = [fictional('squat', category='legs'), fictional('row', category='pull'), fictional('neck', category=None)]
        self.assertEqual(names(search_exercises(entries, ['legs'], [], WIDEST_LEVEL, NO_LIMIT)), ['squat'])

    def test_level_is_a_ceiling(self):
        """Include easier exercises at each level, and never a harder one."""
        entries = [fictional('easy', level='beginner'), fictional('medium', level='intermediate'), fictional('hard', level='expert')]
        self.assertEqual(sorted(names(search_exercises(entries, ALL_AREAS, [], 'beginner', NO_LIMIT))), ['easy'])
        self.assertEqual(sorted(names(search_exercises(entries, ALL_AREAS, [], 'intermediate', NO_LIMIT))), ['easy', 'medium'])
        self.assertEqual(sorted(names(search_exercises(entries, ALL_AREAS, [], 'expert', NO_LIMIT))), ['easy', 'hard', 'medium'])

    def test_stretches_and_specialist_lifts_are_not_training_blocks(self):
        """Leave out stretching, strongman and Olympic lifts."""
        entries = [fictional('squat'), fictional('stretch', kind='stretching'), fictional('yoke', kind='strongman'),
                   fictional('snatch', kind='olympic weightlifting')]
        self.assertEqual(names(search_exercises(entries, ALL_AREAS, [], WIDEST_LEVEL, NO_LIMIT)), ['squat'])


class LimitTests(unittest.TestCase):
    """Decide what survives when limit cuts the list."""

    def test_limit_gives_every_muscle_a_place_first(self):
        """Keep one exercise per muscle before any muscle gets a second."""
        entries = [fictional('a quad 1'), fictional('a quad 2'), fictional('a quad 3'),
                   fictional('z glute', muscle='glutes'), fictional('z hamstring', muscle='hamstrings')]
        self.assertEqual(sorted(names(search_exercises(entries, ALL_AREAS, [], WIDEST_LEVEL, 3))), ['a quad 1', 'z glute', 'z hamstring'])

    def test_compound_comes_before_isolation_for_a_muscle(self):
        """Keep the compound exercise when one muscle has room for only one."""
        entries = [fictional('a curl', mechanic='isolation'), fictional('z squat', mechanic='compound')]
        self.assertEqual(names(search_exercises(entries, ALL_AREAS, [], WIDEST_LEVEL, 1)), ['z squat'])

    def test_the_level_closest_to_the_ceiling_comes_first(self):
        """Give an intermediate person an intermediate exercise before a beginner one."""
        entries = [fictional('a easy', level='beginner'), fictional('z medium', level='intermediate')]
        self.assertEqual(names(search_exercises(entries, ALL_AREAS, [], 'intermediate', 1)), ['z medium'])

    def test_result_does_not_depend_on_input_order(self):
        """Give the same shortlist however the library happens to be ordered."""
        library = load_library()
        shuffled = library[:]
        random.Random(34871500).shuffle(shuffled)
        self.assertEqual(search_exercises(library, ALL_AREAS, KITS[1], 'intermediate', 40), search_exercises(shuffled, ALL_AREAS, KITS[1], 'intermediate', 40))

    def test_real_shortlist_is_varied_and_not_alphabetical(self):
        """Cover many muscles, unlike the first entries of the alphabetical library."""
        found = search_exercises(load_library(), ALL_AREAS, KITS[1], 'intermediate', 40)
        self.assertEqual(len(found), 40)
        self.assertGreaterEqual(len({entry['primaryMuscles'][0] for entry in found}), 8)
        self.assertGreater(len({entry['name'][0] for entry in found}), 8)


if __name__ == '__main__':
    unittest.main()
