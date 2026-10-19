from __future__ import annotations

import unittest

import fetch_brand_logos


def brand(id_: str, licence: str, logo_path: str = "assets/logos/x.png") -> dict[str, str]:
    return {"id": id_, "name": id_, "logo_path": logo_path, "logo_licence": licence, "logo_source": "https://commons.wikimedia.org/wiki/File:X.svg"}


class OwedCreditsTest(unittest.TestCase):
    def test_owes_a_credit_for_every_logo_whose_licence_asks_for_one(self) -> None:
        rows = [brand("sa", "CC BY-SA 4.0"), brand("attribution", "Attribution"), brand("mpl", "MPL 2"), brand("pd", "Public domain"),
                brand("cc0", "CC0"), brand("free", "Copyrighted free use"), brand("icon", fetch_brand_logos.FAVICON_LICENCE)]
        self.assertEqual([row["id"] for row in fetch_brand_logos.owed_credits(rows)], ["sa", "attribution", "mpl"])

    def test_owes_nothing_for_a_brand_shown_by_its_name(self) -> None:
        self.assertEqual(fetch_brand_logos.owed_credits([brand("no-logo", "", logo_path="")]), [])


if __name__ == "__main__":
    unittest.main()
