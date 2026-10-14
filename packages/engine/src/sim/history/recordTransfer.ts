import { NO_RECORDS, type History } from "./history.js";

export type Transfer = { season: number; date: string; playerId: string; name: string; fromId: string; toId: string | null; fee: number };

/** Books a sale for the seller and a signing for the buyer when the fee beats their record. */
export function recordTransfer(history: History, transfer: Transfer): History {
  const { fromId, toId, fee, ...rest } = transfer;
  const clubs = { ...history.clubs };
  const seller = clubs[fromId] ?? NO_RECORDS;
  if (fee > (seller.recordSale?.fee ?? 0)) clubs[fromId] = { ...seller, recordSale: { ...rest, fee, otherClubId: toId } };
  const buyer = toId ? (clubs[toId] ?? NO_RECORDS) : null;
  if (toId && buyer && fee > (buyer.recordSigning?.fee ?? 0)) clubs[toId] = { ...buyer, recordSigning: { ...rest, fee, otherClubId: fromId } };
  return { ...history, clubs };
}
