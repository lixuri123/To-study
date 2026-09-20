"""Absolute-path stdio entrypoint, independent of the host's working directory."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from integrations.qingjian_mcp.server import build_server  # noqa: E402

if __name__ == "__main__":
    build_server().run(transport="stdio")
