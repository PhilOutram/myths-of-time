// Pan and zoom for the board. One pointer drags, two pinch, the wheel zooms about the
// cursor and the buttons step. Pointer events cover mouse, touch and pen in one path.
//
// The view is a transform on the board's root <g>, which matters twice over: a gesture
// never rebuilds the board DOM, and because the transform lives inside the SVG the browser
// keeps hit-testing taps against the right hex without any coordinate maths here.
import { HEX_SIZE, hexCentre, boardBounds } from "./board.js";

const MIN_SCALE     = 1;      // 1 = the whole board fitted to the window
const MAX_SCALE     = 6;
const WHEEL_RATE    = 0.0015; // scale factor per unit of wheel deltaY
const BUTTON_STEP   = 1.6;
const TAP_SLOP_PX   = 8;      // a press that moves less than this is a tap, not a drag
const TARGET_HEX_PX = 56;     // hex width the opening view aims for (44 is the tap minimum)
const HEX_WIDTH_U   = 2 * HEX_SIZE; // a hex is this wide in viewBox units

const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function createPanZoom(svg, root) {
  let scale = MIN_SCALE;
  let tx = 0;
  let ty = 0;
  let view = { x: 0, y: 0, width: 1, height: 1 };
  let frame = 0;
  let gesture = null;
  let down = { x: 0, y: 0 };
  let movedPx = 0;
  let suppressClick = false;
  let bounds = null; // the board's extent in viewBox units; set when a game opens
  const pointers = new Map();

  function readViewBox() {
    const vb = svg.getAttribute("viewBox");
    if (!vb) return;
    const [x, y, width, height] = vb.split(/[\s,]+/).map(Number);
    if (width > 0 && height > 0) view = { x, y, width, height };
  }

  // Client pixels to viewBox units, before the view transform. getScreenCTM on the <svg>
  // stops short of the root's transform, so these points stay still while the view moves.
  // It also forces a layout, which is too expensive to do on every pointermove, so the
  // inverse is cached: it only changes when the board moves or resizes on the page.
  let inverseCTM = null;

  function refreshCTM() {
    const m = svg.getScreenCTM();
    inverseCTM = m ? m.inverse() : null;
    return inverseCTM;
  }

  function toUser(clientX, clientY) {
    const m = inverseCTM || refreshCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  }

  window.addEventListener("resize", () => {
    inverseCTM = null;
  });

  function pixelsPerUnit() {
    const m = svg.getScreenCTM();
    if (m && m.a) return m.a;
    return svg.clientWidth ? svg.clientWidth / view.width : 0;
  }

  // Keeps the board over the window: centred while it is smaller than the view, and never
  // dragged past its own edge once it is larger.
  function clampShift(t, s) {
    const out = {};
    for (const [axis, size] of [["x", "width"], ["y", "height"]]) {
      const span = s * bounds[size];
      const edge = s * bounds[axis];
      if (span <= view[size]) {
        out[axis] = view[axis] + (view[size] - span) / 2 - edge;
      } else {
        const low = view[axis] + view[size] - edge - span;
        const high = view[axis] - edge;
        out[axis] = Math.min(high, Math.max(low, t[axis]));
      }
    }
    return out;
  }

  function apply() {
    frame = 0;
    root.setAttribute("transform",
      `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`);
  }

  // Mid-gesture the view is coalesced to one update a frame. Anything one-off (a button, a
  // new game, the end of a gesture) lands at once instead, so the final position is never
  // left waiting on a frame that a backgrounded page may not run.
  function schedule() {
    if (!frame) frame = requestAnimationFrame(apply);
  }

  function flush() {
    if (frame) cancelAnimationFrame(frame);
    apply();
  }

  function setView(nextScale, nextShift) {
    scale = nextScale;
    const shift = bounds ? clampShift(nextShift, scale) : nextShift;
    tx = shift.x;
    ty = shift.y;
    schedule();
  }

  // Zooms by factor, keeping whatever sits under (clientX, clientY) where it is.
  function zoomAt(factor, clientX, clientY) {
    readViewBox();
    const p = toUser(clientX, clientY);
    if (!p) return;
    const s = clampScale(scale * factor);
    setView(s, { x: p.x - (s / scale) * (p.x - tx), y: p.y - (s / scale) * (p.y - ty) });
  }

  function centreOn(x, y, wanted) {
    readViewBox();
    const s = clampScale(wanted);
    setView(s, { x: view.x + view.width / 2 - s * x, y: view.y + view.height / 2 - s * y });
  }

  // Midpoint of the live pointers, and how far apart they are. One pointer gives no spread,
  // so the same code pans and pinches.
  function anchor() {
    const list = [...pointers.values()];
    const mid = { x: 0, y: 0 };
    for (const p of list) {
      mid.x += p.x / list.length;
      mid.y += p.y / list.length;
    }
    const spread = list.length > 1 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0;
    return { mid, spread };
  }

  function beginGesture() {
    const { mid, spread } = anchor();
    gesture = {
      spread,
      scale,
      content: { x: (mid.x - tx) / scale, y: (mid.y - ty) / scale },
    };
  }

  function updateGesture() {
    if (!gesture) return;
    const { mid, spread } = anchor();
    const factor = gesture.spread > 0 && spread > 0 ? spread / gesture.spread : 1;
    const s = clampScale(gesture.scale * factor);
    setView(s, { x: mid.x - s * gesture.content.x, y: mid.y - s * gesture.content.y });
  }

  svg.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    readViewBox();
    refreshCTM(); // once per gesture, not once per move
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    // Capture keeps a drag alive when the pointer leaves the board. It throws if the
    // pointer is no longer live, which is not a reason to drop the gesture.
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // Carry on without capture.
    }
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      down = { x: e.clientX, y: e.clientY };
      movedPx = 0;
      suppressClick = false;
    }
    beginGesture();
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    pointers.set(e.pointerId, p);
    movedPx = Math.max(movedPx, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (movedPx <= TAP_SLOP_PX && pointers.size < 2) return;
    suppressClick = true;
    updateGesture();
  });

  const endPointer = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    try {
      if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    // A finger lifting off a pinch becomes a drag, so the gesture starts again from here.
    if (pointers.size) beginGesture();
    else gesture = null;
    flush();
  };
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  // A drag must not also count as a tap on the hex it finished over. The board's own click
  // handler is on the <svg>, and the tap lands on a <polygon> inside it, so swallowing the
  // event here during capture stops it before the game sees it.
  svg.addEventListener("click", (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    refreshCTM();
    zoomAt(Math.exp(-e.deltaY * WHEEL_RATE), e.clientX, e.clientY);
    flush(); // a wheel notch is one-off, so show it now rather than a frame later
  }, { passive: false });

  return {
    // Called when a game opens: the map fixes the bounds the view is clamped to.
    reset(map) {
      bounds = boardBounds(map);
      inverseCTM = null; // the board may have been laid out since the last gesture
      readViewBox();
      setView(MIN_SCALE, { x: 0, y: 0 });
      flush();
    },
    // The opening view: centred on a hex, zoomed until a hex is comfortable to tap. A
    // desktop window already shows hexes well over the target, so this leaves it fitted.
    focusHex(k) {
      inverseCTM = null;
      readViewBox();
      const perUnit = pixelsPerUnit();
      const wanted = perUnit > 0 ? TARGET_HEX_PX / (HEX_WIDTH_U * perUnit) : MIN_SCALE;
      const [x, y] = hexCentre(k);
      centreOn(x, y, wanted);
      flush();
    },
    zoomIn() {
      refreshCTM();
      const r = svg.getBoundingClientRect();
      zoomAt(BUTTON_STEP, r.left + r.width / 2, r.top + r.height / 2);
      flush();
    },
    zoomOut() {
      refreshCTM();
      const r = svg.getBoundingClientRect();
      zoomAt(1 / BUTTON_STEP, r.left + r.width / 2, r.top + r.height / 2);
      flush();
    },
    fit() {
      readViewBox();
      setView(MIN_SCALE, { x: 0, y: 0 });
      flush();
    },
    get scale() {
      return scale;
    },
  };
}
