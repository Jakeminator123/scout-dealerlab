"""Pure, read-only adapters for Dealerlab's versioned public source documents.

This module does not load files, contact APIs, approve media, or execute routes.
Source keys may be stems (``dealer-map``) or repository-relative JSON paths.
The output is a display projection; the source contracts remain authoritative.
"""
from __future__ import annotations

import copy
import re
from collections import Counter
from urllib.parse import parse_qsl, urljoin, urlsplit

SCHEMA_VERSION = 1
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
DEFAULT_REVIEW_URL = "https://scout-dealerlab.vercel.app/"
CATEGORY_DEFINITIONS = (
    ("idle", "Vila", "#42d6b3"),
    ("bridge", "Bryggor", "#7d9bff"),
    ("player", "Giv till spelare", "#bba3ff"),
    ("dealer", "Giv till dealer", "#ffb96b"),
    ("reveal", "Vändning", "#ed90c8"),
    ("speech", "Tal och reaktioner", "#72c7ee"),
    ("scene", "Scenbyte", "#9ab3c9"),
    ("roulette", "Roulette · referens", "#c5b689"),
    ("other", "Övrigt", "#93a3b9"),
)


def _dict(value):
    return value if isinstance(value, dict) else {}


def _rows(value):
    return [x for x in value if isinstance(x, dict)] if isinstance(value, list) else []


