// Material 3 Expressive shapes (cookie, clover, burst) drawn as SVG paths in a 100 × 100 box.
const cache = new Map();

export function blobPath(lobes, depth, rotation = -Math.PI / 2, steps = 180) {
  const id = `${lobes}:${depth}:${rotation}`;
  if (cache.has(id)) return cache.get(id);
  const points = [];
  for (let i = 0; i < steps; i++) {
    const angle = 2 * Math.PI * i / steps;
    const radius = 48 * (1 + depth * Math.cos(lobes * (angle - rotation))) / (1 + depth);
    points.push(`${(50 + radius * Math.cos(angle)).toFixed(1)} ${(50 + radius * Math.sin(angle)).toFixed(1)}`);
  }
  const path = `M${points.join('L')}Z`;
  cache.set(id, path);
  return path;
}

export const shape = (lobes, depth, className = '', rotation) =>
  `<svg class="shape ${className}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="${blobPath(lobes, depth, rotation)}"/></svg>`;
