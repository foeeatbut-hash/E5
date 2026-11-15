import React from 'react';

/** Small potential dot: filled with the net colour, or hollow grey for a free pin. */
export const PinDot: React.FC<{ color: string | null; size?: number }> = ({ color, size = 8 }) => (
  <span
    aria-hidden="true"
    className="inline-block shrink-0 rounded-full"
    style={{
      width: `calc(${size}px*var(--flux-ui-scale))`,
      height: `calc(${size}px*var(--flux-ui-scale))`,
      background: color ?? 'transparent',
      border: color ? '1px solid color-mix(in srgb, var(--flux-text) 25%, transparent)' : '1px solid var(--flux-text-muted)',
      opacity: color ? 1 : 0.7,
    }}
  />
);
