"""Read-only sequence plans. A pose match never approves a media transition."""
from __future__ import annotations


def _dict(value):
    return value if isinstance(value, dict) else {}


def _duration(media):
    start, end, fps = media.get("startFrame"), media.get("endFrameExclusive"), media.get("fps")
    if (isinstance(start, int) and not isinstance(start, bool) and isinstance(end, int)
            and not isinstance(end, bool) and isinstance(fps, (int, float))
            and not isinstance(fps, bool) and 0 <= start < end and fps > 0):
        return (end - start) / fps
    return None


def plan_sequence(model, action_ids: list[str], start_pose="VILA") -> dict:
    """Describe a proposed route without playback, generation, or state mutation.

    The normalized display model does not carry a complete pairwise edge proof.
    Therefore ready/directReturnVerified remain false, even if individual actions
    have approved QA. cardPlacementIds is a simulated list, not live game state.
    """
    model = _dict(model)
    actions = {a["id"]: a for a in model.get("actions", [])
               if isinstance(a, dict) and isinstance(a.get("id"), str)}
    placements = {p["id"]: p for p in model.get("placements", [])
                  if isinstance(p, dict) and isinstance(p.get("id"), str)}
    by_code = {p.get("code"): p["id"] for p in placements.values() if p.get("code")}
    steps, issues, cards = [], [], []
    pose, known_seconds, unknown_duration = start_pose, 0.0, False
    last_deal_index = None

    def issue(code, message, step=None, severity="warning"):
        item = {"code": code, "severity": severity, "message": message, "step": step}
        issues.append(item)
        return item

    if not isinstance(action_ids, list) or not all(isinstance(x, str) for x in action_ids):
        issue("invalid-input", "Välj en lista av rörelse-ID:n.", severity="error")
        action_ids = []
    if not action_ids:
        issue("empty-plan", "Ingen rörelse är vald.")
    for index, action_id in enumerate(action_ids, 1):
        action = actions.get(action_id)
        row = {"index": index, "actionId": action_id, "label": action_id,
               "from": None, "to": None, "status": "missing", "durationSeconds": None,
               "clipSlotId": None, "cardPlacementId": None, "sourceBoundary": None, "issues": []}
        steps.append(row)
        if action is None:
            row["issues"].append(issue("unknown-action", f"Rörelsen {action_id} finns inte i vald revision.", index, "error"))
            unknown_duration, pose = True, None
            continue
        media = _dict(action.get("media"))
        duration = _duration(media)
        row.update({k: action.get(k) for k in ("label", "from", "to", "status", "clipSlotId", "cardPlacementId")})
        row["durationSeconds"] = duration
        row["sourceBoundary"] = {k: media.get(k) for k in ("sha256", "startFrame", "endFrameExclusive")}
        if duration is None:
            unknown_duration = True
            row["issues"].append(issue("unknown-duration", "Källans rutintervall eller tidsbas saknas.", index))
        else:
            known_seconds += duration
        if pose is None or action.get("from") is None:
            row["issues"].append(issue("unknown-entry-pose", "Startpose kan inte härledas för detta steg.", index))
        elif action.get("from") != pose:
            row["issues"].append(issue("pose-mismatch", f"Planen är i {pose}, men klippet börjar i {action.get('from')}.", index, "error"))
        if action.get("status") != "approved":
            row["issues"].append(issue("action-not-approved", "Klippet är inte spelgodkänt i källkontraktet.", index))
        if not media.get("bindingValid"):
            row["issues"].append(issue("invalid-binding", "Giltig hash- och rutbunden mediekälla saknas.", index, "error"))
        row["issues"].append(issue("entry-unverified" if index == 1 else "edge-unverified",
                                  "Exakt anslutning från föregående gränsruta saknar verifiering i denna läsvy.", index))
        placement_id = action.get("cardPlacementId") or by_code.get(action.get("code"))
        is_deal = bool(placement_id or action.get("categoryId") in ("player", "dealer"))
        if is_deal:
            last_deal_index = index - 1
            if not placement_id:
                row["issues"].append(issue("unbound-card", "Given saknar en identifierad kortplacering.", index, "error"))
            elif placement_id in cards:
                row["issues"].append(issue("duplicate-placement", f"Kortplaceringen {placement_id} används redan; välj rätt nästa kort/hand.", index, "error"))
            else:
                cards.append(placement_id)
                if placement_id not in placements:
                    row["issues"].append(issue("outside-initial-scope", "Kortplaceringen ligger utanför den inlästa målserien.", index))
        pose = action.get("to")
    return_mode = "none"
    if last_deal_index is not None:
        last = actions.get(steps[last_deal_index]["actionId"], {})
        following = [actions.get(r["actionId"], {}) for r in steps[last_deal_index + 1:]]
        via_redo = last.get("returnMode") == "via-redo" or (last.get("to") == "REDO" and any(a.get("from") == "REDO" and a.get("to") == "VILA" for a in following))
        if via_redo:
            return_mode = "via-redo"
            issue("return-via-redo", "Denna retur passerar REDO efter sista given och uppfyller inte kravet på direktretur.")
        elif last.get("returnMode") == "direct" and last.get("to") == "VILA":
            return_mode = "direct-declared"
        elif pose == "VILA":
            return_mode = "unknown"
            issue("direct-return-unknown", "VILA-slutpose visar inte vilken väg handen tog.")
    return {"steps": steps, "issues": issues, "startPose": start_pose, "finalPose": pose,
            "cardPlacementIds": cards, "durationSeconds": None if unknown_duration else round(known_seconds, 6),
            "knownDurationSeconds": round(known_seconds, 6), "ready": False,
            "returnMode": return_mode, "directReturnVerified": False,
            "sequenceQa": "unverified", "proposed": False,
            "durationBasis": "Summerade källintervall; eventuella skarvöverlapp är inte avräknade.",
            "scopeBasis": "Simulerad plan över inlästa givmål; inget spel- eller bordstillstånd ändras."}


def suggest_p1_sequence(model, cards=1):
    """Offer existing legacy IDs as a clearly labelled via-REDO skeleton."""
    if cards not in (1, 2):
        raise ValueError("P1-provet stöder ett eller två kort.")
    ids = ["bridge.to-redo", "deal.seat-1.first"]
    if cards == 2:
        ids.append("deal.seat-1.second")
    ids.append("bridge.to-vila")
    plan = plan_sequence(model, ids)
    plan.update({"proposed": True, "label": f"P1 · {cards} kort · befintlig väg via REDO",
                 "note": "Kandidatplan för jämförelse. Ersätter inte de två beställda direkta returproven."})
    return plan
