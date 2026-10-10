import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../app')))

from core.schedule import ScheduleState

class TestScheduleState(unittest.TestCase):
    def test_clear_cells(self):
        state = ScheduleState()
        state.subjects = [{
            "subject": "زیست",
            "hours": "2",
            "manual": ["مبحث ۱", "مبحث ۲"],
            "data": ["دیتا ۱", "دیتا ۲"],
            "links": {}
        }]

        # Clear cell (0, 0)
        state.clear_cells([[0, 0]])

        self.assertEqual(state.subjects[0]["manual"][0], "")

        table = state.compute_display_table()
        self.assertEqual(table["rows"][0]["cells"][0]["text"], "")
        self.assertTrue(table["rows"][0]["cells"][0]["manual"])

if __name__ == "__main__":
    unittest.main()
