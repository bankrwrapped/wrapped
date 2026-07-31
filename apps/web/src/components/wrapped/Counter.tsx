import { useCountUp } from "@/hooks/use-count-up";

export function Counter({
  value,
  delay = 0,
  className,
  prefix = "$",
}: {
  value: number;
  delay?: number;
  className?: string;
  prefix?: string;
}) {
  const v = useCountUp(value, 1800, delay);
  return (
    <span className={className}>
      {prefix}
      {Math.round(v).toLocaleString("en-US")}
    </span>
  );
}
