// Palm City Heat — localStorage persistence: cash, respect, story progress
// and where the player left off. Deliberately forgiving: a corrupt or
// missing save simply means a fresh game.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number(data.cash) || 0,
      respect: Number(data.respect) || 0,
      story: Number(data.story) || 0,
      x: Number(data.x) || 0,
      z: Number(data.z) || 0,
    };
  } catch {
    return null;
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.round(state.cash),
      respect: Math.round(state.respect),
      story: state.story,
      x: Math.round(state.x),
      z: Math.round(state.z),
    }));
  } catch {
    // Storage full or blocked: the game simply will not persist.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
