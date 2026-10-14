import type { SaveShards } from "../engine/sessionSave.js";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Each shard's SHA-256 in hex, by name: kept with a slot so a later save can tell which shards changed without reading them back. */
export async function hashShards(shards: SaveShards): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(Object.entries(shards).map(async ([name, json]) => [name, await sha256(json)] as const)));
}
