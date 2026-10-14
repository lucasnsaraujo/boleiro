from __future__ import annotations

import gzip
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture(name: str) -> str:
    """A saved Transfermarkt page, gzipped in tests/fixtures."""
    return gzip.decompress((FIXTURES / f"{name}.html.gz").read_bytes()).decode("utf-8")
