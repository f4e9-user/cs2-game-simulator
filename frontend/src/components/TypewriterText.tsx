'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  /** ms per normal character (default 25) */
  charDelay?: number;
  /** ms on punctuation / spaces (default 60) */
  pauseDelay?: number;
}

export function TypewriterText({ text, charDelay = 25, pauseDelay = 60 }: Props) {
  const [displayed, setDisplayed] = useState('');
  const prevTextRef = useRef('');

  useEffect(() => {
    if (text === prevTextRef.current) return;
    prevTextRef.current = text;
    setDisplayed('');
    let i = 0;
    const tick = () => {
      if (i >= text.length) return;
      i++;
      setDisplayed(text.slice(0, i));
      const ch = text[i - 1] ?? '';
      setTimeout(tick, /[，。！？…\s]/.test(ch) ? pauseDelay : charDelay);
    };
    tick();
  }, [text, charDelay, pauseDelay]);

  return <>{displayed}</>;
}
