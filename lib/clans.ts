// Clans: shared limits for the server actions and the page.
export const CLAN_COST = 25_000; // NVC to found one (keeps them from being spammed)
export const CLAN_MAX_MEMBERS = 20;
export const CLAN_NAME = /^[\p{L}\p{N} _.-]{3,20}$/u;
export const CLAN_TAG = /^[A-Z0-9]{2,5}$/;
