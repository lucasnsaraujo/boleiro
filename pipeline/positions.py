"""Transfermarkt's position names -> the game's roles and its four position groups.

The roles are the ones Brazilian football names a squad by: goleiro, lateral, zagueiro, meia,
atacante. Generic labels ("Defender", "Midfielder", "Striker") are what Transfermarkt shows when it
has no detail; a bare "Defender" counts as a zagueiro.
"""
from __future__ import annotations

ROLE_OF_POSITION = {
    "Goalkeeper": "goleiro",
    "Left-Back": "lateral", "Right-Back": "lateral",
    "Centre-Back": "zagueiro", "Defender": "zagueiro",
    "Defensive Midfield": "meia", "Central Midfield": "meia", "Attacking Midfield": "meia",
    "Left Midfield": "meia", "Right Midfield": "meia", "Midfielder": "meia",
    "Left Winger": "atacante", "Right Winger": "atacante", "Second Striker": "atacante",
    "Centre-Forward": "atacante", "Striker": "atacante",
}
GROUP_OF_ROLE = {"goleiro": "GK", "lateral": "DEF", "zagueiro": "DEF", "meia": "MID", "atacante": "ATT"}


def role_of(position: str) -> str | None:
    return ROLE_OF_POSITION.get(position)
