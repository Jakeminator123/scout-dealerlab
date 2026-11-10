"""Tests for factual boundaries in the read-only projection, without GUI deps."""
import copy
import unittest
from urllib.parse import urlunsplit

from dealer_map_data import normalize_sources, safe_public_url


SHA = "a" * 64
PROOF = "b" * 64
RENDER = "c" * 64


def sources():
    return {
        "dealer-map": {"nodes": [
            {"id": "deal.player.left/box0", "label": "Ge kort till plats 1", "game": "blackjack", "kind": "deal",
             "poseVariants": {"base": ["REDO", "REDO"], "v": ["REDO", "VILA"]}},
            {"id": "deal.dealer/dealer-hole", "label": "Dolt dealerkort", "game": "blackjack", "kind": "deal",
             "poseVariants": {"base": ["REDO", "VILA"], "i": ["VILA", "VILA"]}},
            {"id": "idle.ready/", "label": "Vila", "game": "blackjack", "kind": "idle", "poses": ["VILA", "VILA"]},
        ], "targets": [{"playerSeat": 1, "landingQuad": None, "measurementStatus": "unknown"}]},
        "pamela-motion-contract": {"dealerId": "pamela-pilot", "bankId": "bank-v1", "revision": "r1",
            "assets": [{"id": "raw", "kind": "video", "path": "runs/test/raw.mp4", "sha256": SHA,
                        "fps": 30, "width": 1762, "height": 1174, "frames": 360},
                       {"id": "anchor", "kind": "image", "path": "runs/test/redo.png", "sha256": PROOF}],
            "anchors": [{"id": "anchor.REDO", "pose": "REDO", "assetId": "anchor", "sha256": PROOF}],
            "clips": [{"id": "deal.seat-1.first", "kind": "deal", "label": "Första giv", "from": "REDO", "to": "REDO",
                       "seat": 1, "ordinal": 1, "slotId": "seat-1.card-1",
                       "binding": {"assetId": "raw", "sha256": SHA, "startFrame": 3, "endFrameExclusive": 360,
                                   "presentation": "raw-reference"},
                       "qa": {"status": "pending", "evidence": None}}],
            "cardSlots": [{"id": "seat-1.card-1", "seat": 1, "ordinal": 1}], "edgeGates": []},
        "schemes": {"schemes": [{"id": f"reference-{i}", "label": f"Referens {i}"} for i in range(5)]},
        "review-manifest": {"snapshot": "snapshot-a", "files": [
            {"source": "runs/test/raw.mp4", "sha256": SHA, "url": "/files/raw.mp4"}],
            "bank": {"clips": [{"id": "C1-P1", "source": "runs/render/C1-P1.mp4", "sha256": RENDER,
                                "url": "https://example.org/review.mp4"}]}}
    }


