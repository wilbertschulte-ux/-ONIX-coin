import { Check } from 'lucide-react';
import type { FortuneWheelReward } from '../fortuneWheelTypes';

interface RewardProgressProps {
  rewards: FortuneWheelReward[];
  ariaLabel: string;
  formatReward: (reward: FortuneWheelReward) => string;
  formatStatus: (status: FortuneWheelReward['status']) => string;
}

export function RewardProgress({ rewards, ariaLabel, formatReward, formatStatus }: RewardProgressProps) {
  return (
    <section className="fortune-wheel-progress" aria-label={ariaLabel} role="list">
      {rewards.map((reward) => (
        <article key={reward.spin} className={`fortune-wheel-reward is-${reward.status}`} role="listitem">
          <span className="fortune-wheel-reward-number">{reward.spin}</span>
          <div>
            <strong>{formatReward(reward)}</strong>
            <small>{formatStatus(reward.status)}</small>
          </div>
          {reward.status === 'claimed' && <Check aria-hidden="true" />}
        </article>
      ))}
    </section>
  );
}
