#!/usr/bin/env python3
"""Build a portable Python entrypoint from an explicit public-file allowlist.

The readable modules remain the source of truth. This builder uses only the
standard library, performs no network calls, and does not include a Qt runtime.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import zipfile


FILES = (
    "dealer_map.py", "dealer_map_data.py", "dealer_map_io.py",
    "dealer_map_desktop.py", "dealer_map_sequence.py",
    "data/dealer-map.json", "web/index.html", "requirements.txt",
)
BOOTSTRAP = '''#!/usr/bin/env python3
"""Scout Dealer Map: self-contained app source and snapshot.

Python 3.11+ is required. GUI: python -m pip install PySide6==6.12.0
--help, --version and --export-web use only the Python standard library.
The payload is unpacked into a temporary directory for this process only.
"""
import base64
import hashlib
import io
import runpy
import sys
import tempfile
import zipfile
from pathlib import Path

PAYLOAD_SHA256 = __PAYLOAD_SHA__
MANIFEST = __MANIFEST__
PAYLOAD = (
__PAYLOAD__
)


def main():
    if sys.version_info < (3, 11):
        print("Scout Dealer Map requires Python 3.11 or later.", file=sys.stderr)
        return 2
    raw = base64.b85decode(PAYLOAD.encode("ascii"))
    if hashlib.sha256(raw).hexdigest() != PAYLOAD_SHA256:
        raise RuntimeError("The embedded program payload is damaged.")
    with tempfile.TemporaryDirectory(prefix="scout-dealer-map-", ignore_cleanup_errors=True) as directory:
        root = Path(directory).resolve()
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = archive.namelist()
            if len(names) != len(MANIFEST) or set(names) != set(MANIFEST):
                raise RuntimeError("Unexpected files in the program payload.")
            for member in archive.infolist():
                target = (root / member.filename).resolve()
                if not target.is_relative_to(root) or member.file_size > 20 * 1024 * 1024:
                    raise RuntimeError("Invalid program payload entry.")
                data = archive.read(member)
                if hashlib.sha256(data).hexdigest() != MANIFEST[member.filename]:
                    raise RuntimeError("A program file failed its integrity check.")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        sys.path.insert(0, str(root))
        try:
            runpy.run_path(str(root / "dealer_map.py"), run_name="__main__")
        except SystemExit as result:
            if result.code == 3:
                print("For this single-file edition, install the GUI dependency with:", file=sys.stderr)
                print("  python -m pip install PySide6==6.12.0", file=sys.stderr)
            raise
        finally:
            sys.path.remove(str(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''


def build(source: Path, output: Path) -> dict:
    source = source.resolve()
    output = output.expanduser().resolve()
    # Dealer_Map.py and dealer_map.py collide on Windows. Never overwrite a
    # source input, even when this build is performed on a case-sensitive OS.
    if any(str(output).casefold() == str((source / name).resolve()).casefold() for name in FILES):
        raise ValueError("Choose a separate output directory; the output would replace a source file on Windows.")
    manifest = {}
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in FILES:
            path = source / relative
            if not path.is_file() or not path.resolve().is_relative_to(source):
                raise ValueError(f"Missing or linked-outside program file: {relative}")
            data = path.read_bytes()
            if len(data) > 20 * 1024 * 1024:
                raise ValueError(f"Unexpectedly large program file: {relative}")
            manifest[relative] = hashlib.sha256(data).hexdigest()
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    payload = archive_bytes.getvalue()
    encoded = base64.b85encode(payload).decode("ascii")
    chunks = "\n".join("    " + repr(encoded[start:start + 100]) for start in range(0, len(encoded), 100))
    script = BOOTSTRAP.replace("__PAYLOAD_SHA__", repr(hashlib.sha256(payload).hexdigest())).replace("__MANIFEST__", repr(manifest)).replace("__PAYLOAD__", chunks)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(script, encoding="utf-8", newline="\n")
    return {"output": str(output), "files": len(manifest), "bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "payloadSha256": hashlib.sha256(payload).hexdigest()}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the standalone Dealer_Map.py delivery.")
    parser.add_argument("--output", type=Path, default=Path("dist/Dealer_Map.py"))
    args = parser.parse_args(argv)
    print(json.dumps(build(Path(__file__).resolve().parent, args.output), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
