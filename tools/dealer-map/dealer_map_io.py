"""Read-only source loading, integrity checks and optional explicit Issue posting.

No providers for generation, deployment or game state are called by this module.
The normalized map is a derived view, never a new authoritative motion contract.
"""
from __future__ import annotations

import concurrent.futures
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from dealer_map_data import normalize_sources

REPOSITORY = "Jakeminator123/scout-dealerlab"
REVIEW_ORIGIN = "https://scout-dealerlab.vercel.app"
ISSUE_NUMBER = 1
ISSUE_URL = f"https://github.com/{REPOSITORY}/issues/{ISSUE_NUMBER}"
SOURCE_PATHS = (
    "references/dealer-map.json",
    "references/pamela-motion-contract.json",
    "references/dealers.json",
    "references/schemes.json",
    "references/terminology.json",
    "references/pamela-two-sided-bank.json",
    "references/pamela-idle-chain-review.json",
    "references/public-review.json",
)
MAX_JSON_BYTES = 16 * 1024 * 1024
MAX_MEDIA_BYTES = 160 * 1024 * 1024
USER_AGENT = "Scout-Dealer-Map/1.0 (public-contract-viewer)"
HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")
LOCAL_PATH_PATTERN = re.compile(r"(?i)(?:^|[\s\"'=(])(?:[a-z]:[\\/]|\\\\[^\\]+\\|/(?:Users|home|workspace|tmp|mnt|private)/)[^\s\"<>]*")
SECRET_PATTERN = re.compile(r"\b(?:sk-(?:proj-|live-)?[A-Za-z0-9_-]{28,}|gh[pousr]_[A-Za-z0-9]{25,})|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def cache_directory() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData/Local")))
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache")))
    result = base / "ScoutGaming" / "DealerMap"
    result.mkdir(parents=True, exist_ok=True)
    return result


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json(path: Path) -> dict:
    if path.stat().st_size > MAX_JSON_BYTES:
        raise ValueError(f"JSON-filen är större än {MAX_JSON_BYTES // 1024 // 1024} MB.")
    result = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(result, dict):
        raise ValueError(f"Förväntade ett JSON-objekt: {path.name}")
    return result


def _json_object(payload: bytes, label: str) -> dict:
    try:
        result = json.loads(payload.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as error:
        raise ValueError(f"Ogiltigt JSON-underlag: {label}.") from error
    if not isinstance(result, dict):
        raise ValueError(f"Förväntade ett JSON-objekt: {label}.")
    return result


def _relative_path(value: object) -> bool:
    return isinstance(value, str) and bool(value) and not value.startswith("/") and ":" not in value and "\\" not in value and all(part not in ("", ".", "..") for part in value.split("/"))


def _local_bytes(root: Path, relative: str) -> bytes | None:
    if not _relative_path(relative):
        raise ValueError("En kontraktssökväg är ogiltig.")
    source = root / relative
    if not source.resolve().is_relative_to(root):
        raise ValueError("En kontraktssökväg lämnar den valda projektmappen.")
    if not source.is_file():
        return None
    if source.stat().st_size > MAX_JSON_BYTES:
        raise ValueError(f"Underlaget är för stort: {relative}")
    payload = source.read_bytes()
    if len(payload) > MAX_JSON_BYTES:
        raise ValueError(f"Underlaget är för stort: {relative}")
    return payload


def _allowed_metadata_url(value: str) -> bool:
    if not safe_public_url(value):
        return False
    host = urllib.parse.urlsplit(value).hostname or ""
    return host in ("api.github.com", "raw.githubusercontent.com", "scout-dealerlab.vercel.app") or host.endswith(".public.blob.vercel-storage.com")


def _allowed_media_url(value: str) -> bool:
    if not safe_public_url(value):
        return False
    host = urllib.parse.urlsplit(value).hostname or ""
    return host == "scout-dealerlab.vercel.app" or host.endswith(".public.blob.vercel-storage.com")


class _CheckedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed):
        self.allowed = allowed

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not self.allowed(newurl):
            raise ValueError("Omdirigeringen lämnar de tillåtna publika källorna.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open_public(request, timeout: int, allowed):
    if not allowed(request.full_url):
        raise ValueError("Adressen ligger utanför tillåtna publika källor.")
    return urllib.request.build_opener(_CheckedRedirect(allowed)).open(request, timeout=timeout)


def get_bytes(url: str, max_bytes: int = MAX_JSON_BYTES) -> bytes:
    if not _allowed_metadata_url(url):
        raise ValueError("Nätverksunderlag måste använda en tillåten publik HTTPS-källa.")
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.github+json" if "api.github.com/" in url else "application/json",
        "Cache-Control": "no-cache",
    })
    try:
        with _open_public(request, timeout=25, allowed=_allowed_metadata_url) as response:
            size = response.headers.get("Content-Length")
            if size and int(size) > max_bytes:
                raise ValueError("Underlaget är för stort.")
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError("Underlaget överskrider storleksgränsen.")
            return data
    except urllib.error.HTTPError as error:
        if error.code in (403, 429):
            raise RuntimeError("GitHub har begränsat anropen. Behåll aktuell karta och försök senare.") from error
        raise RuntimeError(f"Underlaget kunde inte hämtas (HTTP {error.code}).") from error
    except urllib.error.URLError as error:
        raise RuntimeError("Nätverket kunde inte nå underlaget. Den sparade kartan finns kvar.") from error


