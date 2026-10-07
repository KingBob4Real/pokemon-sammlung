import { h } from "../../core/dom.js";

const HOLD_MS = 350; // so lange gedrückt halten, bis das Element „abhebt“
const MOVE_TOLERANCE_PX = 8; // vorher mehr bewegt = Scrollen, kein Ziehen
const EDGE_PX = 80; // so nah am Rand scrollt die Seite beim Ziehen mit
const SCROLL_STEP_PX = 12;

/**
 * Umsortieren per Gedrückt-halten-und-ziehen – fürs Handy gebaut (wie auf dem iPhone-Home-Bildschirm),
 * klappt auch mit der Maus. Normales Wischen scrollt weiter; erst nach kurzem Halten hebt das Element ab.
 * Beim Loslassen: onDrop(element, vorheriges Element | null, nächstes Element | null).
 * → Funktion zum Abschalten
 */
export function enableReorder(container, { itemSelector, onDrop }) {
  let pending = null; // gedrückt, aber noch nicht lange genug
  let drag = null; // { el, placeholder, dx, dy, x, y, lastTarget, frame }
  let swallowClick = false;

  const isItem = (el) => el && el !== drag?.el && container.contains(el) && el.matches(itemSelector);

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }

  function start() {
    const el = pending.el;
    if (!el.isConnected) return (pending = null); // Ansicht wurde inzwischen neu aufgebaut
    const rect = el.getBoundingClientRect();
    const placeholder = h("div", { class: "reorder-placeholder", style: `height:${rect.height}px` });
    el.before(placeholder);
    el.classList.add("is-dragging");
    Object.assign(el.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: "60", pointerEvents: "none" });
    drag = { el, placeholder, dx: pending.x - rect.left, dy: pending.y - rect.top, x: pending.x, y: pending.y, lastTarget: null };
    pending = null;
    navigator.vibrate?.(15);
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function move(x, y) {
    drag.x = x;
    drag.y = y;
    drag.el.style.left = `${x - drag.dx}px`;
    drag.el.style.top = `${y - drag.dy}px`;
    const target = document.elementFromPoint(x, y)?.closest(itemSelector);
    if (!isItem(target)) {
      if (!target?.closest(".reorder-placeholder")) drag.lastTarget = null;
      return;
    }
    if (target === drag.lastTarget) return; // erst wieder tauschen, wenn der Finger das Element verlassen hat
    drag.lastTarget = target;
    // Platzhalter auf die andere Seite des Ziels setzen – die anderen rücken nach
    const targetIsAfter = drag.placeholder.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (targetIsAfter) target.after(drag.placeholder);
    else target.before(drag.placeholder);
  }

  function autoScroll() {
    if (!drag) return;
    const bottomEdge = window.innerHeight - EDGE_PX - 70; // Navigation unten mitrechnen
    const step = drag.y < EDGE_PX ? -SCROLL_STEP_PX : drag.y > bottomEdge ? SCROLL_STEP_PX : 0;
    if (step) {
      window.scrollBy(0, step);
      move(drag.x, drag.y);
    }
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function finish() {
    cancelAnimationFrame(drag.frame);
    const { el, placeholder } = drag;
    placeholder.replaceWith(el);
    el.classList.remove("is-dragging");
    for (const prop of ["position", "left", "top", "width", "height", "zIndex", "pointerEvents"]) el.style[prop] = "";
    drag = null;
    swallowClick = true; // der Klick nach dem Loslassen soll nichts öffnen
    setTimeout(() => (swallowClick = false), 400);
    const sibling = (dir) => {
      let s = el[dir];
      while (s && !s.matches(itemSelector)) s = s[dir];
      return s;
    };
    onDrop(el, sibling("previousElementSibling"), sibling("nextElementSibling"));
  }

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.target.closest(itemSelector);
    if (!el || !container.contains(el)) return;
    pending = { el, x: e.clientX, y: e.clientY, timer: setTimeout(start, HOLD_MS) };
  };
  const onPointerMove = (e) => {
    if (drag) move(e.clientX, e.clientY);
    else if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > MOVE_TOLERANCE_PX) cancelPending();
  };
  const onPointerEnd = () => {
    if (drag) finish();
    else cancelPending();
  };
  // Während des Ziehens darf die Seite nicht scrollen (iPhone: nur über touchmove abschaltbar)
  const onTouchMove = (e) => drag && e.preventDefault();
  const onClick = (e) => {
    if (!swallowClick) return;
    e.preventDefault();
    e.stopPropagation();
    swallowClick = false;
  };
  const onContextMenu = (e) => (pending || drag) && e.preventDefault();

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("click", onClick, true);
  container.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  container.classList.add("reorderable");

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    window.removeEventListener("touchmove", onTouchMove);
  };
}
