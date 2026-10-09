"""A source-independent team key, so Sofascore and ESPN rows can be joined by name.

Lowercase ASCII words without club-type abbreviations: "CR Vasco da Gama" and "Vasco da Gama" both
become "vasco-da-gama". State suffixes stay ("america-mg" is not "america-rn"), so the join is
approximate: names that differ in more than that ("Gazin Porto Velho" vs "Porto Velho") don't match.
"""
from __future__ import annotations

import re
import unicodedata

CLUB_ABBREVIATIONS = {"ec", "fc", "sc", "ac", "cr", "ca", "cf", "aa", "ad", "afc", "saf"}


def team_key(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    words = [w for w in re.split(r"[^a-z0-9]+", ascii_name) if w and w not in CLUB_ABBREVIATIONS]
    return "-".join(words) or ascii_name
