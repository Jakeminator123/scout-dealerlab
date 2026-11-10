"""Integrity boundaries: source changes never become a silently mixed map."""
from __future__ import annotations

from contextlib import ExitStack
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.request

import dealer_map_io as module


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class LoaderIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.commit = "a" * 40
        self.payloads = {
            "references/dealer-map.json": encoded({"nodes": [], "graph": {"nodes": [], "edges": []}}),
            "references/pamela-motion-contract.json": encoded({"dealerId": "pamela-pilot", "bankId": "test", "clips": [], "assets": []}),
        }
        rows = [{"path": path, "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)} for path, payload in self.payloads.items()]
        self.inventory = {
            "schemaVersion": 1, "repository": module.REPOSITORY,
            "files": rows, "sourceTreeSha256": hashlib.sha256(encoded(rows)).hexdigest(),
            "reviewSnapshot": "snapshot-one", "sourceIsWorkingTreeSnapshot": True,
        }
        self.urls = []

    def fetch(self, url, max_bytes=module.MAX_JSON_BYTES):
        self.urls.append(url)
        prefix = f"https://raw.githubusercontent.com/{module.REPOSITORY}/{self.commit}/"
        self.assertTrue(url.startswith(prefix), "All files must use the single resolved commit")
        relative = url[len(prefix):]
        return encoded(self.inventory) if relative == "public-source.json" else self.payloads[relative]

    def network_patches(self):
        stack = ExitStack()
        stack.enter_context(patch.object(module, "get_bytes", side_effect=self.fetch))
        stack.enter_context(patch.object(module, "github_head", return_value=self.commit))
        stack.enter_context(patch.object(module, "cache_directory", return_value=self.root / "cache"))
        return stack

    def test_every_source_is_pinned_and_complete_result_is_cached(self):
        with self.network_patches():
            result = module.fetch_github(include_review=False)
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(result["provenance"]["commit"], self.commit)
        self.assertEqual(result["provenance"]["sourceMode"], "github")
        self.assertEqual(set(result["provenance"]["sourceHashes"]), set(self.payloads))
        self.assertEqual(json.loads((self.root / "cache/latest-map.json").read_text()), result)
        self.assertEqual(len(self.urls), 3)

    def test_bad_source_hash_does_not_replace_previous_cache(self):
        cache = self.root / "cache/latest-map.json"
        cache.parent.mkdir()
        cache.write_text('{"previous":true}')
        self.payloads["references/pamela-motion-contract.json"] = b'{"changed":true}'
        with self.network_patches(), self.assertRaisesRegex(ValueError, "Källkontrollen"):
            module.fetch_github(include_review=False)
        self.assertEqual(cache.read_text(), '{"previous":true}')

    def test_inventory_aggregate_and_duplicate_paths_are_rejected(self):
        self.inventory["sourceTreeSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "sammanlagda hash"):
            module._verify_inventory(self.inventory, module.REPOSITORY)
        self.inventory["files"].append(self.inventory["files"][0])
        with self.assertRaisesRegex(ValueError, "dubbel filpost"):
            module._verify_inventory(self.inventory, module.REPOSITORY)

    def test_changing_web_snapshot_is_rejected(self):
        manifest = {"snapshot": "one", "files": []}
        payload = encoded(manifest)
        latest = {"snapshot": "one", "contentId": hashlib.sha256(payload).hexdigest()}
        changed = {**latest, "snapshot": "two"}
        with patch.object(module, "get_json", side_effect=[latest, changed]), patch.object(module, "get_bytes", return_value=payload), self.assertRaisesRegex(ValueError, "ändrades under läsning"):
            module.load_review_manifest("one")

    def test_valid_manifest_hash_with_wrong_snapshot_is_rejected(self):
        payload = encoded({"snapshot": "different", "files": []})
        latest = {"snapshot": "one", "contentId": hashlib.sha256(payload).hexdigest()}
        with patch.object(module, "get_json", return_value=latest), patch.object(module, "get_bytes", return_value=payload), self.assertRaisesRegex(ValueError, "olika snapshots"):
            module.load_review_manifest("one")

    def test_pending_receipt_requires_new_review_and_matching_sources(self):
        self.inventory["pendingReviewSnapshot"] = "snapshot-two"
        review = {"snapshot": "snapshot-two", "files": [{"source": row["path"], "sha256": row["sha256"]} for row in self.inventory["files"]]}
        latest = {"snapshot": "snapshot-two", "contentId": "b" * 64}
        with self.network_patches(), patch.object(module, "load_review_manifest", return_value=(review, latest)) as reader:
            result = module.fetch_github()
        reader.assert_called_once_with("snapshot-two")
        self.assertEqual(result["provenance"]["snapshot"], "snapshot-two")
        self.assertTrue(result["provenance"]["manifestVerified"])
        review["files"][0]["sha256"] = "0" * 64
        with self.network_patches(), patch.object(module, "load_review_manifest", return_value=(review, latest)):
            mismatched = module.fetch_github()
        self.assertFalse(mismatched["provenance"]["manifestVerified"])
        self.assertTrue(any("annan kontrakts" in warning for warning in mismatched["warnings"]))

    def test_local_source_change_during_read_is_rejected(self):
        for relative, payload in self.payloads.items():
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
        with patch.object(module, "local_fingerprint", side_effect=["before", "after"]), patch.object(module.subprocess, "run", side_effect=OSError()), self.assertRaisesRegex(ValueError, "lokala källan ändrades"):
            module.load_local(self.root)

    def test_local_contract_symlink_cannot_leave_chosen_project(self):
        outside = self.root / "outside.json"
        outside.write_text('{}')
        chosen = self.root / "chosen"
        (chosen / "references").mkdir(parents=True)
        try:
            (chosen / "references/dealer-map.json").symlink_to(outside)
        except OSError:
            self.skipTest("Symlink creation not permitted on this platform")
        with self.assertRaisesRegex(ValueError, "lämnar den valda"):
            module.load_local(chosen)


class MediaAndExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_disallowed_or_authenticated_preview_is_never_requested(self):
        for url in (
            "https://evil.example/clip.mp4", "http://scout-dealerlab.vercel.app/clip.mp4",
            "https://scout-dealerlab.vercel.app/clip.mp4?token=private",
            "https://store.public.blob.vercel-storage.com/clip.mp4?X-Amz-Signature=private",
        ):
            with self.subTest(url=url), patch.object(module, "cache_directory", return_value=self.root), patch.object(module, "_open_public") as opened, self.assertRaises(ValueError):
                module.verified_media({"sha256": "a" * 64, "url": url})
            opened.assert_not_called()

    def test_redirect_cannot_escape_media_host_or_introduce_credentials(self):
        req = urllib.request.Request("https://scout-dealerlab.vercel.app/clip.mp4")
        handler = module._CheckedRedirect(module._allowed_media_url)
        for target in ("https://evil.example/a", "http://127.0.0.1/a", "https://store.public.blob.vercel-storage.com/a?token=x"):
            with self.subTest(target=target), self.assertRaises(ValueError):
                handler.redirect_request(req, None, 302, "Found", {}, target)

    def test_local_media_traversal_cannot_open_an_external_file(self):
        with patch.object(module, "_open_public") as opened, self.assertRaisesRegex(ValueError, "relativ"):
            module.verified_media({"sha256": "a" * 64, "path": "../outside.mp4"}, self.root)
        opened.assert_not_called()

    def test_download_hash_failure_removes_temporary_output(self):
        expected = hashlib.sha256(b"expected-film").hexdigest()
        with patch.object(module, "cache_directory", return_value=self.root), patch.object(module, "_open_public", return_value=io.BytesIO(b"corrupt-film")), self.assertRaisesRegex(ValueError, "fel hash"):
            module.verified_media({"sha256": expected, "url": "https://scout-dealerlab.vercel.app/clip.mp4"})
        self.assertEqual(list((self.root / "media").iterdir()), [])

    def test_public_export_keeps_https_and_removes_private_values(self):
        public = "https://scout-dealerlab.vercel.app/files/runs/P1.mp4"
        original = {"url": public, "source": "references/pamela-motion-contract.json", "note": "Rot: C:/Users/Jakob/private/file.mp4", "unix": "/workspace/private/input", "signed": public + "?access_token=abc", "APIKEY": "private", "nested": {"localRoot": "private", "safe": "P1.K2"}, "credential": "ghp_" + "A" * 40}
        cleaned = module.public_model(original)
        serialized = json.dumps(cleaned)
        self.assertEqual(cleaned["url"], public)
        self.assertEqual(cleaned["source"], original["source"])
        self.assertNotIn("C:/Users", serialized)
        self.assertNotIn("/workspace/private", serialized)
        self.assertNotIn("access_token", serialized)
        self.assertNotIn("APIKEY", cleaned)
        self.assertNotIn("localRoot", cleaned["nested"])
        self.assertNotIn("ghp_", serialized)
        self.assertEqual(original["note"], "Rot: C:/Users/Jakob/private/file.mp4")

    def test_saved_model_supports_only_actual_schema(self):
        path = self.root / "model.json"
        for version in (True, "dealer-map-v99", 2, "1"):
            path.write_text(json.dumps({"schemaVersion": version, "actions": [], "slots": []}))
            with self.subTest(version=version), self.assertRaises(ValueError):
                module.load_saved(path)
        path.write_text(json.dumps({"schemaVersion": 1, "actions": [], "slots": []}))
        self.assertEqual(module.load_saved(path)["schemaVersion"], 1)


if __name__ == "__main__":
    unittest.main()
