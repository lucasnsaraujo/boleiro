/** The coach can't field a suspended player, as he can't field an injured one. */
export function refuseSuspended(lineup, suspended) {
    const banned = lineup.filter((player) => suspended.has(player.id));
    if (banned.length)
        throw new Error(`lineup has suspended players: ${banned.map((p) => p.name).join(", ")}`);
}
