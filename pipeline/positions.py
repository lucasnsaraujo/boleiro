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


# FotMob's position codes, as its team pages list them (`positionIdsDesc`, "CB,LB"); wing-backs are laterais.
ROLE_OF_FOTMOB = {
    "GK": "goleiro",
    "RB": "lateral", "LB": "lateral", "RWB": "lateral", "LWB": "lateral",
    "CB": "zagueiro",
    "DM": "meia", "CDM": "meia", "CM": "meia", "AM": "meia", "CAM": "meia", "RM": "meia", "LM": "meia",
    "RW": "atacante", "LW": "atacante", "ST": "atacante", "CF": "atacante", "SS": "atacante",
}


def roles_of(main_role: str, fotmob_codes: list[str]) -> list[str]:
    """A player's roles: Transfermarkt's main one first, then the other roles FotMob lists him at, in its order."""
    roles = [main_role]
    for code in fotmob_codes:
        role = ROLE_OF_FOTMOB.get(code)
        if role and role not in roles:
            roles.append(role)
    return roles
