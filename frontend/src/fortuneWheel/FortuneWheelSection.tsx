import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Check, Gift, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../i18n';
import {
  canRequestSpin,
  clearIdempotencyKey,
  colorChoiceStorageKey,
  colorIdempotencyStorageKey,
  getLandingRotation,
  getOrCreateIdempotencyKey,
  shouldOfferColorSelection,
  spinIdempotencyStorageKey,
  type FortuneWheelClaim,
  type FortuneWheelColorResponse,
  type FortuneWheelReward,
  type FortuneWheelSpinResponse,
  type FortuneWheelStatus,
} from './fortuneWheelTypes';
import './fortuneWheel.css';

interface FortuneWheelSectionProps {
  apiBaseUrl: string;
  language: AppLanguage;
  onBack: () => void;
  onConfirmedUser: (user: Record<string, unknown>) => void;
}

const ANIMATION_MS = 2800;

function formatReward(reward: FortuneWheelReward, locale: string, physicalPrizeLabel: string): string {
  if (reward.type === 'onix') return `${Number(reward.amount || 0).toLocaleString(locale)} ONIX`;
  return physicalPrizeLabel;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

export function FortuneWheelSection({
  apiBaseUrl,
  language,
  onBack,
  onConfirmedUser,
}: FortuneWheelSectionProps) {
  const t = createTranslator(language);
  const locale = getLanguageLocale(language);
  const reducedMotion = useReducedMotion();
  const [status, setStatus] = useState<FortuneWheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [spinError, setSpinError] = useState(false);
  const [colorError, setColorError] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<FortuneWheelClaim | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [colorConfirmationOpen, setColorConfirmationOpen] = useState(false);
  const [submittingColor, setSubmittingColor] = useState(false);
  const spinLock = useRef(false);
  const colorLock = useRef(false);
  const animationTimer = useRef<number | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await axios.get<FortuneWheelStatus>(`${apiBaseUrl}/fortune-wheel/status`);
      setStatus(response.data);
      if (shouldOfferColorSelection(response.data)) {
        const pendingColor = localStorage.getItem(colorChoiceStorageKey(response.data.campaignKey)) || '';
        if (response.data.physicalPrize.colors.includes(pendingColor)) {
          setSelectedColor(pendingColor);
          setColorError(true);
        }
        setColorDialogOpen(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const initialLoad = window.setTimeout(async () => {
      try {
        const response = await axios.get<FortuneWheelStatus>(`${apiBaseUrl}/fortune-wheel/status`);
        if (!active) return;
        setStatus(response.data);
        if (shouldOfferColorSelection(response.data)) {
          const pendingColor = localStorage.getItem(colorChoiceStorageKey(response.data.campaignKey)) || '';
          if (response.data.physicalPrize.colors.includes(pendingColor)) {
            setSelectedColor(pendingColor);
            setColorError(true);
          }
          setColorDialogOpen(true);
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initialLoad);
      if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    };
  }, [apiBaseUrl]);

  const available = Boolean(status?.enabled && status.eligibility.eligible);
  const hasPersistedReward = Boolean(
    status && (
      status.completedSpins > 0 ||
      status.physicalPrize.reserved ||
      status.physicalPrize.unlocked ||
      status.physicalPrize.request
    )
  );
  const completed = status?.completedSpins === 3;
  const physicalPrizeLabel = status?.physicalPrize.reserved ? 'iPhone Duo' : t('fortune.physicalPrize');
  const nextReward = useMemo(
    () => status?.rewards.find((reward) => reward.spin === status.nextSpin) ?? null,
    [status]
  );

  const finishSpinAnimation = (claim: FortuneWheelClaim, confirmedStatus: FortuneWheelStatus) => {
    setSpinning(false);
    spinLock.current = false;
    setResult(claim);
    const resultText = claim.rewardType === 'onix'
      ? t('fortune.resultOnix', { amount: Number(claim.amount || 0).toLocaleString(locale) })
      : t('fortune.resultPhysical');
    setAnnouncement(resultText);
    if (shouldOfferColorSelection(confirmedStatus)) setColorDialogOpen(true);
  };

  const spin = async () => {
    if (spinLock.current || spinning || !status || !canRequestSpin(status) || !status.nextSpin) return;
    spinLock.current = true;
    setSpinning(true);
    setSpinError(false);
    setResult(null);

    const expectedSpin = status.nextSpin;
    const storageKey = spinIdempotencyStorageKey(status.campaignKey, expectedSpin);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey(localStorage, storageKey);
      const response = await axios.post<FortuneWheelSpinResponse>(`${apiBaseUrl}/fortune-wheel/spin`, {
        expectedSpin,
        idempotencyKey,
      });

      clearIdempotencyKey(localStorage, storageKey);
      setStatus(response.data.status);
      onConfirmedUser(response.data.user);
      setRotation((current) => getLandingRotation(response.data.claim.spin, current));

      const delay = reducedMotion ? 0 : ANIMATION_MS;
      animationTimer.current = window.setTimeout(
        () => finishSpinAnimation(response.data.claim, response.data.status),
        delay
      );
    } catch {
      // Keep the same persisted key so a network retry is idempotent server-side.
      setSpinError(true);
      setSpinning(false);
      spinLock.current = false;
    }
  };

  const submitColor = async () => {
    if (
      colorLock.current ||
      submittingColor ||
      !status ||
      !selectedColor ||
      !status.physicalPrize.colors.includes(selectedColor)
    ) return;

    colorLock.current = true;
    setSubmittingColor(true);
    setColorError(false);
    const storageKey = colorIdempotencyStorageKey(status.campaignKey);
    const choiceStorageKey = colorChoiceStorageKey(status.campaignKey);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey(localStorage, storageKey);
      const pendingColor = localStorage.getItem(choiceStorageKey)?.trim();
      const confirmedColor = pendingColor || selectedColor;
      if (pendingColor && pendingColor !== selectedColor) return;
      localStorage.setItem(choiceStorageKey, confirmedColor);
      const response = await axios.post<FortuneWheelColorResponse>(
        `${apiBaseUrl}/fortune-wheel/iphone-color`,
        { color: confirmedColor, idempotencyKey }
      );
      clearIdempotencyKey(localStorage, storageKey);
      clearIdempotencyKey(localStorage, choiceStorageKey);
      setStatus(response.data.status);
      setColorConfirmationOpen(false);
      setColorDialogOpen(false);
      setAnnouncement(t('fortune.requestCreated'));
    } catch {
      // The key remains available for a safe retry after an ambiguous network failure.
      setColorError(true);
      setColorConfirmationOpen(false);
    } finally {
      setSubmittingColor(false);
      colorLock.current = false;
    }
  };

  return (
    <main className="fortune-wheel-screen" data-fortune-wheel-screen="true">
      <div className="fortune-wheel-orb fortune-wheel-orb-one" aria-hidden="true" />
      <div className="fortune-wheel-orb fortune-wheel-orb-two" aria-hidden="true" />

      <header className="fortune-wheel-header">
        <button type="button" className="fortune-wheel-back" onClick={onBack} aria-label={t('fortune.back')}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <span className="fortune-wheel-kicker">$ONIX COIN</span>
          <h1>{t('fortune.title')}</h1>
        </div>
      </header>

      <div className="fortune-wheel-live-region" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {loading && (
        <section className="fortune-wheel-state" aria-busy="true">
          <div className="fortune-wheel-loader" aria-hidden="true" />
          <h2>{t('fortune.loading')}</h2>
        </section>
      )}

      {!loading && loadError && (
        <section className="fortune-wheel-state">
          <h2>{t('fortune.errorTitle')}</h2>
          <p>{t('fortune.errorText')}</p>
          <button type="button" className="fortune-wheel-secondary" onClick={() => void loadStatus()}>
            <RefreshCw aria-hidden="true" /> {t('fortune.retry')}
          </button>
        </section>
      )}

      {!loading && !loadError && status && !available && !hasPersistedReward && (
        <section className="fortune-wheel-state fortune-wheel-unavailable">
          <ShieldCheck aria-hidden="true" />
          <h2>{t('fortune.unavailableTitle')}</h2>
          <p>{t('fortune.unavailableText')}</p>
        </section>
      )}

      {!loading && !loadError && status && (available || hasPersistedReward) && (
        <div className="fortune-wheel-content">
          {!available && (
            <section className="fortune-wheel-closed-notice">
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>{t('fortune.closedTitle')}</strong>
                <p>{t('fortune.closedText')}</p>
              </div>
            </section>
          )}
          <section className="fortune-wheel-guarantee">
            <Sparkles aria-hidden="true" />
            <div>
              <strong>{t('fortune.guaranteed')}</strong>
              <p>{t('fortune.sequence')}</p>
            </div>
          </section>

          <section className="fortune-wheel-stage">
            <div className="fortune-wheel-pointer" aria-hidden="true" />
            <div
              className={`fortune-wheel-disc ${spinning ? 'is-spinning' : ''}`}
              style={{ transform: `rotate(${rotation}deg)` }}
              data-reduced-motion={reducedMotion ? 'true' : 'false'}
              aria-hidden="true"
            >
              {[
                ['50K', 'sector-one'], [physicalPrizeLabel, 'sector-two'], ['250K', 'sector-three'],
                ['50K', 'sector-four'], [physicalPrizeLabel, 'sector-five'], ['250K', 'sector-six'],
              ].map(([label, className]) => (
                <span key={className} className={`fortune-wheel-sector-label ${className}`}>{label}</span>
              ))}
            </div>
            <button
              type="button"
              className="fortune-wheel-spin"
              onClick={() => void spin()}
              disabled={!canRequestSpin(status) || spinning}
              aria-busy={spinning}
            >
              <span>{spinning ? t('fortune.spinning') : completed ? t('fortune.completed') : t('fortune.spin')}</span>
              {!spinning && nextReward && <small>{formatReward(nextReward, locale, physicalPrizeLabel)}</small>}
            </button>
          </section>

          {spinError && (
            <div className="fortune-wheel-inline-error" role="alert">
              <p>{t('fortune.spinError')}</p>
              <button type="button" onClick={() => void spin()}>{t('fortune.retrySame')}</button>
            </div>
          )}

          {result && (
            <section className="fortune-wheel-result" data-result-spin={result.spin}>
              <Gift aria-hidden="true" />
              <div>
                <span>{t('fortune.confirmed')}</span>
                <strong>
                  {result.rewardType === 'onix'
                    ? t('fortune.resultOnix', { amount: Number(result.amount || 0).toLocaleString(locale) })
                    : t('fortune.resultPhysical')}
                </strong>
              </div>
            </section>
          )}

          <section className="fortune-wheel-progress" aria-label={t('fortune.progress')}>
            {status.rewards.map((reward) => (
              <article key={reward.spin} className={`fortune-wheel-reward is-${reward.status}`}>
                <span className="fortune-wheel-reward-number">{reward.spin}</span>
                <div>
                  <strong>{formatReward(reward, locale, physicalPrizeLabel)}</strong>
                  <small>{t(`fortune.status.${reward.status}`)}</small>
                </div>
                {reward.status === 'claimed' && <Check aria-hidden="true" />}
              </article>
            ))}
          </section>

          {shouldOfferColorSelection(status) && (
            <button type="button" className="fortune-wheel-primary" onClick={() => setColorDialogOpen(true)}>
              {t('fortune.chooseColor')}
            </button>
          )}

          {status.physicalPrize.request && (
            <section className="fortune-wheel-request">
              <span>{t('fortune.requestTitle')}</span>
              <strong>{status.physicalPrize.request.status}</strong>
              <dl>
                <div><dt>{t('fortune.color')}</dt><dd>{status.physicalPrize.request.color}</dd></div>
                <div><dt>{t('fortune.requestId')}</dt><dd>{status.physicalPrize.request.requestId}</dd></div>
              </dl>
            </section>
          )}
        </div>
      )}

      {colorDialogOpen && status && shouldOfferColorSelection(status) && (
        <div className="fortune-wheel-modal-backdrop" role="presentation">
          <section className="fortune-wheel-modal" role="dialog" aria-modal="true" aria-labelledby="fortune-color-title">
            <h2 id="fortune-color-title">{t('fortune.colorTitle')}</h2>
            <p>{t('fortune.colorText')}</p>
            <div className="fortune-wheel-colors">
              {status.physicalPrize.colors.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={selectedColor === color ? 'is-selected' : ''}
                  disabled={colorError && selectedColor !== color}
                  onClick={() => setSelectedColor(color)}
                >
                  {color}
                </button>
              ))}
            </div>
            {colorError && <p className="fortune-wheel-modal-error" role="alert">{t('fortune.colorError')}</p>}
            <div className="fortune-wheel-modal-actions">
              <button type="button" className="fortune-wheel-secondary" disabled={submittingColor} onClick={() => setColorDialogOpen(false)}>
                {t('fortune.cancel')}
              </button>
              <button
                type="button"
                className="fortune-wheel-primary"
                disabled={!selectedColor || submittingColor}
                onClick={() => setColorConfirmationOpen(true)}
              >
                {t('fortune.continue')}
              </button>
            </div>
          </section>
        </div>
      )}

      {colorConfirmationOpen && status && (
        <div className="fortune-wheel-modal-backdrop fortune-wheel-confirm-layer" role="presentation">
          <section className="fortune-wheel-modal" role="alertdialog" aria-modal="true" aria-labelledby="fortune-confirm-title">
            <h2 id="fortune-confirm-title">{t('fortune.confirmColorTitle')}</h2>
            <p>{t('fortune.confirmColorText', { color: selectedColor })}</p>
            <div className="fortune-wheel-modal-actions">
              <button type="button" className="fortune-wheel-secondary" disabled={submittingColor} onClick={() => setColorConfirmationOpen(false)}>
                {t('fortune.cancel')}
              </button>
              <button type="button" className="fortune-wheel-primary" disabled={submittingColor} onClick={() => void submitColor()}>
                {submittingColor ? t('fortune.saving') : t('fortune.confirmColor')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
