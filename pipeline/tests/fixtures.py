from __future__ import annotations

import gzip
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(FIXTURES.parent.parent))


def fixture(name: str) -> str:
    """A saved Transfermarkt page, gzipped in tests/fixtures."""
    return gzip.decompress((FIXTURES / f"{name}.html.gz").read_bytes()).decode("utf-8")
