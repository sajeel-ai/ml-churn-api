"use client";
import { RISK, pct, type RiskLevel, cn } from "@/lib/utils";

const R = 70;
const C = 2 * Math.PI * R;

/** Circular gauge of the model's churn probability, with tick marks at the
 *  model threshold and the high-risk line from the risk policy. */
export function RiskGauge({ probability, level, threshold, highThreshold, loading, size = 176 }: {
  probability?: number; level?: RiskLevel; threshold?: number; highThreshold?: number; loading?: boolean; size?: number;
}) {
  const p = probability ?? 0;
  const color = level ? RISK[level].hex : "var(--muted-foreground)";
  const tick = (v?: number) => {
    if (v === undefined) return null;
    const a = v * 2 * Math.PI - Math.PI / 2;
    return <line x1={88 + (R - 9) * Math.cos(a)} y1={88 + (R - 9) * Math.sin(a)} x2={88 + (R + 9) * Math.cos(a)} y2={88 + (R + 9) * Math.sin(a)}
      stroke="var(--foreground)" strokeWidth="2" opacity="0.55" />;
  };
  return (
    <figure className="flex flex-col items-center" aria-label={probability === undefined ? "Churn probability not available" : `Churn probability ${pct(p)}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 176 176" className={cn("h-full w-full -rotate-90", loading && "opacity-60")} role="img" aria-hidden>
          <circle cx="88" cy="88" r={R} stroke="var(--muted)" strokeWidth="12" fill="none" />
          <circle cx="88" cy="88" r={R} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C - p * C} style={{ transition: "stroke-dashoffset .6s ease-out, stroke .3s" }} />
          {tick(threshold)}{tick(highThreshold)}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-4xl font-black tracking-tight" style={{ color }}>{probability === undefined ? "–" : pct(p, 0)}</span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Churn probability</span>
        </div>
      </div>
      {threshold !== undefined && highThreshold !== undefined && (
        <figcaption className="mt-1 text-[11px] text-muted-foreground">
          Marks: model threshold {pct(threshold, 0)} · high-risk line {pct(highThreshold, 0)}
        </figcaption>
      )}
    </figure>
  );
}