class DisplayProjectionTests(unittest.TestCase):
    def test_legacy_slot_collision_and_scope_are_not_conflated(self):
        result = normalize_sources(sources())
        action = result["actions"][0]
        self.assertEqual(action["clipSlotId"], "deal.player.left/box0")
        self.assertEqual(action["cardPlacementId"], "seat-1.card-1")
        self.assertEqual(action["code"], "P1.K1")
        self.assertEqual(result["stats"]["referenceSchemes"], 5)
        self.assertEqual(result["stats"]["slotCount"], 3)
        self.assertEqual(result["stats"]["requiredTargets"], 17)
        self.assertEqual(result["stats"]["candidateTargets"], 1)
        self.assertIsNone(result["placements"][0]["landingQuad"])

    def test_hole_card_exception_is_preserved(self):
        row = normalize_sources(sources())["slots"][1]
        self.assertEqual(row["variants"][0], {"id": "base", "from": "REDO", "to": "VILA"})

    def test_source_frames_and_review_film_remain_distinct(self):
        action = normalize_sources(sources())["actions"][0]
        self.assertEqual(action["media"]["startFrame"], 3)
        self.assertEqual(action["media"]["fps"], 30)
        self.assertEqual(action["media"]["url"], "https://scout-dealerlab.vercel.app/files/raw.mp4")
        self.assertEqual(action["reviewMedia"]["sha256"], RENDER)
        self.assertFalse(action["reviewMedia"]["sourceFramesApply"])
        self.assertIsNone(action["reviewMedia"]["fps"])

    def test_stale_binding_or_wrong_manifest_hash_disables_link(self):
        data = sources()
        data["review-manifest"]["files"][0]["sha256"] = PROOF
        action = normalize_sources(data)["actions"][0]
        self.assertIsNone(action["media"]["url"])
        self.assertEqual(action["status"], "candidate")
        data["pamela-motion-contract"]["clips"][0]["binding"]["sha256"] = PROOF
        action = normalize_sources(data)["actions"][0]
        self.assertEqual(action["status"], "missing")
        self.assertFalse(action["media"]["bindingValid"])

    def test_invalid_source_timebase_or_range_never_counts_as_candidate(self):
        for field, value in (("fps", 0), ("frames", 100)):
            with self.subTest(field=field):
                data = sources()
                data["pamela-motion-contract"]["assets"][0][field] = value
                self.assertEqual(normalize_sources(data)["stats"]["candidateTargets"], 0)

    def test_approval_needs_exact_gate_and_direct_is_not_inferred(self):
        data = sources()
        clip = data["pamela-motion-contract"]["clips"][0]
        clip["to"] = "VILA"
        clip["qa"] = {"status": "approved", "evidence": {"path": "runs/test/qa.json", "sha256": PROOF}}
        clip["binding"]["presentation"] = "separable-layers"
        self.assertEqual(normalize_sources(data)["actions"][0]["status"], "candidate")
        data["pamela-motion-contract"]["edgeGates"] = [{
            "from": {"nodeId": "anchor.REDO", "sha256": PROOF, "frame": 0},
            "to": {"nodeId": clip["id"], "sha256": SHA, "frame": 3},
            "qa": {"status": "approved", "evidence": {"path": "runs/test/gate.json", "sha256": PROOF}}}]
        result = normalize_sources(data)
        self.assertEqual(result["actions"][0]["status"], "approved")
        self.assertFalse(result["actions"][0]["directReturnVerified"])
        clip["returnMode"] = "direct"
        self.assertTrue(normalize_sources(data)["actions"][0]["directReturnVerified"])
        clip["binding"]["startFrame"] = 4
        action = normalize_sources(data)["actions"][0]
        self.assertEqual(action["status"], "candidate")
        self.assertFalse(action["directReturnVerified"])

    def test_explicit_new_fields_and_input_immutability(self):
        data = sources()
        contract = data["pamela-motion-contract"]
        contract["actions"] = contract.pop("clips")
        contract["cardPlacements"] = contract.pop("cardSlots")
        action = contract["actions"][0]
        action["clipSlotId"] = "deal.player.left/box0"
        action["cardPlacementId"] = action.pop("slotId")
        original = copy.deepcopy(data)
        result = normalize_sources({"references/" + k + ".json": v for k, v in data.items()})
        self.assertEqual(data, original)
        self.assertEqual(result["actions"][0]["cardPlacementId"], "seat-1.card-1")

    def test_missing_sources_remain_explicitly_missing(self):
        result = normalize_sources({})
        self.assertEqual(result["actions"], [])
        self.assertEqual(result["stats"]["candidateTargets"], 0)
        self.assertIsNone(result["identity"]["dealerId"])
        self.assertTrue(result["warnings"])

    def test_private_paths_and_access_urls_do_not_leak(self):
        data = sources()
        data["pamela-motion-contract"]["assets"][0]["path"] = "C:/Users/private/raw.mp4"
        result = normalize_sources(data, {"commit": "abc", "repoRoot": "C:/Users/private"})
        self.assertNotIn("repoRoot", result["provenance"])
        self.assertIsNone(result["actions"][0]["media"]["path"])
        # Deliberately invalid synthetic user-info; no usable credential URL is
        # embedded in the published source tree.
        userinfo_fixture = urlunsplit(("https", "user:pass@example.org", "/a.mp4", "", ""))
        for url in ("file:///tmp/secret", "javascript:alert(1)", userinfo_fixture,
                    "https://example.org/a.mp4?token=private", "https://example.org/a.mp4?X-Amz-Signature=secret"):
            self.assertIsNone(safe_public_url(url))


if __name__ == "__main__":
    unittest.main()
