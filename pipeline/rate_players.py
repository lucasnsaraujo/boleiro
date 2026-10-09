from __future__ import annotations

import csv
import json
import math
import sys
import unicodedata
from collections import defaultdict

DIVISION_PRIOR = {"A": 72.0, "B": 63.0, "C": 56.0, "D": 49.0, "": 42.0}
SPREAD = 7.0
POSITION_GROUP = {
    "Goalkeeper": "GK",
    "Centre-Back": "DEF", "Left-Back": "DEF", "Right-Back": "DEF", "Defender": "DEF",
    "Defensive Midfield": "MID", "Central Midfield": "MID", "Attacking Midfield": "MID",
    "Left Midfield": "MID", "Right Midfield": "MID", "Midfielder": "MID",
    "Left Winger": "ATT", "Right Winger": "ATT", "Centre-Forward": "ATT",
    "Second Striker": "ATT", "Striker": "ATT",
}


def normalize(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().strip()


def team_overlap(a: str, b: str) -> int:
    noise = {"fc", "ec", "sc", "ac", "cr", "se", "clube", "de", "do", "da", "futebol", "esporte", "esportiva", "sport", "club", "associacao", "sociedade"}
    words = lambda s: {w for w in normalize(s).replace("(", " ").replace(")", " ").split() if w not in noise}
    return len(words(a) & words(b))


def match_sofascore(player: dict[str, str], by_name: dict[str, list[dict]], by_last: dict[str, list[dict]]) -> dict | None:
    name = normalize(player["name"])
    candidates = [s for s in by_name.get(name, []) if s["div"] == player["division"]]
    if not candidates:
        parts = name.split()
        if len(parts) > 1:
            candidates = [s for s in by_last.get(parts[-1], []) if s["div"] == player["division"] and normalize(s["name"]).split()[0] == parts[0]]
    if not candidates:
        return None
    best = max(candidates, key=lambda s: team_overlap(player["club"], s["team"] or ""))
    if len(candidates) > 1 and team_overlap(player["club"], best["team"] or "") == 0:
        return None
    return best


def zscores(values: list[float]) -> list[float]:
    mean = sum(values) / len(values)
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / len(values)) or 1.0
    return [(v - mean) / sd for v in values]


def main() -> None:
    tm_path, sofa_path, clubs_path, out_path = sys.argv[1:5]
    players = [p for p in csv.DictReader(open(tm_path)) if p["name"]]
    club_ids = {club["tm_id"]: club["id"] for club in csv.DictReader(open(clubs_path))}
    for p in players:
        p["club_id"] = club_ids[p["club_tm_id"]]
    sofa = json.load(open(sofa_path))
    by_name: dict[str, list[dict]] = defaultdict(list)
    by_last: dict[str, list[dict]] = defaultdict(list)
    for s in sofa:
        by_name[normalize(s["name"])].append(s)
        by_last[normalize(s["name"]).split()[-1]].append(s)

    for p in players:
        p["group"] = POSITION_GROUP.get(p["position"], "MID")
        stats = match_sofascore(p, by_name, by_last)
        p["sofa_minutes"] = (stats or {}).get("minutesPlayed") or 0
        p["sofa_rating"] = (stats or {}).get("rating") or ""
        p["sofa_goals_assists"] = ((stats or {}).get("goals") or 0) + ((stats or {}).get("assists") or 0)
        p["matched"] = stats is not None

    signals: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for division in DIVISION_PRIOR:
        pool = [p for p in players if p["division"] == division]
        valued = [p for p in pool if p["market_value_eur"]]
        if len(valued) >= 30:
            for p, z in zip(valued, zscores([math.log(float(p["market_value_eur"])) for p in valued])):
                signals[id(p)].append((z, 1.0))
        max_minutes = max((p["sofa_minutes"] for p in pool), default=0) or 1
        for p, z in zip(pool, zscores([p["sofa_minutes"] / max_minutes for p in pool])):
            signals[id(p)].append((z, 0.6))
        for group in ("GK", "DEF", "MID", "ATT"):
            rated = [p for p in pool if p["group"] == group and p["sofa_rating"] and p["sofa_minutes"] >= 180]
            if len(rated) < 10:
                continue
            for p, z in zip(rated, zscores([float(p["sofa_rating"]) for p in rated])):
                reliability = p["sofa_minutes"] / (p["sofa_minutes"] + 900)
                signals[id(p)].append((z, 0.8 * reliability))
            if group == "ATT":
                for p, z in zip(rated, zscores([p["sofa_goals_assists"] * 90 / p["sofa_minutes"] for p in rated])):
                    signals[id(p)].append((z, 0.4 * p["sofa_minutes"] / (p["sofa_minutes"] + 900)))

    for p in players:
        weighted = signals[id(p)]
        total_weight = sum(w for _, w in weighted)
        evidence = sum(z * w for z, w in weighted) / total_weight if total_weight else 0.0
        confidence = total_weight / (total_weight + 1.0)
        age = int(p["age"]) if p["age"] else 26
        age_shift = -2.5 if age <= 19 else -1.0 if age <= 21 else -1.5 if age >= 35 else 0.0
        strength = DIVISION_PRIOR[p["division"]] + SPREAD * evidence * confidence + age_shift
        p["strength"] = max(30, min(95, round(strength)))
        p["confidence"] = round(confidence, 2)

    fields = ["division", "club_id", "club", "name", "position", "group", "age", "nationality", "market_value_eur",
              "sofa_minutes", "sofa_rating", "sofa_goals_assists", "matched", "confidence", "strength"]
    with open(out_path, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sorted(players, key=lambda p: (p["division"], p["club"], -p["strength"])))


if __name__ == "__main__":
    main()
