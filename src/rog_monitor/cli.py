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
    from .app import App

    app = App(args)
    if args.once:
        app.run_once()
    else:
        app.run()
    return 0
