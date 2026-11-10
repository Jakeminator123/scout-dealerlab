"""Check the narrow public map export. Does not read environment variables or media."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

LOCAL_PATH = re.compile(r"(?i)(?:^|[\s\"'=(])(?:[a-z]:[\\/]|\\\\[^\\]+\\|/(?:Users|home|workspace|tmp|mnt|private)/)|^file:")
SECRET = re.compile(r"\b(?:sk-(?:proj-|live-)?[A-Za-z0-9_-]{28,}|gh[pousr]_[A-Za-z0-9]{25,})|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
SENSITIVE_QUERY = re.compile(r"(?i)^(?:token|access_token|api[_-]?key|authorization|signature|sig|_jwt|x-amz-signature|x-amz-credential)$")


def check_strings(value: object, path: str = "$") -> list[str]:
    failures: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            failures.extend(check_strings(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            failures.extend(check_strings(item, f"{path}[{index}]"))
    elif isinstance(value, str):
        # Deliberately print field paths only, never the possibly sensitive value.
        if LOCAL_PATH.search(value):
            failures.append(f"Local filesystem path in {path}")
        if SECRET.search(value):
            failures.append(f"Credential-like value in {path}")
        for raw in re.findall(r"https?://[^\s<>\"']+", value):
            try:
                url = urlsplit(raw)
                invalid = bool(url.username or url.password) or any(SENSITIVE_QUERY.match(k) for k, _ in parse_qsl(url.query))
                if invalid:
                    failures.append(f"Authenticated URL in {path}")
            except ValueError:
                failures.append(f"Invalid URL in {path}")
    return failures


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python check_web_export.py <export-directory>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).resolve()
    expected = {"index.html", "dealer-map.json"}
    actual = {str(p.relative_to(root)).replace("\\", "/") for p in root.rglob("*") if p.is_file()}
    failures = []
    if actual != expected:
        failures.append("Export must contain exactly index.html and dealer-map.json")
    if any(p.is_symlink() for p in root.rglob("*")):
        failures.append("Linked output is not permitted")
    try:
        raw = (root / "dealer-map.json").read_text(encoding="utf-8")
        failures.extend(check_strings(json.loads(raw)))
        html = (root / "index.html").read_text(encoding="utf-8")
        if SECRET.search(html):
            failures.append("Credential-like value in index.html")
    except (OSError, ValueError) as exc:
        failures.append(f"Unreadable export: {type(exc).__name__}")
    if failures:
        print("Public output check failed:\n" + "\n".join(failures), file=sys.stderr)
        return 1
    print("Public map output checked: two static files; no detected local paths or credentials.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
