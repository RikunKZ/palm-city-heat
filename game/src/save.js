// save.js — the whole save system: one JSON blob in localStorage.
// Saved on mission completion, on pause and every few seconds of play;
// holds cash, respect, story progress and where the player left off.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null; // a corrupt save must never stop the game from starting
  }
}

export function writeSave(game) {
  try {
    const anchor = game.player.group.position;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: Math.round(game.cash),
        respect: game.respect,
        missionIndex: game.missions.index,
        storyDone: game.missions.storyDone,
        x: Math.round(anchor.x * 10) / 10,
        z: Math.round(anchor.z * 10) / 10,
      }),
    );
  } catch {
    // storage full or blocked: play on without saving
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing to clear
  }
}
