#!/usr/bin/env python3
"""Scout Dealer Map: independent desktop GUI and static web export.

Desktop: python dealer_map.py
Local source: python dealer_map.py --repo-root C:/path/to/snyggare-dealer
Web export (standard library only):
    python dealer_map.py --repo-root . --export-web _site --include-review
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

BUNDLE = Path(__file__).resolve().parent
VERSION = "1.0.0"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Scout Dealer Map — rörelser, klippfack och mål.")
    parser.add_argument("--repo-root", type=Path, help="Lokal projektrot som innehåller references/.")
    parser.add_argument("--map", type=Path, help="Öppna en exporterad dealer-map.json.")
    parser.add_argument("--export-web", type=Path, metavar="MAPP", help="Exportera statisk webbvy utan Qt.")
    parser.add_argument("--include-review", action="store_true", help="Kontrollera publik review och länka bara matchande medier.")
    parser.add_argument("--fetch-github", action="store_true", help="Läs senaste publicerade GitHub-version före start/export.")
    parser.add_argument("--offline", action="store_true", help="Starta med nätverksuppdatering avstängd.")
    parser.add_argument("--screenshot", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--version", action="version", version=VERSION)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    from dealer_map_io import export_web, fetch_github, initial_model, load_local, load_saved
    try:
        if args.map:
            model = load_saved(args.map)
        elif args.repo_root:
            model = load_local(args.repo_root, include_review=args.include_review and not args.offline)
        elif args.fetch_github and not args.offline:
            model = fetch_github()
        else:
            model = initial_model(BUNDLE)
        if args.export_web:
            target = export_web(model, args.export_web, BUNDLE)
            print(f"Webbkarta exporterad: {target.resolve()}")
            print(json.dumps(model.get("stats", {}), ensure_ascii=False))
            return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Dealer Map: {error}", file=sys.stderr)
        return 2
    try:
        from dealer_map_desktop import launch
    except ImportError as error:
        print("Desktopläget behöver PySide6. Kör INSTALLERA.cmd, eller:", file=sys.stderr)
        print("  python -m pip install -r requirements.txt", file=sys.stderr)
        print(f"Teknisk detalj: {error}", file=sys.stderr)
        return 3
    return launch(model, args, BUNDLE)


if __name__ == "__main__":
    raise SystemExit(main())
