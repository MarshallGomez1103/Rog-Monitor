"""Command-line interface."""

import argparse

from . import __version__


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="rog-monitor",
        description="Real-time hardware monitor for ASUS ROG laptops on Linux.",
    )
    parser.add_argument("--once", action="store_true",
                        help="print one snapshot and exit")
    parser.add_argument("--desktop", action="store_true",
                        help="launch the Electron desktop app")
    parser.add_argument("--json", action="store_true",
                        help="print one snapshot as JSON and exit")
    parser.add_argument("--json-stream", action="store_true",
                        help="emit one JSON snapshot per interval (NDJSON)")
    parser.add_argument("--interval", type=float, default=None,
                        help="refresh interval in seconds (default: config, 1.0)")
    parser.add_argument("--no-gpu", action="store_true",
                        help="skip discrete GPU queries")
    parser.add_argument("--theme", choices=["rog", "ice", "matrix"], default=None,
                        help="color theme")
    parser.add_argument("--lang", choices=["es", "en"], default=None,
                        help="UI language (default: auto from $LANG)")
    parser.add_argument("--version", action="version",
                        version=f"%(prog)s {__version__}")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.desktop:
        import pathlib
        import subprocess

        start = pathlib.Path(__file__).resolve().parents[2] / "desktop" / "start.sh"
        subprocess.Popen(["bash", str(start)], start_new_session=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
        return 0

    from .app import App

    app = App(args)
    if args.json or args.json_stream:
        app.run_json(stream=args.json_stream)
    elif args.once:
        app.run_once()
    else:
        app.run()
    return 0
