// input.js — keyboard and mouse state for the whole game.
// Game code reads `keys` (held), consumes one-shot presses via `pressed`,
// and uses the pointer-lock mouse deltas accumulated each frame.

export const keys = new Set();
export const pressed = new Set();
export const mouse = { dx: 0, dy: 0, down: false, clicked: false };

let initialised = false;

export function initInput(canvas) {
  if (initialised) return;
  initialised = true;

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouse.dx += event.movementX || 0;
      mouse.dy += event.movementY || 0;
    }
  });
}

export function lockPointer(canvas) {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
}

export function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

// called once at the end of every frame: one-shot state resets, held state stays
export function endFrameInput() {
  pressed.clear();
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.clicked = false;
}
