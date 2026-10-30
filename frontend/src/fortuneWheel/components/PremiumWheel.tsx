import type { CSSProperties } from 'react';
import {
  FORTUNE_WHEEL_SECTORS,
  type FortuneWheelSectorDefinition,
  type FortuneWheelSectorKind,
} from '../fortuneWheelTypes';

interface PremiumWheelProps {
  rotation: number;
  spinning: boolean;
  reducedMotion: boolean;
  highlightedSpin: 1 | 2 | 3 | null;
  labels: Record<FortuneWheelSectorKind, { top: string; bottom: string }>;
  spinLabel: string;
  spinDetail?: string;
  disabled: boolean;
  onSpin: () => void;
}

const CENTER = 200;
const RADIUS = 174;
const LABEL_RADIUS = 119;

function polarPoint(angle: number, radius: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTER + Math.cos(radians) * radius, CENTER + Math.sin(radians) * radius];
}

function sectorPath(sector: FortuneWheelSectorDefinition): string {
  const [startX, startY] = polarPoint(sector.centerAngle - 30, RADIUS);
  const [endX, endY] = polarPoint(sector.centerAngle + 30, RADIUS);
  return `M ${CENTER} ${CENTER} L ${startX} ${startY} A ${RADIUS} ${RADIUS} 0 0 1 ${endX} ${endY} Z`;
}

function labelPosition(sector: FortuneWheelSectorDefinition): { x: number; y: number } {
  const [x, y] = polarPoint(sector.centerAngle, LABEL_RADIUS);
  return { x, y };
}

export function PremiumWheel({
  rotation,
  spinning,
  reducedMotion,
  highlightedSpin,
  labels,
  spinLabel,
  spinDetail,
  disabled,
  onSpin,
}: PremiumWheelProps) {
  const busy = spinning || highlightedSpin !== null;

  return (
    <section className="premium-wheel-stage" data-premium-wheel="true">
      <div className="premium-wheel-aura" aria-hidden="true" />
      <div className="premium-wheel-pointer" aria-hidden="true">
        <span />
      </div>
      <div
        className={`premium-wheel-disc${spinning ? ' is-spinning' : ''}${highlightedSpin ? ' is-revealing' : ''}`}
        style={{ '--wheel-rotation': `${rotation}deg` } as CSSProperties}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        aria-hidden="true"
      >
        <svg viewBox="0 0 400 400" role="presentation">
          <defs>
            <linearGradient id="fortune-gold-rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff1ab" />
              <stop offset="0.28" stopColor="#b87916" />
              <stop offset="0.55" stopColor="#ffe28a" />
              <stop offset="1" stopColor="#8b5410" />
            </linearGradient>
            <radialGradient id="fortune-hub" cx="35%" cy="28%" r="75%">
              <stop offset="0" stopColor="#fff7c8" />
              <stop offset="0.5" stopColor="#f5c651" />
              <stop offset="1" stopColor="#9b5e0b" />
            </radialGradient>
            <filter id="fortune-sector-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#ffe68f" floodOpacity="0.92" />
            </filter>
          </defs>

          <circle cx="200" cy="200" r="193" fill="#030711" stroke="url(#fortune-gold-rim)" strokeWidth="12" />
          <circle cx="200" cy="200" r="181" fill="#061020" stroke="#5b390b" strokeWidth="3" />

          {FORTUNE_WHEEL_SECTORS.map((sector) => {
            const copy = labels[sector.kind];
            const point = labelPosition(sector);
            const isWinner = highlightedSpin === sector.spin && sector.primary;
            return (
              <g
                key={sector.index}
                className={`premium-wheel-sector is-${sector.kind}${isWinner ? ' is-winner' : ''}`}
                data-sector-index={sector.index}
                data-spin={sector.spin}
                data-primary={sector.primary ? 'true' : 'false'}
              >
                <path d={sectorPath(sector)} filter={isWinner ? 'url(#fortune-sector-glow)' : undefined} />
                <line
                  x1="200"
                  y1="200"
                  x2={polarPoint(sector.centerAngle - 30, RADIUS)[0]}
                  y2={polarPoint(sector.centerAngle - 30, RADIUS)[1]}
                  className="premium-wheel-divider"
                />
                <g transform={`translate(${point.x} ${point.y}) rotate(${sector.centerAngle + 90})`}>
                  <text className="premium-wheel-label-main" textAnchor="middle" y="-3">{copy.top}</text>
                  <text className="premium-wheel-label-sub" textAnchor="middle" y="15">{copy.bottom}</text>
                </g>
              </g>
            );
          })}

          <circle cx="200" cy="200" r="66" fill="#020712" stroke="#17243a" strokeWidth="8" />
          <circle cx="200" cy="200" r="56" fill="url(#fortune-hub)" stroke="#fff0a2" strokeWidth="2" />
          <circle cx="183" cy="183" r="15" fill="rgba(255,255,255,.18)" />
        </svg>
      </div>

      <button
        type="button"
        className="premium-wheel-spin"
        disabled={disabled}
        aria-busy={busy}
        onClick={onSpin}
      >
        <span>{spinLabel}</span>
        {spinDetail && <small>{spinDetail}</small>}
      </button>
    </section>
  );
}
