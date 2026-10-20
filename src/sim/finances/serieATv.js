/**
 * Yearly Série A TV money per club. `rankedIds` is last season's table order (best first): the
 * performance share falls in a straight line from first to last (guess: the Libra and LFU
 * per-position tables are not public). The audience share follows each club's fanbase.
 */
export function serieATv(economy, rankedIds, fanbase) {
    const { pool, shares, perClubMin, perClubMax } = economy.serieATv;
    const count = rankedIds.length;
    const positionWeights = count * (count + 1) / 2;
    const totalFans = rankedIds.reduce((sum, id) => sum + fanbase(id), 0);
    return Object.fromEntries(rankedIds.map((id, index) => {
        const equal = (pool * shares.equal) / count;
        const performance = (pool * shares.performance * (count - index)) / positionWeights;
        const audience = totalFans > 0 ? (pool * shares.audience * fanbase(id)) / totalFans : 0;
        return [id, Math.round(Math.min(perClubMax, Math.max(perClubMin, equal + performance + audience)))];
    }));
}
