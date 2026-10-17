"""A brand's id across Wikipedia's kit tables, club infoboxes and the offer pool: "Viva Sorte Bet" and
"VivaSorte.bet" are one brand, "viva-sorte"."""
from __future__ import annotations

import re
import unicodedata

# Shirt names that are the same brand as one the pool or another club writes differently, checked by hand.
SAME_BRAND = {
    "nike-inc": "nike", "puma-brand": "puma", "superbet-com": "superbet", "betano-com": "betano",
    "viva-sorte-bet": "viva-sorte", "vivasorte-bet": "viva-sorte", "esportes-da-sorte-com": "esportes-da-sorte",
    "volt": "volt", "volt-sport": "volt", "banco-sicredi": "sicredi", "itau-unibanco": "itau", "guarana-antarctica-brand": "guarana-antarctica",
}


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")


def brand_id(name: str) -> str:
    slug = slugify(name)
    return SAME_BRAND.get(slug, slug)
