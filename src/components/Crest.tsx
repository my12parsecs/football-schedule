"use client";

import { useState } from "react";

/**
 * Club crest with a lettered fallback.
 *
 * Crests are served by football-data.org as a mix of PNG and SVG. They go
 * through a plain <img> rather than next/image on purpose: optimising remote
 * SVGs would mean enabling `dangerouslyAllowSVG`, and these badges are small
 * enough that there is nothing to gain.
 */
export function Crest({
  crest,
  tla,
  accent,
  size = 22,
}: {
  crest: string | null;
  tla: string;
  accent: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!crest || failed) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full text-[0.5rem] font-bold tracking-tight tabular-nums"
        style={{
          width: size,
          height: size,
          backgroundColor: `${accent}26`,
          color: accent,
        }}
      >
        {tla.slice(0, 3)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crest}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
