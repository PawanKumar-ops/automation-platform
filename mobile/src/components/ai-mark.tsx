import { useEffect, useState } from 'react';
import Svg, { Path } from 'react-native-svg';

import { AI_MARK_FPS, AI_MARK_HEX, AI_MARK_SEQUENCE, AI_MARK_SHAPES } from './ai-mark-frames';

const VB_W = 190;
const VB_H = 166;
const COUNT = AI_MARK_SEQUENCE.length;

/**
 * Vector playback of the reference AI animation. Runs on every display frame
 * and blends each traced frame into the next, so motion reads smoother than
 * the source's 30fps steps while keeping the same timing.
 */
export function AiMark({ size = 64, animated = true }: { size?: number; animated?: boolean }) {
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!animated) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      setPos((((Date.now() - start) / 1000) * AI_MARK_FPS) % COUNT);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animated]);

  const i = Math.floor(pos);
  const frac = pos - i;
  const current = AI_MARK_SHAPES[AI_MARK_SEQUENCE[i]];
  const next = AI_MARK_SHAPES[AI_MARK_SEQUENCE[(i + 1) % COUNT]];
  // The current frame stays fully opaque so the white never dims; only the
  // next frame's new edges fade in on top of it.
  const mix = frac * frac * (3 - 2 * frac);

  return (
    <Svg height={(size * VB_H) / VB_W} pointerEvents="none" viewBox={`0 0 ${VB_W} ${VB_H}`} width={size}>
      <Path d={AI_MARK_HEX} fill="#161518" />
      <Path d={current} fill="#FFFFFF" />
      {next !== current ? <Path d={next} fill="#FFFFFF" opacity={mix} /> : null}
    </Svg>
  );
}