def _source(sources, name):
    for key in (name, name + ".json", "references/" + name + ".json"):
        if isinstance(sources.get(key), dict):
            return sources[key]
    if name == "review-manifest":
        for key in ("granskning/manifest.json", "manifest", "reviewManifest"):
            if isinstance(sources.get(key), dict):
                return sources[key]
    return {}


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _integer(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _relative_path(value):
    """Never publish a local Windows/POSIX path as an asset address."""
    if not isinstance(value, str) or not value or "\\" in value:
        return None
    if value.startswith("/") or ":" in value or any(x in ("", ".", "..") for x in value.split("/")):
        return None
    return value


def safe_public_url(value, base=DEFAULT_REVIEW_URL):
    """Accept web links without credentials or private/signed access parameters."""
    if not isinstance(value, str) or not value or value.startswith("//"):
        return None
    if value.startswith("/"):
        value = urljoin(base, value)
    try:
        parts = urlsplit(value)
        if parts.scheme not in ("https", "http") or not parts.hostname or parts.username or parts.password:
            return None
        sensitive = ("token", "secret", "credential", "signature", "password", "api_key", "apikey", "authorization")
        for key, _ in parse_qsl(parts.query, keep_blank_values=True):
            lower = key.lower()
            if lower in ("sig", "key", "auth", "code") or lower.startswith("x-amz-") or any(x in lower for x in sensitive):
                return None
        return value
    except ValueError:
        return None


def _category(slot_id, kind="", game=""):
    if game == "roulette" or slot_id.startswith("roulette."):
        return "roulette"
    if slot_id.startswith("deal.player."):
        return "player"
    if slot_id.startswith("deal.dealer/"):
        return "dealer"
    if slot_id.startswith("reveal.") or kind == "reveal":
        return "reveal"
    if slot_id.startswith("idle.") or kind == "idle":
        return "idle"
    if slot_id.startswith("transition.shoe/") or kind in ("shoe", "bridge"):
        return "bridge"
    if slot_id.startswith("transition.scene/") or kind == "scene":
        return "scene"
    if slot_id.startswith("speak.") or kind in ("speech", "speak"):
        return "speech"
    return "other"


def _player_slot(seat):
    if _integer(seat) is None or not 1 <= seat <= 7:
        return None
    side = "left" if seat <= 2 else "centre" if seat <= 5 else "right"
    return f"deal.player.{side}/box{seat - 1}"


def _catalog_slot(clip, known_slots):
    explicit = clip.get("clipSlotId")
    if isinstance(explicit, str):
        return explicit  # Unknown explicit IDs remain visible; they are not guessed.
    legacy = clip.get("slotId")
    if isinstance(legacy, str) and legacy in known_slots:
        return legacy
    if clip.get("kind") == "deal":
        proposed = _player_slot(clip.get("seat"))
    elif clip.get("kind") == "idle":
        proposed = "idle.ready/"
    elif clip.get("kind") == "bridge":
        proposed = {
            ("VILA", "REDO"): "transition.shoe/to-shoe",
            ("REDO", "VILA"): "transition.shoe/from-shoe",
        }.get((clip.get("from"), clip.get("to")))
    else:
        proposed = None
    return proposed if proposed in known_slots else None


def _manifest_index(manifest):
    index = {}
    rows = list(_rows(manifest.get("files")))
    bank = _dict(manifest.get("bank"))
    rows += _rows(bank.get("clips"))
    rows += [v for v in (bank.get("compact"), bank.get("full"), manifest.get("chain")) if isinstance(v, dict)]
    base = safe_public_url(manifest.get("publicUrl")) or DEFAULT_REVIEW_URL
    for row in rows:
        path = _relative_path(row.get("source") or row.get("path"))
        sha = row.get("sha256")
        url = safe_public_url(row.get("url"), base)
        if path and isinstance(sha, str) and HASH_RE.fullmatch(sha) and url:
            index[(path, sha)] = url
    return index


def _media(binding, assets, urls):
    binding = _dict(binding)
    asset = assets.get(binding.get("assetId"), {})
    path = _relative_path(asset.get("path"))
    sha = binding.get("sha256")
    start, end = _integer(binding.get("startFrame")), _integer(binding.get("endFrameExclusive"))
    fps, frames = _number(asset.get("fps")), _integer(asset.get("frames", asset.get("frameCount")))
    valid = bool(path and isinstance(sha, str) and HASH_RE.fullmatch(sha)
                 and asset.get("sha256") == sha and asset.get("kind") == "video"
                 and start is not None and end is not None and 0 <= start < end
                 and frames is not None and end <= frames and fps is not None and fps > 0)
    return {
        "assetId": binding.get("assetId"), "path": path, "sha256": sha,
        "startFrame": start, "endFrameExclusive": end, "fps": fps,
        "width": _number(asset.get("width")), "height": _number(asset.get("height")),
        "frames": frames, "url": urls.get((path, sha)) if valid else None,
        "bindingValid": valid, "urlBasis": "manifest-path-and-hash" if valid and (path, sha) in urls else None,
    }


def _review_media(manifest, seat, ordinal, urls):
    if _integer(seat) is None or _integer(ordinal) is None:
        return None
    legacy_id = f"C{ordinal}-P{seat}"
    for row in _rows(_dict(manifest.get("bank")).get("clips")):
        if row.get("id") != legacy_id:
            continue
        path = _relative_path(row.get("source") or row.get("path"))
        sha = row.get("sha256")
        url = urls.get((path, sha))
        if not url:
            return None
        return {"id": legacy_id, "path": path, "sha256": sha, "url": url,
                "role": "rendered-review", "fps": _number(row.get("fps")),
                "frames": _integer(row.get("frames")), "sourceFramesApply": False,
                "note": "Separat granskningsfilm. Råbindningens klippgränser gäller inte automatiskt här."}
    return None


def _valid_gates(contract, clips, assets):
    """A stale approved gate must not survive a changed hash/frame boundary."""
    boundaries = {}
    for anchor in _rows(contract.get("anchors")):
        asset = assets.get(anchor.get("assetId"), {})
        if isinstance(anchor.get("id"), str) and asset.get("sha256") == anchor.get("sha256"):
            boundaries[(anchor["id"], "end")] = (anchor.get("sha256"), 0, anchor.get("pose"))
    for clip in clips:
        media = _media(clip.get("binding", clip.get("selectedBinding")), assets, {})
        if media["bindingValid"] and isinstance(clip.get("id"), str):
            boundaries[(clip["id"], "start")] = (media["sha256"], media["startFrame"], clip.get("from"))
            boundaries[(clip["id"], "end")] = (media["sha256"], media["endFrameExclusive"] - 1, clip.get("to"))
    valid = []
    for gate in _rows(contract.get("edgeGates")):
        qa = _dict(gate.get("qa"))
        proof = _dict(qa.get("evidence"))
        before, after = _dict(gate.get("from")), _dict(gate.get("to"))
        b = boundaries.get((before.get("nodeId"), "end"))
        a = boundaries.get((after.get("nodeId"), "start"))
        if (qa.get("status") == "approved" and _relative_path(proof.get("path"))
                and HASH_RE.fullmatch(str(proof.get("sha256", ""))) and b and a
                and (before.get("sha256"), before.get("frame")) == b[:2]
                and (after.get("sha256"), after.get("frame")) == a[:2] and b[2] == a[2]):
            valid.append(gate)
    return valid


def _clean_provenance(provenance):
    allowed = ("commit", "snapshot", "fetchedAt", "fetched_at", "mode", "sourceType", "repository",
               "repo", "branch", "ref", "fullManifestSha256", "manifestSha256", "sourceTreeSha256",
               "reviewManifestSha256", "manifestVerified", "sourceCommit", "sourceDirty", "offline",
               "fixture", "publicSourceSha256", "sourceFiles", "reviewSnapshotMatches",
               "sourceMode", "sourceLabel", "sourceWorkingTreeSnapshot", "loadedAt", "issueUrl",
               "workingTreeDirty", "publishedSnapshot", "reviewSnapshot", "pendingReviewSnapshot")
    result = {key: copy.deepcopy(value) for key, value in _dict(provenance).items()
              if key in allowed and isinstance(value, (str, int, float, bool, type(None)))}
    if "issueUrl" in result:
        result["issueUrl"] = safe_public_url(result["issueUrl"])
    result["sourceHashes"] = {path: sha for path, sha in _dict(_dict(provenance).get("sourceHashes")).items()
                              if _relative_path(path) and isinstance(sha, str) and HASH_RE.fullmatch(sha)}
    return result


def normalize_sources(sources: dict[str, dict], provenance: dict | None = None) -> dict:
    """Project known source schemas to JSON-serializable read-only view data.

    Unknown fields do not turn into approval or implicit playback behavior. A
    future contract may expose ``actions`` and ``cardPlacements`` instead of
    ``clips`` and ``cardSlots``; explicit clipSlotId/cardPlacementId are preferred.
    No source object is modified. Missing media and calibration stay missing.
    """
    sources = _dict(sources)
    catalog = _source(sources, "dealer-map")
    contract = _source(sources, "pamela-motion-contract") or _source(sources, "motion-contract")
    registry = _source(sources, "dealers")
    schemes = _source(sources, "schemes")
    manifest = _source(sources, "review-manifest")
    warnings = []
    urls = _manifest_index(manifest)
    assets = {a["id"]: a for a in _rows(contract.get("assets")) if isinstance(a.get("id"), str)}
    gates = _rows(contract.get("edgeGates"))
    source_slots = _rows(catalog.get("nodes"))
    known_slots = {r["id"] for r in source_slots if isinstance(r.get("id"), str)}
    source_placements = _rows(contract.get("cardPlacements", contract.get("cardSlots")))
    placement_by_id = {r["id"]: r for r in source_placements if isinstance(r.get("id"), str)}
    source_clips = _rows(contract.get("actions", contract.get("clips")))
    valid_gates = _valid_gates(contract, source_clips, assets)
    actions = []
    for clip in source_clips:
        if not isinstance(clip.get("id"), str):
            warnings.append("En rörelse utan ID utelämnades.")
            continue
        binding = _dict(clip.get("binding", clip.get("selectedBinding")))
        media = _media(binding, assets, urls)
        slot = _catalog_slot(clip, known_slots)
        placement_id = clip.get("cardPlacementId")
        if placement_id is None and clip.get("slotId") in placement_by_id:
            placement_id = clip["slotId"]
        placement = placement_by_id.get(placement_id, {})
        seat = _integer(clip.get("seat", placement.get("seat")))
        ordinal = _integer(clip.get("ordinal", placement.get("ordinal")))
        target = _dict(clip.get("target"))
        seat = seat if seat is not None else _integer(target.get("seat"))
        ordinal = ordinal if ordinal is not None else _integer(target.get("ordinal"))
        recipient = clip.get("recipient") or target.get("recipient") or placement.get("recipient")
        code = f"P{seat}.K{ordinal}" if seat and ordinal else f"D.K{ordinal}" if recipient == "D" and ordinal else None
        qa = _dict(clip.get("qa"))
        qa_status = qa.get("status", "unknown")
        evidence = _dict(qa.get("evidence"))
        evidence_bound = bool(_relative_path(evidence.get("path")) and HASH_RE.fullmatch(str(evidence.get("sha256", ""))))
        approved = bool(media["bindingValid"] and qa_status == "approved" and evidence_bound
                        and binding.get("presentation") == "separable-layers"
                        and any(_dict(g.get("to")).get("nodeId") == clip["id"] for g in valid_gates))
        status = "approved" if approved else "rejected" if qa_status == "rejected" else "candidate" if media["bindingValid"] else "missing"
        return_mode = clip.get("returnMode") if clip.get("returnMode") in ("direct", "via-redo", "none") else "unknown"
        notes = [x for x in (clip.get("note"), qa.get("reason")) if isinstance(x, str) and x]
        if slot is not None and slot not in known_slots:
            notes.append("Explicit klippfack saknas i den inlästa katalogversionen.")
        if binding and not media["bindingValid"]:
            notes.append("Mediebindningens hash, tidsbas eller rutintervall är ogiltigt/ofullständigt.")
        if qa_status == "approved" and not approved:
            notes.append("Rapporterad klipp-QA räcker inte till spelbar status: kontrollera lager, bevis och ingångsskarv.")
        actions.append({
            "id": clip["id"], "label": clip.get("label") or clip["id"],
            "categoryId": _category(slot or "", clip.get("kind", "")),
            "clipSlotId": slot, "cardPlacementId": placement_id,
            "from": clip.get("from"), "to": clip.get("to"), "seat": seat,
            "ordinal": ordinal, "code": code, "status": status, "qaStatus": qa_status,
            "presentation": binding.get("presentation"), "returnMode": return_mode,
            "sourcePath": "references/pamela-motion-contract.json",
            "notes": notes, "media": media, "reviewMedia": _review_media(manifest, seat, ordinal, urls),
            "directReturnVerified": bool(approved and return_mode == "direct" and clip.get("to") == "VILA"),
        })
    slots = []
    for row in source_slots:
        if not isinstance(row.get("id"), str):
            continue
        poses = row.get("poses") if isinstance(row.get("poses"), list) else []
        variants = []
        for key, val in _dict(row.get("poseVariants")).items():
            if isinstance(val, list) and len(val) == 2:
                variants.append({"id": key, "from": val[0], "to": val[1]})
        linked = [a for a in actions if a["clipSlotId"] == row["id"]]
        state = "approved" if any(a["status"] == "approved" for a in linked) else "candidate" if any(a["media"]["bindingValid"] for a in linked) else "missing"
        slots.append({"id": row["id"], "label": row.get("label") or row["id"],
                      "categoryId": _category(row["id"], row.get("kind", ""), row.get("game", "")),
                      "game": row.get("game"), "kind": row.get("kind"),
                      "from": poses[0] if len(poses) == 2 else None,
                      "to": poses[1] if len(poses) == 2 else None, "variants": variants,
                      "actionIds": [a["id"] for a in linked], "status": state,
                      "sourcePath": "references/dealer-map.json", "notes": list(row.get("missing", [])) if isinstance(row.get("missing"), list) else []})
    placements = []
    targets = {r.get("playerSeat"): r for r in _rows(catalog.get("targets"))}
    for recipient, seat, ordinal in [(f"P{s}", s, n) for s in range(1, 8) for n in (1, 2)] + [("D", None, n) for n in (1, 2, 3)]:
        code = f"{recipient}.K{ordinal}"
        linked = [a for a in actions if a["code"] == code]
        old_id = f"seat-{seat}.card-{ordinal}" if seat else f"dealer.card-{ordinal}"
        source_place = placement_by_id.get(old_id, {})
        for a in linked:
            if a["cardPlacementId"] in placement_by_id:
                source_place = placement_by_id[a["cardPlacementId"]]
                break
        target = targets.get(seat, {})
        quad = source_place.get("landingQuad", target.get("landingQuad"))
        placements.append({"id": source_place.get("id") or old_id, "code": code,
                           "recipient": recipient, "seat": seat, "ordinal": ordinal,
                           "clipSlotId": _player_slot(seat) if seat else next((a["clipSlotId"] for a in linked if a["clipSlotId"]), None),
                           "actionIds": [a["id"] for a in linked],
                           "candidate": any(a["media"]["bindingValid"] for a in linked),
                           "landingQuad": copy.deepcopy(quad) if isinstance(quad, list) and len(quad) == 4 else None,
                           "coordinateSpace": source_place.get("coordinateSpace") or target.get("coordinateSpace"),
                           "measurementStatus": source_place.get("measurementStatus") or target.get("measurementStatus") or "unknown",
                           "scopeBasis": "user-request-17-targets"})
    counts = Counter(s["categoryId"] for s in slots)
    categories = [{"id": key, "label": label, "color": color, "count": counts[key]} for key, label, color in CATEGORY_DEFINITIONS if counts[key]]
    identities = [{k: copy.deepcopy(d[k]) for k in ("id", "label", "scoutDealerId", "pipeline", "sourceProjectId") if k in d}
                  for d in _rows(registry.get("dealers"))]
    dealer_id = contract.get("dealerId")
    registry_identity = next((d for d in identities if d.get("id") == dealer_id), {})
    identity = {"projectId": contract.get("projectId") or "Jakeminator123/scout-dealerlab",
                "dealerId": dealer_id, "bankId": contract.get("bankId") or catalog.get("bankId"),
                "revision": contract.get("revision"),
                "label": "Pamela · Dealerlab" if dealer_id == "pamela-pilot" else registry_identity.get("label") or dealer_id or "Dealer · identitet saknas",
                "sourceIdentityLabel": registry_identity.get("label")}
    candidates = sum(p["candidate"] for p in placements)
    reference_schemes = [{k: copy.deepcopy(s[k]) for k in ("id", "label", "sourceRef", "sourcePath", "summary", "states", "transitions", "coordinateSpace") if k in s}
                         for s in _rows(schemes.get("schemes"))]
    provenance_out = _clean_provenance(provenance)
    provenance_out.setdefault("snapshot", manifest.get("snapshot"))
    provenance_out.update({"catalogRevision": catalog.get("mainRevision"), "contractRevision": contract.get("revision"),
                           "mainConnected": catalog.get("mainConnected") is True, "atlasConnected": catalog.get("importedIntoAtlas") is True})
    if not contract:
        warnings.append("Rörelsekontrakt saknas. Katalogfack beskriver funktioner, inte tillgängliga filmer.")
    if not catalog:
        warnings.append("Klippfackskatalog saknas. Rörelsernas fackkopplingar kan vara ofullständiga.")
    if reference_schemes:
        warnings.append(f"{len(reference_schemes)} referensscheman är jämförelseunderlag; de är inte antal klippfack.")
    if any(a["status"] != "approved" for a in actions):
        warnings.append("Kandidatfilmer och namngivna poser är inte godkänd uppspelning. QA, lager och exakta skarvar krävs.")
    warnings.append("17 givmål är den beställda målserien. Kandidattäckning är inte total färdiggrad eller kvalitetsacceptans.")
    warnings.append("P1.K2 betyder spelarplats 1, kort 2. En symbolisk kortplats är inte en uppmätt koordinat.")
    warnings.append("v/iv anger ändposer; direktretur utan REDO måste styrkas med rörelsebevis.")
    if not urls:
        warnings.append("Inget kontrollerat webbmanifest med medielänkar finns i inläst underlag.")
    routes = []
    for n in (1, 2):
        code = f"P1.K{n}"
        bound = [a["id"] for a in actions if a["code"] == code and a["directReturnVerified"]]
        routes.append({"id": f"p1-k{n}-direct-rest", "label": f"P1 efter kort {n} → direkt VILA",
                       "status": "verified-in-source" if bound else "unverified", "code": code,
                       "from": "RELEASE", "to": "VILA", "preservedCards": n,
                       "requiresDirectReturn": True, "actionIds": bound,
                       "scopeBasis": "user-request-and-issue-1"})
    return {
        "schemaVersion": SCHEMA_VERSION, "title": "Dealerlab · Rörelsekarta",
        "provenance": provenance_out, "identity": identity, "identities": identities,
        "categories": categories, "slots": slots, "actions": actions, "placements": placements,
        "stats": {"slotCount": len(slots), "blackjackSlots": sum(s["game"] == "blackjack" for s in slots),
                  "rouletteSlots": sum(s["game"] == "roulette" for s in slots), "actionCount": len(actions),
                  "approvedActions": sum(a["status"] == "approved" for a in actions), "assets": len(assets),
                  "candidateTargets": candidates, "requiredTargets": len(placements),
                  "candidatePercent": round(candidates / len(placements) * 100, 1),
                  "referenceSchemes": len(reference_schemes), "edgeGates": len(gates),
                  "approvedEdgeGates": len(valid_gates)},
        "warnings": warnings, "routeRequirements": routes,
        "coordinateSpaces": copy.deepcopy(_rows(catalog.get("coordinateSpaces"))),
        "schemes": reference_schemes, "policy": copy.deepcopy(_dict(contract.get("presentationPolicy"))),
        "notation": {"P": "Spelarplats", "D": "Dealer", "K": "Kortordinal i handen", "V": "VILA", "R": "REDO", "S": "Sko", "example": "P2.K2"},
        "interpretation": "Läsvy av versionsbundna kontrakt. Grafens placeringar är schematiska; den kör inga spelhändelser.",
    }
