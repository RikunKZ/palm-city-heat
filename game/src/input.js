// Keyboard and mouse state for the game: held keys, one-frame key presses,
// mouse movement for the camera, and clicks for punching and dialogue.

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  const input = {
    held,
    pressed,
    mouseDX: 0,
    mouseDY: 0,
    clicked: false,
    pointerLocked: false,

    /** True only on the first frame a key goes down. */
    wasPressed(code) {
      return pressed.has(code);
    },
    isDown(code) {
      return held.has(code);
    },
    /** Call at the end of every frame: clears the one-frame signals. */
    endFrame() {
      pressed.clear();
      input.mouseDX = 0;
      input.mouseDY = 0;
      input.clicked = false;
    },
    attach(canvas) {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        held.add(e.code);
        pressed.add(e.code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => held.delete(e.code));
      window.addEventListener('blur', () => held.clear());
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) input.clicked = true;
      });
      window.addEventListener('mousemove', (e) => {
        if (input.pointerLocked) {
          input.mouseDX += e.movementX || 0;
          input.mouseDY += e.movementY || 0;
        } else if (dragging) {
          input.mouseDX += e.movementX || 0;
          input.mouseDY += e.movementY || 0;
        }
      });
      let dragging = false;
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 2) dragging = true;
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 2) dragging = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('pointerlockchange', () => {
        input.pointerLocked = document.pointerLockElement === canvas;
      });
    },
    lockPointer(canvas) {
      if (!input.pointerLocked && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    },
  };
  return input;
}
