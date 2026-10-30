import { CheckCircle2, Coins, Smartphone } from 'lucide-react';
import type { FortuneWheelClaim } from '../fortuneWheelTypes';

interface RewardResultScreenProps {
  claim: FortuneWheelClaim;
  locale: string;
  confirmedLabel: string;
  onixTitle: string;
  physicalTitle: string;
  physicalText: string;
  continueLabel: string;
  chooseColorLabel: string;
  canChooseColor: boolean;
  onContinue: () => void;
  onChooseColor: () => void;
}

export function RewardResultScreen({
  claim,
  locale,
  confirmedLabel,
  onixTitle,
  physicalTitle,
  physicalText,
  continueLabel,
  chooseColorLabel,
  canChooseColor,
  onContinue,
  onChooseColor,
}: RewardResultScreenProps) {
  const isOnix = claim.rewardType === 'onix';

  return (
    <section
      className={`fortune-result-screen ${isOnix ? 'is-onix' : 'is-physical'}`}
      data-result-spin={claim.spin}
      data-reward-type={claim.rewardType}
      aria-labelledby="fortune-result-title"
    >
      <div className="fortune-result-rays" aria-hidden="true" />
      <div className="fortune-result-confirmed">
        <CheckCircle2 aria-hidden="true" />
        <span>{confirmedLabel}</span>
      </div>

      <div className="fortune-result-emblem" aria-hidden="true">
        {isOnix ? <Coins /> : <Smartphone />}
      </div>

      {isOnix ? (
        <div className="fortune-result-copy">
          <p>{onixTitle}</p>
          <h2 id="fortune-result-title">
            <strong>{Number(claim.amount || 0).toLocaleString(locale)}</strong>
            <span>ONIX</span>
          </h2>
        </div>
      ) : (
        <div className="fortune-result-copy fortune-result-physical-copy">
          <p>{physicalTitle}</p>
          <h2 id="fortune-result-title">iPhone Duo</h2>
          <span>{physicalText}</span>
        </div>
      )}

      <button
        type="button"
        className="fortune-wheel-primary fortune-result-action"
        onClick={canChooseColor ? onChooseColor : onContinue}
      >
        {canChooseColor ? chooseColorLabel : continueLabel}
      </button>
    </section>
  );
}