def get_json(url: str) -> dict:
    return _json_object(get_bytes(url), "nätverkskälla")


def valid_repository(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", value):
        raise ValueError("Repo ska anges som ägare/namn.")
    return value


def github_head(repository: str = REPOSITORY, ref: str = "main") -> str:
    repository = valid_repository(repository)
    result = get_json(f"https://api.github.com/repos/{repository}/commits/{urllib.parse.quote(ref, safe='')}")
    sha = result.get("sha", "")
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("GitHub returnerade ingen giltig commit.")
    return sha


def compact_review_manifest(manifest: dict, source_paths: set[str]) -> dict:
    """Keep only hash-bound media rows needed by this view; never all video data."""
    result = {key: copy.deepcopy(manifest[key]) for key in (
        "schemaVersion", "snapshot", "id", "contentId", "sourceRevision", "publicUrl", "bank", "chain"
    ) if key in manifest}
    files = manifest.get("files", [])
    if isinstance(files, dict):
        result["files"] = {key: value for key, value in files.items()
                           if key in source_paths or key.endswith(".mp4") and "pamela" in key}
    elif isinstance(files, list):
        result["files"] = [
            row for row in files if isinstance(row, dict) and (
                (row.get("source") or row.get("sourcePath") or row.get("path")) in source_paths
                or str(row.get("source") or row.get("sourcePath") or row.get("path", "")).endswith(".mp4")
                and "pamela" in str(row.get("source") or row.get("sourcePath") or row.get("path", ""))
            )
        ]
    result["viewSubset"] = True
    result["fullManifestFileCount"] = len(files)
    return result


def _source_paths(sources: dict) -> set[str]:
    result = set()
    def walk(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in ("path", "file", "sourcePath", "source") and isinstance(item, str):
                    result.add(item)
                else:
                    walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
    walk(sources)
    return result


def load_review_manifest(expected_snapshot: str | None = None) -> tuple[dict, dict]:
    latest = get_json(REVIEW_ORIGIN + "/latest.json")
    if expected_snapshot and latest.get("snapshot") != expected_snapshot:
        raise ValueError("GitHub och granskningssidan avser olika snapshots. Medielänkarna behålls separata.")
    digest = latest.get("contentId", "")
    if not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("Webbversionen saknar en verifierbar manifesthash.")
    manifest_path = latest.get("reviewManifest", "/granskning/manifest.json")
    if not isinstance(manifest_path, str) or not manifest_path.startswith("/") or not _relative_path(manifest_path[1:]) or "?" in manifest_path or "#" in manifest_path or not manifest_path.endswith(".json"):
        raise ValueError("Webbmanifestets sökväg är ogiltig.")
    payload = get_bytes(REVIEW_ORIGIN + manifest_path)
    if hashlib.sha256(payload).hexdigest() != digest:
        raise ValueError("Webbmanifestets hash matchar inte latest.json; kartan byts inte.")
    manifest = _json_object(payload, "webbmanifest")
    if manifest.get("snapshot") != latest.get("snapshot"):
        raise ValueError("Webbmanifestet och latest.json anger olika snapshots.")
    after = get_json(REVIEW_ORIGIN + "/latest.json")
    if after.get("snapshot") != latest.get("snapshot") or after.get("contentId") != digest:
        raise ValueError("Publiceringen ändrades under läsning. Försök igen med en sammanhållen version.")
    return manifest, latest


def _verify_inventory(inventory: dict, repository: str) -> dict:
    if inventory.get("repository") != repository or inventory.get("schemaVersion") != 1:
        raise ValueError("Källinventariet gäller inte det valda repot eller en stödd version.")
    rows = inventory.get("files")
    if not isinstance(rows, list):
        raise ValueError("Källinventariet saknar en fillista.")
    declared = {}
    for row in rows:
        if not isinstance(row, dict) or not _relative_path(row.get("path")) or row["path"] in declared or not HASH_PATTERN.fullmatch(str(row.get("sha256", ""))) or type(row.get("bytes")) is not int or row["bytes"] < 0:
            raise ValueError("Källinventariet innehåller en ogiltig eller dubbel filpost.")
        declared[row["path"]] = row
    serialized = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if hashlib.sha256(serialized).hexdigest() != inventory.get("sourceTreeSha256"):
        raise ValueError("Källinventariets sammanlagda hash stämmer inte.")
    return declared


def _verify_review_sources(manifest: dict, hashes: dict) -> None:
    rows = manifest.get("files", [])
    if isinstance(rows, dict):
        declared = {key: value.get("sha256") for key, value in rows.items() if isinstance(value, dict)}
    elif isinstance(rows, list):
        declared = {row.get("source") or row.get("sourcePath") or row.get("path"): row.get("sha256") for row in rows if isinstance(row, dict)}
    else:
        raise ValueError("Granskningsmanifestet saknar källfilernas hashlista.")
    for path in ("references/dealer-map.json", "references/pamela-motion-contract.json", "references/pamela-two-sided-bank.json", "references/pamela-idle-chain-review.json"):
        if path in hashes and declared.get(path) != hashes[path]:
            raise ValueError("Granskningsfilmerna hör till en annan kontrakts-/bankversion. Källorna visas utan dessa medielänkar.")


def _attach_review(sources: dict, provenance: dict, inventory: dict, hashes: dict) -> list[str]:
    try:
        expected = inventory.get("pendingReviewSnapshot") or inventory.get("reviewSnapshot")
        review, latest = load_review_manifest(expected)
        _verify_review_sources(review, hashes)
        sources["review-manifest"] = compact_review_manifest(review, _source_paths(sources))
        provenance["reviewManifestSha256"] = latest["contentId"]
        provenance["reviewSnapshot"] = latest["snapshot"]
        provenance["manifestVerified"] = True
        provenance["reviewSnapshotMatches"] = True
        return []
    except Exception as error:
        provenance["manifestVerified"] = False
        provenance["reviewSnapshotMatches"] = False
        return [str(error)]


def fetch_github(repository: str = REPOSITORY, ref: str = "main", include_review: bool = True) -> dict:
    repository = valid_repository(repository)
    commit = ref if re.fullmatch(r"[a-f0-9]{40}", ref) else github_head(repository, ref)
    base = f"https://raw.githubusercontent.com/{repository}/{commit}/"
    inventory_bytes = get_bytes(base + "public-source.json")
    inventory = _json_object(inventory_bytes, "public-source.json")
    declared = _verify_inventory(inventory, repository)
    sources = {}
    hashes = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(get_bytes, base + path): path for path in SOURCE_PATHS if path in declared}
        for future in concurrent.futures.as_completed(futures):
            path = futures[future]
            payload = future.result()
            digest = hashlib.sha256(payload).hexdigest()
            entry = declared[path]
            if digest != entry.get("sha256") or len(payload) != entry.get("bytes"):
                raise ValueError(f"Källkontrollen misslyckades för {path}. Föregående karta behålls.")
            sources[path] = _json_object(payload, path)
            hashes[path] = digest
    if "references/pamela-motion-contract.json" not in sources or "references/dealer-map.json" not in sources:
        raise ValueError("Publiceringen saknar de rörelse-/fackkontrakt denna läsare stöder.")
    provenance = {
        "repository": repository, "commit": commit, "sourceMode": "github",
        "sourceLabel": "GitHub · verifierade källor",
        "snapshot": inventory.get("pendingReviewSnapshot") or inventory.get("reviewSnapshot"),
        "publishedSnapshot": inventory.get("reviewSnapshot"),
        "pendingReviewSnapshot": inventory.get("pendingReviewSnapshot"),
        "sourceTreeSha256": inventory.get("sourceTreeSha256"),
        "sourceCommit": inventory.get("sourceCommit"),
        "sourceWorkingTreeSnapshot": inventory.get("sourceIsWorkingTreeSnapshot"),
        "sourceDirty": inventory.get("sourceDirty"),
        "publicSourceSha256": hashlib.sha256(inventory_bytes).hexdigest(),
        "manifestVerified": None, "reviewSnapshotMatches": None,
        "loadedAt": utc_now(), "sourceHashes": hashes,
        "issueUrl": ISSUE_URL,
    }
    warnings = []
    if include_review:
        warnings.extend(_attach_review(sources, provenance, inventory, hashes))
    result = normalize_sources(sources, provenance)
    result.setdefault("warnings", []).extend(warnings)
    atomic_json(cache_directory() / "latest-map.json", result)
    return result


def load_local(root: Path, include_review: bool = False) -> dict:
    root = root.expanduser().resolve()
    before = local_fingerprint(root)
    sources = {}
    hashes = {}
    for path in SOURCE_PATHS:
        payload = _local_bytes(root, path)
        if payload is not None:
            sources[path] = _json_object(payload, path)
            hashes[path] = hashlib.sha256(payload).hexdigest()
    if not sources:
        raise ValueError("Mappen saknar igenkända references-kontrakt. Välj projektroten.")
    inventory_payload = _local_bytes(root, "public-source.json")
    inventory = _json_object(inventory_payload, "public-source.json") if inventory_payload is not None else {}
    commit = None
    dirty = None
    try:
        commit = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"],
                                capture_output=True, text=True, timeout=4, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "-C", str(root), "status", "--porcelain"],
                                   capture_output=True, text=True, timeout=4, check=True).stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    provenance = {
        "repository": REPOSITORY, "commit": commit, "sourceMode": "local",
        "sourceLabel": "Lokal arbetskopia", "workingTreeDirty": dirty,
        "sourceHashes": hashes, "loadedAt": utc_now(), "issueUrl": ISSUE_URL,
        "publishedSnapshot": inventory.get("reviewSnapshot"),
        "pendingReviewSnapshot": inventory.get("pendingReviewSnapshot"),
        "snapshot": None,
        "manifestVerified": None, "reviewSnapshotMatches": None,
    }
    warnings = []
    review_payload = _local_bytes(root, "granskning/manifest.json")
    if review_payload is not None:
        try:
            review = _json_object(review_payload, "lokalt granskningsmanifest")
            _verify_review_sources(review, hashes)
            sources["review-manifest"] = compact_review_manifest(review, _source_paths(sources))
            provenance["reviewManifestSha256"] = hashlib.sha256(review_payload).hexdigest()
            provenance["reviewSnapshot"] = review.get("snapshot")
            provenance["manifestVerified"] = False  # Source parity is checked, not a live/latest signature.
            warnings.append("Lokalt granskningsindex matchar källorna; publicerad manifesthash har inte kontrollerats.")
        except ValueError as error:
            warnings.append(str(error))
    if include_review:
        sources.pop("review-manifest", None)
        warnings.extend(_attach_review(sources, provenance, inventory, hashes))
    if local_fingerprint(root) != before:
        raise ValueError("Den lokala källan ändrades under läsning. Försök igen med en sammanhållen version.")
    result = normalize_sources(sources, provenance)
    result.setdefault("warnings", []).extend(warnings)
    # The filesystem path is private and is never inserted into exported map JSON.
    return result


