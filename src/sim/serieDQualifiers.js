import { STATES } from "../data/clubs.js";
import { COPA_STATE_PLACES } from "./copaDoBrasilEntrants.js";
// Série D places come from the estaduais: most federations get two or three direct places (Alagoas:
// champion and runner-up; Bahia, Goiás and Paraná: three), and 14 more go nationally by CBF ranking
// to clubs outside the national leagues (Banda B,
// https://www.bandab.com.br/esporte/futebol/vagas-na-copa-do-brasil-serie-d-o-que-esta-em-jogo-mata-mata-paranaense/amp/;
// Bahia Notícias, https://www.bahianoticias.com.br/esportes/noticia/79538-mudanca-na-serie-d-gera-duvida-sobre-vagas-do-baianao-2027-entenda-cenario).
// Simplified: every state gets two places, and the places left over go one at a time to the next
// eligible estadual finisher of each state, states in order of their Copa do Brasil places, so a club
// outside the national leagues can only come back through its estadual.
const PLACES_PER_STATE = 2;
const STATE_ORDER = [...STATES].sort((a, b) => COPA_STATE_PLACES[b] - COPA_STATE_PLACES[a] || a.localeCompare(b));
/** The clubs that fill `places` Série D places, from each state's final placings; `isEligible` rules out clubs with a national division. */
export function serieDQualifiers(statePlacings, isEligible, places) {
    const queues = new Map(STATE_ORDER.map((state) => [state, (statePlacings[state] ?? []).filter(isEligible)]));
    const qualified = [];
    const takeFrom = (state) => {
        const next = queues.get(state)?.shift();
        if (next !== undefined && qualified.length < places)
            qualified.push(next);
        return next !== undefined;
    };
    for (const state of STATE_ORDER)
        for (let i = 0; i < PLACES_PER_STATE; i++)
            takeFrom(state);
    let progress = true;
    while (qualified.length < places && progress) {
        progress = false;
        for (const state of STATE_ORDER)
            progress = takeFrom(state) || progress;
    }
    return qualified;
}
