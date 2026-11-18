// The save file: cash, respect and story progress in localStorage, so a
// player can close the tab and pick the city up where they left it.
import { SAVE_KEY, PLAYER } from './config.js';

export function defaultSave() {
  return {
    cash: PLAYER.startCash,
    respect: 0,
    storyIndex: 0, // the next story mission to offer; 5 means the story is done
    storyDone: false,
    jobsDone: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return { ...defaultSave(), ...data };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // A browser that refuses storage just loses the save; the game goes on.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
