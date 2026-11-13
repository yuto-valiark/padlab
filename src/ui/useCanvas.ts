import { useEffect, useRef } from 'react';

/** Keeps a canvas sized to its CSS box at device pixel ratio; calls draw on every frame if `animate`. */
export function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  animate: boolean,
  deps: unknown[] = [],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    const paint = () => {
      g.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      drawRef.current(g, w, h);
    };
    const ro = new ResizeObserver(() => {
      const r = cv.getBoundingClientRect();
      w = r.width;
      h = r.height;
      cv.width = Math.round(w * devicePixelRatio);
      cv.height = Math.round(h * devicePixelRatio);
      if (!animate) paint();
    });
    ro.observe(cv);
    if (animate) {
      const loop = () => {
        // Schedule the next frame first so one bad frame can't stop the animation for good.
        raf = requestAnimationFrame(loop);
        if (w > 0) paint();
      };
      raf = requestAnimationFrame(loop);
    } else paint();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, ...deps]);

  return ref;
}