def load_saved(path: Path) -> dict:
    result = read_json(path)
    if not isinstance(result.get("actions"), list) or not isinstance(result.get("slots"), list):
        raise ValueError("Välj en exporterad Dealer Map-JSON med actions och slots.")
    if type(result.get("schemaVersion")) is not int or result["schemaVersion"] != 1:
        raise ValueError("Den här kartversionen stöds inte.")
    return result


def initial_model(bundle: Path) -> dict:
    cached = cache_directory() / "latest-map.json"
    if cached.is_file():
        try:
            data = load_saved(cached)
            data.setdefault("provenance", {})["sourceLabel"] = "Sparad GitHub-version"
            return data
        except (ValueError, OSError):
            pass
    data = load_saved(bundle / "data/dealer-map.json")
    data.setdefault("provenance", {})["sourceLabel"] = "Medföljande snapshot"
    return data


def local_fingerprint(root: Path) -> str:
    # Small contracts only, not an expensive walk through original video archives.
    root = root.expanduser().resolve()
    digest = hashlib.sha256()
    for relative in SOURCE_PATHS:
        payload = _local_bytes(root, relative)
        digest.update(relative.encode() + b"\0")
        digest.update(hashlib.sha256(payload).digest() if payload is not None else b"missing")
    return digest.hexdigest()


