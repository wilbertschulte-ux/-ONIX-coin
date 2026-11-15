import type { CSSProperties } from 'react';
import {
  FORTUNE_WHEEL_SECTORS,
  type FortuneWheelRewardCode,
  type FortuneWheelSectorDefinition,
} from '../fortuneWheelTypes';

interface PremiumWheelProps {
  sectors?: readonly FortuneWheelSectorDefinition[];
  rotation: number;
  spinning: boolean;
  reducedMotion: boolean;
  highlightedRewardCode: FortuneWheelRewardCode | null;
  labels: Record<FortuneWheelRewardCode, { top: string; bottom: string }>;
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

function sectorFill(rewardCode: FortuneWheelRewardCode): string {
  if (rewardCode === 'iphone_duo') return 'url(#fortune-sector-iphone)';
  if (rewardCode === 'onix_250000' || rewardCode === 'onix_25000') return 'url(#fortune-sector-blue-deep)';
  return 'url(#fortune-sector-blue)';
}

export function PremiumWheel({
  sectors = FORTUNE_WHEEL_SECTORS,
  rotation,
  spinning,
  reducedMotion,
  highlightedRewardCode,
  labels,
  spinLabel,
  spinDetail,
  disabled,
  onSpin,
}: PremiumWheelProps) {
  const busy = spinning || highlightedRewardCode !== null;

  return (
    <section className="premium-wheel-stage" data-premium-wheel="true">
      <div className="premium-wheel-aura" aria-hidden="true" />
      <div className="premium-wheel-pointer" aria-hidden="true">
        <span />
      </div>
      <div
        className={`premium-wheel-disc${spinning ? ' is-spinning' : ''}${highlightedRewardCode ? ' is-revealing' : ''}`}
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

          <circle cx="200" cy="200" r="196" fill="#02040a" stroke="#2a1704" strokeWidth="5" />
          <circle cx="200" cy="200" r="190" fill="#030711" stroke="url(#fortune-gold-rim)" strokeWidth="10" />
          <circle cx="200" cy="200" r="182" fill="none" stroke="rgba(0,229,255,.52)" strokeWidth="2" />
          <circle cx="200" cy="200" r="178" fill="#061020" stroke="#5b390b" strokeWidth="4" />

          {sectors.map((sector) => {
            const copy = labels[sector.rewardCode];
            const point = labelPosition(sector);
            const isWinner = highlightedRewardCode === sector.rewardCode;
            return (
              <g
                key={sector.index}
                className={`premium-wheel-sector is-${sector.rewardCode.replaceAll('_', '-')}${isWinner ? ' is-winner' : ''}`}
                data-sector-index={sector.index}
                data-reward-code={sector.rewardCode}
              >
                <path className="premium-wheel-sector-face" d={sectorPath(sector)} fill={sectorFill(sector.rewardCode)} filter={isWinner ? 'url(#fortune-sector-glow)' : undefined} />
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
                    {sector.rewardCode === 'iphone_duo' ? (
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
            const [x, y] = polarPoint(index * 20, 186);
            return <circle key={index} cx={x} cy={y} r="2.4" className="premium-wheel-rim-light" />;
          })}

          <circle cx="200" cy="200" r="171" className="premium-wheel-glass" />
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
        <span className="premium-wheel-emblem" aria-hidden="true">
          <i>O</i><b>ONIX</b>
        </span>
        <strong>{spinLabel}</strong>
        {spinDetail && <small>{spinDetail}</small>}
      </button>
    </section>
  );
}
