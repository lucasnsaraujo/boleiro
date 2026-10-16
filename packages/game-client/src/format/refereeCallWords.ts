import type { VarDecision, WrongCallKind } from "@boleiro/engine/sim/referees/refereeCalls";

/** What VAR decided, as the ticker and the VAR sticker say it of `name`. */
export const VAR_WORDS: Record<VarDecision, (name: string) => string> = {
  goalStands: (name) => `VAR confirma o gol de ${name}`,
  goalRuledOut: (name) => `VAR anula o gol de ${name}`,
  goalAwarded: (name) => `VAR valida o gol de ${name}`,
  penaltyAwarded: (name) => `VAR dá pênalti, ${name} na bola`,
  penaltyCancelled: (name) => `VAR desmarca o pênalti em ${name}`,
  redCardGiven: (name) => `VAR chama, vermelho para ${name}`,
  redCardCancelled: (name) => `VAR tira o vermelho de ${name}`,
};

/** A wrong call that stands, as the ticker puts the protest. */
export const WRONG_CALL_WORDS: Record<WrongCallKind, (name: string) => string> = {
  goalShouldNotStand: (name) => `Gol irregular de ${name} vale`,
  goalWronglyRuledOut: (name) => `Gol legal de ${name} anulado`,
  penaltyWronglyGiven: (name) => `Pênalti inexistente, ${name} bate`,
  penaltyNotGiven: (name) => `Pênalti em ${name} não marcado`,
  redCardWronglyGiven: (name) => `Expulsão injusta de ${name}`,
  redCardNotGiven: (name) => `${name} merecia o vermelho`,
};