def read_issue_comments() -> list[dict]:
    result = []
    for page in range(1, 11):
        payload = json.loads(get_bytes(
            f"https://api.github.com/repos/{REPOSITORY}/issues/{ISSUE_NUMBER}/comments?per_page=100&page={page}"
        ))
        if not isinstance(payload, list):
            raise ValueError("GitHub gav inget kommentarsflöde.")
        result.extend({
            "url": row.get("html_url"), "user": row.get("user", {}).get("login", ""),
            "createdAt": row.get("created_at"), "body": row.get("body", ""),
        } for row in payload if isinstance(row, dict))
        if len(payload) < 100:
            break
    return result


def post_issue_comment(body: str) -> str:
    """Only called after the user presses an explicit send/confirmation button."""
    if not body.strip():
        raise ValueError("Skriv en kommentar först.")
    executable = shutil.which("gh")
    if not executable:
        raise RuntimeError("GitHub CLI saknas. Använd Kopiera och öppna GitHub.")
    process = subprocess.run(
        [executable, "api", "--method", "POST",
         f"repos/{REPOSITORY}/issues/{ISSUE_NUMBER}/comments", "--input", "-"],
        input=json.dumps({"body": body}), capture_output=True, text=True,
        timeout=45, encoding="utf-8",
    )
    if process.returncode:
        raise RuntimeError("Kommentaren kunde inte bekräftas. Kontrollera tråden före återförsök; gh behöver vara inloggat.")
    data = json.loads(process.stdout)
    url = data.get("html_url")
    if not isinstance(url, str) or not url.startswith(ISSUE_URL + "#"):
        raise RuntimeError("GitHub bekräftade inget kommentar-ID. Läs tråden innan du försöker igen.")
    return url


