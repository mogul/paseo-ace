import { useRef, type ReactNode } from "react";
import { PanResponder, View, type StyleProp, type ViewStyle } from "react-native";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Measurable = { measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void } | null;

export interface DragFrames {
  rootX: number;
  rootY: number;
  groups: Record<string, Frame>;
  zones: Record<string, Frame>;
}

export function measureInWindow(ref: Measurable): Promise<Frame | null> {
  return new Promise((resolve) => {
    if (ref && typeof ref.measureInWindow === "function") {
      ref.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
    } else {
      resolve(null);
    }
  });
}

const HOLD_DELAY_MS = 300;
const MOVE_CANCEL_PX = 8;

/**
 * A full-width surface that starts a drag after a press-and-hold. Claims the
 * responder immediately (so it blocks text selection), but only fires `onGrant`
 * once the hold elapses without moving beyond a small threshold. `onMove` /
 * `onRelease` then drive the drag with page coordinates.
 */
export function DragSurface({
  onGrant,
  onMove,
  onRelease,
  children,
  style,
}: {
  onGrant: (pageX: number, pageY: number) => void;
  onMove: (pageX: number, pageY: number) => void;
  onRelease: (pageX: number, pageY: number) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const callbacks = useRef({ onGrant, onMove, onRelease });
  callbacks.current = { onGrant, onMove, onRelease };

  const state = useRef({
    dragging: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    start: { x: 0, y: 0 },
    last: { x: 0, y: 0 },
  });

  const panHandlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e, g) => {
        const s = state.current;
        s.dragging = false;
        s.start = { x: g.x0, y: g.y0 };
        s.last = { x: g.x0, y: g.y0 };
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => {
          s.timer = null;
          s.dragging = true;
          callbacks.current.onGrant(s.last.x, s.last.y);
        }, HOLD_DELAY_MS);
      },
      onPanResponderMove: (_e, g) => {
        const s = state.current;
        s.last = { x: g.moveX, y: g.moveY };
        if (!s.dragging) {
          if (Math.abs(g.moveX - s.start.x) > MOVE_CANCEL_PX || Math.abs(g.moveY - s.start.y) > MOVE_CANCEL_PX) {
            if (s.timer) {
              clearTimeout(s.timer);
              s.timer = null;
            }
          }
          return;
        }
        callbacks.current.onMove(g.moveX, g.moveY);
      },
      onPanResponderRelease: (_e, g) => {
        const s = state.current;
        if (s.timer) {
          clearTimeout(s.timer);
          s.timer = null;
        }
        if (s.dragging) {
          s.dragging = false;
          callbacks.current.onRelease(g.moveX, g.moveY);
        }
      },
      onPanResponderTerminate: (_e, g) => {
        const s = state.current;
        if (s.timer) {
          clearTimeout(s.timer);
          s.timer = null;
        }
        if (s.dragging) {
          s.dragging = false;
          callbacks.current.onRelease(g.moveX, g.moveY);
        }
      },
    }),
  ).current;

  return (
    <View style={style} {...panHandlers.panHandlers}>
      {children}
    </View>
  );
}
