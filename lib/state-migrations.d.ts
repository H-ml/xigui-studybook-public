import type { AppState } from "./types";

export const CURRENT_SCHEMA_VERSION: number;
export function migrateState(input: unknown): {
  state: AppState;
  fromVersion: number;
  changed: boolean;
};
export function stateInventory(state: Partial<AppState>): Record<string, unknown>;