def issue_draft(model: dict, action: dict | None = None) -> str:
    provenance = model.get("provenance", {})
    media = (action or {}).get("media") or {}
    return (
        "Typ: REVIEW\nRunda: GUI-01\nStatus: observation\n\n"
        f"Projekt/dealer: {model.get('identity', {}).get('label', 'Se identitetsvyn')}\n"
        f"Publik commit: {provenance.get('commit') or 'okänd/lokal'}\n"
        f"Snapshot: {provenance.get('snapshot') or 'lokal arbetskopia'}\n"
        f"Handling: {(action or {}).get('id', 'ange handling')}\n"
        f"Källhash: {media.get('sha256') or 'okänd'}\n"
        f"Källrutor: {media.get('startFrame')}–{media.get('endFrameExclusive')} (slut exkl.), {media.get('fps')} fps\n\n"
        "Observerat:\n- \n\nFörväntat:\n- \n\nBevis / ruta:\n- \n\nNästa steg:\n- "
    )


def safe_public_url(value: str | None) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parts = urllib.parse.urlsplit(value)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.port not in (None, 443):
            return False
        for key, _ in urllib.parse.parse_qsl(parts.query, keep_blank_values=True):
            lower = key.lower()
            if lower in ("sig", "key", "auth", "code", "_jwt") or lower.startswith("x-amz-") or any(term in lower for term in ("token", "secret", "credential", "signature", "password", "api_key", "apikey", "authorization")):
                return False
        return True
    except ValueError:
        return False


