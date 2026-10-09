from __future__ import annotations

import csv
import re
import sys

import requests

HEADERS = {"User-Agent": "boleiro-pipeline/0.1 (personal game)"}
KIT_FIELDS = ("corpo1", "calção1", "corpo2", "meias1")


def ptwiki_titles(tm_ids: list[str]) -> dict[str, str]:
    values = " ".join(f'"{i}"' for i in tm_ids)
    query = f"""SELECT ?tm ?title WHERE {{ VALUES ?tm {{ {values} }} ?item wdt:P7223 ?tm .
      ?article schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> ; schema:name ?title . }}"""
    response = requests.post("https://query.wikidata.org/sparql", data={"query": query, "format": "json"}, headers=HEADERS, timeout=120)
    response.raise_for_status()
    return {row["tm"]["value"]: row["title"]["value"] for row in response.json()["results"]["bindings"]}


def kit_colours(wikitext: str) -> list[str]:
    hexes: list[str] = []
    for field in KIT_FIELDS:
        match = re.search(rf"\|\s*{field}\s*=\s*#?([0-9A-Fa-f]{{6}})\b", wikitext)
        colour = f"#{match.group(1).upper()}" if match else None
        if colour and colour not in hexes:
            hexes.append(colour)
    return hexes[:2]


def infobox_colours(titles: list[str]) -> dict[str, list[str]]:
    found = {}
    for start in range(0, len(titles), 50):
        response = requests.get("https://pt.wikipedia.org/w/api.php", headers=HEADERS, timeout=60, params={
            "action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1,
            "format": "json", "formatversion": 2, "titles": "|".join(titles[start:start + 50]),
        })
        response.raise_for_status()
        query = response.json()["query"]
        aliases = {item["to"]: item["from"] for item in query.get("redirects", []) + query.get("normalized", [])}
        for page in query["pages"]:
            kit = kit_colours(page.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", ""))
            if len(kit) == 2:
                title = page["title"]
                while title in aliases:
                    title = aliases[title]
                found[title] = kit
    return found


def main() -> None:
    players_path, out_path = sys.argv[1:3]
    tm_ids = sorted({row["club_tm_id"] for row in csv.DictReader(open(players_path))})
    titles = ptwiki_titles(tm_ids)
    colours = infobox_colours(sorted(set(titles.values())))
    with open(out_path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["tm_id", "primary_colour", "secondary_colour", "source"])
        for tm_id, title in sorted(titles.items(), key=lambda item: int(item[0])):
            if title in colours:
                writer.writerow([tm_id, *colours[title], f"pt.wikipedia: {title} (infobox kit)"])
    print(f"{len(titles)} articles, {len(colours)} with kit colours")


if __name__ == "__main__":
    main()
