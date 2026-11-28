import { Smartphone } from 'lucide-react';
import type { PhysicalPrizeRequestStatus } from '../fortuneWheelTypes';
import { getPrizeRequestStatusKey } from '../fortuneWheelPresentation';

interface PhysicalPrizeCardProps {
  request: PhysicalPrizeRequestStatus;
  title: string;
  prizeName: string;
  colorLabel: string;
  requestIdLabel: string;
  displayColor: string;
  displayStatus: (statusKey: ReturnType<typeof getPrizeRequestStatusKey>) => string;
}

export function PhysicalPrizeCard({
  request,
  title,
  prizeName,
  colorLabel,
  requestIdLabel,
  displayColor,
  displayStatus,
}: PhysicalPrizeCardProps) {
  const statusKey = getPrizeRequestStatusKey(request.status);
  return (
    <section className="fortune-wheel-request">
      <header>
        <span className="fortune-wheel-request-icon" aria-hidden="true"><Smartphone /></span>
        <div>
          <span>{title}</span>
          <strong>{prizeName}</strong>
        </div>
        <span className={`fortune-wheel-request-status is-${statusKey}`}>
          {displayStatus(statusKey)}
        </span>
      </header>
      <dl>
        <div><dt>{colorLabel}</dt><dd>{displayColor}</dd></div>
        <div><dt>{requestIdLabel}</dt><dd>{request.requestId}</dd></div>
      </dl>
    </section>
  );
}
