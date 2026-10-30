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

function sectorFill(kind: FortuneWheelSectorKind): string {
  if (kind === 'iphone-duo') return 'url(#fortune-sector-iphone)';
  if (kind === 'onix-250k') return 'url(#fortune-sector-blue-deep)';
  return 'url(#fortune-sector-blue)';
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
            <linearGradient id="fortune-sector-blue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1e65b7" />
              <stop offset="0.52" stopColor="#0c326d" />
              <stop offset="1" stopColor="#071a3b" />
            </linearGradient>
            <linearGradient id="fortune-sector-blue-deep" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#163d83" />
              <stop offset="0.55" stopColor="#091d49" />
              <stop offset="1" stopColor="#040d24" />
            </linearGradient>
            <linearGradient id="fortune-sector-iphone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#b27a20" />
              <stop offset="0.5" stopColor="#67400e" />
              <stop offset="1" stopColor="#211608" />
            </linearGradient>
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
                <path className="premium-wheel-sector-face" d={sectorPath(sector)} fill={sectorFill(sector.kind)} filter={isWinner ? 'url(#fortune-sector-glow)' : undefined} />
                <line
                  x1="200"
                  y1="200"
                  x2={polarPoint(sector.centerAngle - 30, RADIUS)[0]}
                  y2={polarPoint(sector.centerAngle - 30, RADIUS)[1]}
                  className="premium-wheel-divider"
                />
                <g transform={`translate(${point.x} ${point.y})`}>
                  <g
                    className="premium-wheel-label"
                    style={{ '--label-counter-rotation': `${-rotation}deg` } as CSSProperties}
                  >
                    {sector.kind === 'iphone-duo' ? (
                      <g className="premium-wheel-sector-icon is-phone" aria-hidden="true">
                        <rect x="-6" y="-28" width="12" height="20" rx="3" />
                        <line x1="-2" y1="-25" x2="2" y2="-25" />
                      </g>
                    ) : (
                      <g className="premium-wheel-sector-icon is-onix" aria-hidden="true">
                        <circle cx="0" cy="-18" r="8" />
                        <path d="M 0 -23 L 5 -18 L 0 -13 L -5 -18 Z" />
                      </g>
                    )}
                    <text className="premium-wheel-label-main" textAnchor="middle" y="5">{copy.top}</text>
                    <text className="premium-wheel-label-sub" textAnchor="middle" y="20">{copy.bottom}</text>
                  </g>
                </g>
              </g>
            );
          })}

          {Array.from({ length: 18 }, (_, index) => {
            const [x, y] = polarPoint(index * 20, 187);
            return <circle key={index} cx={x} cy={y} r="2.4" className="premium-wheel-rim-light" />;
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
        <span className="premium-wheel-emblem" aria-hidden="true">ONIX</span>
        <strong>{spinLabel}</strong>
        {spinDetail && <small>{spinDetail}</small>}
      </button>
    </section>
  );
}
