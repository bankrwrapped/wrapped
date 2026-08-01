import { useEffect, useState } from "react";

const RANDOM_DIGITS = "0123456789";

/**
 * Cinematic digit-by-digit reveal: every numeral in `text` rapidly cycles
 * through random digits before locking to its real value, left to right,
 * staggered per character - classic slot-machine/odometer effect. Non-digit
 * characters ($ . + etc) render immediately, only digits scramble.
 */
export function ScrambleReveal({
  text,
  delay = 0,
  charStagger = 70,
  scrambleDuration = 550,
  className,
}: {
  text: string;
  delay?: number;
  charStagger?: number;
  scrambleDuration?: number;
  className?: string;
}) {
  const isDigit = (c: string) => /[0-9]/.test(c);
  const [display, setDisplay] = useState(() =>
    text
      .split("")
      .map((c) => (isDigit(c) ? RANDOM_DIGITS[0] : c))
      .join("")
  );
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    let raf = 0;
    const startAt = performance.now() + delay;
    const chars = text.split("");
    const totalDuration = (chars.length - 1) * charStagger + scrambleDuration;

    const tick = (t: number) => {
      const elapsed = t - startAt;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const next = chars.map((c, i) => {
        if (!isDigit(c)) return c;
        const lockAt = i * charStagger + scrambleDuration;
        if (elapsed >= lockAt) return c;
        return RANDOM_DIGITS[Math.floor(Math.random() * 10)];
      });
      setDisplay(next.join(""));
      if (elapsed < totalDuration) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
        setSettled(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, charStagger, scrambleDuration]);

  return (
    <span className={(className ?? "") + (settled ? " animate-sweep" : "")}>
      {display}
    </span>
  );
}
