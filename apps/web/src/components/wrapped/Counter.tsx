import { useCountUp } from "@/hooks/use-count-up";

export function Counter({
  value,
  delay = 0,
  duration = 1800,
  className,
  prefix = "$",
  format,
}: {
  value: number;
  delay?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  format?: (v: number) => string;
}) {
  const v = useCountUp(value, duration, delay);
  return (
    <span className={className}>
      {format ? format(v) : `${prefix}${Math.round(v).toLocaleString("en-US")}`}
    </span>
  );
}
