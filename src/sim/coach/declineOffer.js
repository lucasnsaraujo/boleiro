/** The player's coach turns an open offer down: it leaves the table at once, before it would expire. */
export function declineOffer(state, clubId) {
    const offers = state.coach.offers.filter((offer) => offer.clubId !== clubId);
    if (offers.length === state.coach.offers.length)
        throw new Error(`no open offer from ${clubId}`);
    return { ...state, coach: { ...state.coach, offers } };
}
