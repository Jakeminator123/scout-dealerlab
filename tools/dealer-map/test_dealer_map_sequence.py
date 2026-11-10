import copy
import unittest

from dealer_map_sequence import plan_sequence, suggest_p1_sequence


def model():
    def action(id, before, after, placement=None):
        return {"id": id, "label": id, "from": before, "to": after,
                "status": "approved", "categoryId": "player" if placement else "bridge",
                "cardPlacementId": placement, "returnMode": "unknown",
                "media": {"sha256": "a" * 64, "startFrame": 30, "endFrameExclusive": 90,
                          "fps": 30, "bindingValid": True}}
    return {"actions": [action("bridge.to-redo", "VILA", "REDO"),
                        action("deal.seat-1.first", "REDO", "REDO", "seat-1.card-1"),
                        action("deal.seat-1.second", "REDO", "REDO", "seat-1.card-2"),
                        action("bridge.to-vila", "REDO", "VILA")],
            "placements": [{"id": "seat-1.card-1", "code": "P1.K1"},
                           {"id": "seat-1.card-2", "code": "P1.K2"}]}


class SequencePlanTests(unittest.TestCase):
    def test_via_redo_skeleton_is_not_a_direct_or_approved_route(self):
        plan = suggest_p1_sequence(model(), 2)
        self.assertEqual(plan["returnMode"], "via-redo")
        self.assertEqual(plan["finalPose"], "VILA")
        self.assertEqual(plan["cardPlacementIds"], ["seat-1.card-1", "seat-1.card-2"])
        self.assertEqual(plan["durationSeconds"], 8.0)
        self.assertFalse(plan["ready"])
        self.assertFalse(plan["directReturnVerified"])
        self.assertIn("edge-unverified", [i["code"] for i in plan["issues"]])

    def test_pose_match_and_action_approval_do_not_prove_pairwise_gates(self):
        plan = plan_sequence(model(), ["bridge.to-redo", "deal.seat-1.first"])
        self.assertEqual(plan["finalPose"], "REDO")
        self.assertFalse(plan["ready"])
        self.assertIn("entry-unverified", [i["code"] for i in plan["issues"]])
        self.assertEqual(plan["steps"][1]["sourceBoundary"]["startFrame"], 30)

    def test_duplicate_card_and_pose_mismatch_are_detected(self):
        plan = plan_sequence(model(), ["deal.seat-1.first", "deal.seat-1.first"])
        codes = [i["code"] for i in plan["issues"]]
        self.assertIn("pose-mismatch", codes)
        self.assertIn("duplicate-placement", codes)
        self.assertEqual(plan["cardPlacementIds"], ["seat-1.card-1"])

    def test_missing_action_breaks_pose_and_total_duration(self):
        plan = plan_sequence(model(), ["does-not-exist", "bridge.to-vila"])
        self.assertIsNone(plan["durationSeconds"])
        self.assertEqual(plan["knownDurationSeconds"], 2.0)
        self.assertIn("unknown-action", [i["code"] for i in plan["issues"]])
        self.assertIn("unknown-entry-pose", [i["code"] for i in plan["issues"]])

    def test_direct_source_claim_stays_a_plan_and_input_is_unchanged(self):
        data = model()
        data["actions"][1].update({"to": "VILA", "returnMode": "direct"})
        original = copy.deepcopy(data)
        plan = plan_sequence(data, ["bridge.to-redo", "deal.seat-1.first"])
        self.assertEqual(plan["returnMode"], "direct-declared")
        self.assertFalse(plan["ready"])
        self.assertEqual(data, original)

    def test_unknown_timebase_is_not_guessed(self):
        data = model()
        data["actions"][0]["media"]["fps"] = None
        plan = plan_sequence(data, ["bridge.to-redo"])
        self.assertIsNone(plan["durationSeconds"])
        self.assertIn("unknown-duration", [i["code"] for i in plan["issues"]])


if __name__ == "__main__":
    unittest.main()
