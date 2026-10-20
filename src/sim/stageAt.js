export function groupStageAt(competition, index) {
    const stage = competition.stages[index];
    if (stage?.kind !== "groups")
        throw new Error(`${competition.id}: stage ${index} is not a group stage`);
    return stage;
}
export function knockoutStageAt(competition, index) {
    const stage = competition.stages[index];
    if (stage?.kind !== "knockout")
        throw new Error(`${competition.id}: stage ${index} is not a knockout stage`);
    return stage;
}