def verified_media(media: dict, local_root: Path | None = None) -> str:
    digest = media.get("sha256", "")
    if not re.fullmatch(r"[a-f0-9]{64}", str(digest)):
        raise ValueError("Klippet saknar full SHA-256 och kan inte verifieras.")
    relative = media.get("path")
    if local_root and isinstance(relative, str):
        if not _relative_path(relative):
            raise ValueError("Mediets lokala sökväg måste vara relativ till projektroten.")
        root = local_root.resolve()
        source = (root / relative).resolve()
        if not source.is_relative_to(root):
            raise ValueError("Mediets lokala sökväg lämnar projektroten.")
        if source.is_file():
            with source.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                    raise ValueError("Den lokala filens hash skiljer sig från kontraktet.")
            return str(source)
    cached = cache_directory() / "media" / (digest + ".mp4")
    if cached.is_file():
        with cached.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() == digest:
                return str(cached)
        cached.unlink()
    url = media.get("url")
    if not safe_public_url(url):
        raise ValueError("Ingen verifierad publik medielänk eller matchande lokal fil finns.")
    if not _allowed_media_url(url):
        raise ValueError("Medielänken ligger utanför projektets kända publika medierötter.")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    cached.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="download-", dir=cached.parent)
    try:
        h = hashlib.sha256()
        size = 0
        with os.fdopen(fd, "wb") as output, _open_public(request, timeout=30, allowed=_allowed_media_url) as response:
            while chunk := response.read(256 * 1024):
                size += len(chunk)
                if size > MAX_MEDIA_BYTES:
                    raise ValueError("Klippet överskrider förhandsvisningens gräns på 160 MB.")
                h.update(chunk)
                output.write(chunk)
        if h.hexdigest() != digest:
            raise ValueError("Hämtad film har fel hash. Ingen uppspelning startades.")
        os.replace(tmp, cached)
        return str(cached)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def public_model(model: dict) -> dict:
    def clean(value):
        if isinstance(value, dict):
            return {key: clean(item) for key, item in value.items()
                    if key.lower() not in ("localroot", "localpath", "token", "apikey", "api_key", "authorization", "password", "secret", "credentials")}
        if isinstance(value, list):
            return [clean(item) for item in value]
        if isinstance(value, str):
            if value.startswith("file:"):
                return "[lokal fil]"
            value = LOCAL_PATH_PATTERN.sub("[lokal sökväg]", value)
            value = SECRET_PATTERN.sub("[skyddat värde]", value)
            value = re.sub(r"https?://[^\s\"<>]+", lambda match: match.group(0) if safe_public_url(match.group(0)) else "[skyddad eller ej publik länk]", value)
        return value
    return clean(copy.deepcopy(model))


def export_web(model: dict, destination: Path, bundle: Path) -> Path:
    html = bundle / "web/index.html"
    if not html.is_file():
        raise ValueError("Webbmall saknas i programpaketet.")
    if (destination / "index.html").resolve() == html.resolve():
        raise ValueError("Välj en separat exportmapp, inte programmets webbmalls-katalog.")
    destination.mkdir(parents=True, exist_ok=True)
    atomic_json(destination / "dealer-map.json", public_model(model))
    shutil.copyfile(html, destination / "index.html")
    return destination / "index.html"
