import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Clock3, Info, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../i18n';
import {
  canRequestSpin,
  clearIdempotencyKey,
  colorChoiceStorageKey,
  colorIdempotencyStorageKey,
  getClaimRewardCode,
  getExpectedSpin,
  getLandingRotation,
  getLandingRotationByRewardCode,
  getPhysicalPrizeRequests,
  getOrCreateIdempotencyKey,
  LEGACY_FORTUNE_WHEEL_SECTORS,
  isWeeklyFortuneWheelStatus,
  shouldOfferColorSelection,
  spinIdempotencyStorageKey,
  type FortuneWheelClaim,
  type FortuneWheelColorResponse,
  type FortuneWheelReward,
  type FortuneWheelRewardCode,
  type FortuneWheelSpinResponse,
  type FortuneWheelStatus,
} from './fortuneWheelTypes';
import { PremiumWheel } from './components/PremiumWheel';
import { PhysicalPrizeCard } from './components/PhysicalPrizeCard';
import { RewardResultScreen } from './components/RewardResultScreen';
import { RewardProgress } from './components/RewardProgress';
import { getPrizeColorDisplay } from './fortuneWheelPresentation';
import './fortuneWheel.css';

interface FortuneWheelSectionProps {
  apiBaseUrl: string;
  language: AppLanguage;
  onBack: () => void;
  onConfirmedUser: (user: Record<string, unknown>) => void;
}

const ANIMATION_MS = 2800;
const WINNER_HIGHLIGHT_MS = 620;

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

function useResetCountdown(resetsAt?: string, serverTime?: string): string {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!resetsAt || !serverTime) return;
    const resetMs = new Date(resetsAt).getTime();
    const serverStartMs = new Date(serverTime).getTime();
    const clientStartMs = Date.now();
    const update = () => setRemaining(Math.max(0, resetMs - (serverStartMs + Date.now() - clientStartMs)));
    const initialTimer = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [resetsAt, serverTime]);
  if (!resetsAt) return '';
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
  const [highlightedRewardCode, setHighlightedRewardCode] = useState<FortuneWheelRewardCode | null>(null);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<FortuneWheelClaim | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [colorConfirmationOpen, setColorConfirmationOpen] = useState(false);
  const [submittingColor, setSubmittingColor] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const spinLock = useRef(false);
  const colorLock = useRef(false);
  const animationTimer = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);

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
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    };
  }, [apiBaseUrl]);

  const available = Boolean(status?.enabled && status.eligibility.eligible);
  const weeklyStatus = status && isWeeklyFortuneWheelStatus(status) ? status : null;
  const requests = status ? getPhysicalPrizeRequests(status) : [];
  const colors = status?.physicalPrize.colors ?? [];
  const countdown = useResetCountdown(weeklyStatus?.resetsAt, weeklyStatus?.serverTime);
  const hasPersistedReward = Boolean(
    status && (
      (isWeeklyFortuneWheelStatus(status) ? status.claims.length > 0 : status.completedSpins > 0) ||
      status.physicalPrize.unlocked ||
      requests.length > 0
    )
  );
  const completed = status ? (isWeeklyFortuneWheelStatus(status) ? status.spins.remaining === 0 : status.completedSpins === 3) : false;
  const physicalPrizeLabel = status && (isWeeklyFortuneWheelStatus(status) ? status.physicalPrize.alreadyOwned : status.physicalPrize.reserved) ? 'iPhone Duo' : t('fortune.physicalPrize');
  const nextReward = useMemo(
    () => status && !isWeeklyFortuneWheelStatus(status) ? status.rewards.find((reward) => reward.spin === status.nextSpin) ?? null : null,
    [status]
  );
  const wheelBusy = spinning || highlightedRewardCode !== null;
  const formatPrizeColor = (color: string): string => {
    const display = getPrizeColorDisplay(color, colors);
    if (display.kind === 'staging') return t('fortune.colorStagingTest');
    if (display.kind === 'option') return t('fortune.colorOption', { number: display.number });
    return display.value;
  };

  const finishSpinAnimation = (claim: FortuneWheelClaim) => {
    setHighlightedRewardCode(null);
    spinLock.current = false;
    setResult(claim);
    const resultText = claim.rewardType === 'onix'
      ? t('fortune.resultOnix', { amount: Number(claim.amount || 0).toLocaleString(locale) })
      : t('fortune.resultPhysical');
    setAnnouncement(resultText);
  };

  const revealConfirmedSector = (claim: FortuneWheelClaim) => {
    setSpinning(false);
    setHighlightedRewardCode(getClaimRewardCode(claim));
    const revealDelay = reducedMotion ? 0 : WINNER_HIGHLIGHT_MS;
    revealTimer.current = window.setTimeout(
      () => finishSpinAnimation(claim),
      revealDelay
    );
  };

  const spin = async () => {
    const expectedSpin = status ? getExpectedSpin(status) : null;
    if (spinLock.current || spinning || !status || !canRequestSpin(status) || !expectedSpin) return;
    spinLock.current = true;
    setSpinning(true);
    setSpinError(false);
    setResult(null);

    const weekKey = isWeeklyFortuneWheelStatus(status) ? status.weekKey : 'legacy';
    const storageKey = spinIdempotencyStorageKey(status.campaignKey, weekKey, expectedSpin);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey(localStorage, storageKey);
      const response = await axios.post<FortuneWheelSpinResponse>(`${apiBaseUrl}/fortune-wheel/spin`, {
        expectedSpin,
        idempotencyKey,
      });

      clearIdempotencyKey(localStorage, storageKey);
      setStatus(response.data.status);
      onConfirmedUser(response.data.user);
      setRotation((current) => isWeeklyFortuneWheelStatus(response.data.status)
        ? getLandingRotationByRewardCode(getClaimRewardCode(response.data.claim), current)
        : getLandingRotation(response.data.claim.spin, current));

      const delay = reducedMotion ? 0 : ANIMATION_MS;
      animationTimer.current = window.setTimeout(
        () => revealConfirmedSector(response.data.claim),
        delay
      );
    } catch {
      // Keep the same persisted key so a network retry is idempotent server-side.
      setSpinError(true);
      setSpinning(false);
      setHighlightedRewardCode(null);
      spinLock.current = false;
    }
  };

  const submitColor = async () => {
    if (
      colorLock.current ||
      submittingColor ||
      !status ||
      !selectedColor ||
      !colors.includes(selectedColor)
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
        <div className={`fortune-wheel-content${result ? ' has-result' : ''}`}>
          {!available && (
            <section className="fortune-wheel-closed-notice">
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>{t('fortune.closedTitle')}</strong>
                <p>{t('fortune.closedText')}</p>
              </div>
            </section>
          )}
          {result ? (
            <RewardResultScreen
              claim={result}
              locale={locale}
              confirmedLabel={t('fortune.confirmed')}
              onixTitle={t('fortune.resultOnixTitle')}
              physicalTitle={t('fortune.resultPhysicalTitle')}
              physicalText={t('fortune.resultPhysicalText')}
              continueLabel={t('fortune.resultContinue')}
              chooseColorLabel={t('fortune.chooseColor')}
              canChooseColor={shouldOfferColorSelection(status)}
              onContinue={() => setResult(null)}
              onChooseColor={() => setColorDialogOpen(true)}
            />
          ) : (
            <>
              <section className="fortune-wheel-guarantee">
                <Sparkles aria-hidden="true" />
                <div>
                  <strong>{weeklyStatus ? t('fortune.weeklyTitle') : t('fortune.guaranteed')}</strong>
                  <p>{weeklyStatus ? t('fortune.weeklyText') : t('fortune.sequence')}</p>
                </div>
                {weeklyStatus && <button type="button" onClick={() => setRulesOpen(true)}><Info aria-hidden="true" />{t('fortune.rules')}</button>}
              </section>

              {weeklyStatus && (
                <section className="fortune-weekly-status" aria-label={t('fortune.weeklyStatus')}>
                  <div><strong>{weeklyStatus.spins.remaining}</strong><span>{t('fortune.spinsRemaining', { total: weeklyStatus.spins.limit })}</span></div>
                  <div><Clock3 aria-hidden="true" /><span>{weeklyStatus.spins.remaining === 0 ? t('fortune.nextWeekIn') : t('fortune.resetIn')}<strong>{countdown}</strong></span></div>
                </section>
              )}

              <PremiumWheel
                sectors={weeklyStatus ? undefined : LEGACY_FORTUNE_WHEEL_SECTORS}
                rotation={rotation}
                spinning={spinning}
                reducedMotion={reducedMotion}
                highlightedRewardCode={highlightedRewardCode}
                labels={{
                  onix_5000: { top: '5 000', bottom: 'ONIX' },
                  onix_10000: { top: '10 000', bottom: 'ONIX' },
                  onix_25000: { top: '25 000', bottom: 'ONIX' },
                  onix_50000: { top: '50 000', bottom: 'ONIX' },
                  onix_250000: { top: '250 000', bottom: 'ONIX' },
                  iphone_duo: { top: 'iPhone', bottom: 'Duo' },
                }}
                spinLabel={wheelBusy ? t('fortune.spinning') : completed ? t('fortune.completed') : t('fortune.spin')}
                spinDetail={!wheelBusy && nextReward ? formatReward(nextReward, locale, physicalPrizeLabel) : weeklyStatus ? t('fortune.serverDraw') : undefined}
                disabled={!canRequestSpin(status) || wheelBusy}
                onSpin={() => void spin()}
              />

              {spinError && (
                <div className="fortune-wheel-inline-error" role="alert">
                  <p>{t('fortune.spinError')}</p>
                  <button type="button" onClick={() => void spin()}>{t('fortune.retrySame')}</button>
                </div>
              )}
            </>
          )}

          {!isWeeklyFortuneWheelStatus(status) && <RewardProgress
            rewards={status.rewards} ariaLabel={t('fortune.progress')}
            formatReward={(reward) => formatReward(reward, locale, physicalPrizeLabel)}
            formatStatus={(rewardStatus) => t(`fortune.status.${rewardStatus}`)}
          />}
          {isWeeklyFortuneWheelStatus(status) && (
            <section className="fortune-weekly-dots" aria-label={t('fortune.weeklyProgress')}>
              {Array.from({ length: status.spins.limit }, (_, index) => <span key={index} className={index < status.spins.used ? 'is-used' : ''}>{index + 1}</span>)}
            </section>
          )}

          {!result && shouldOfferColorSelection(status) && (
            <button type="button" className="fortune-wheel-primary" onClick={() => setColorDialogOpen(true)}>
              {t('fortune.chooseColor')}
            </button>
          )}

          {requests.map((request) => (
            <PhysicalPrizeCard
              key={`${request.campaignKey}:${request.requestId}`}
              request={request}
              title={t('fortune.requestTitle')}
              prizeName="iPhone Duo"
              colorLabel={t('fortune.color')}
              requestIdLabel={t('fortune.requestId')}
              displayColor={formatPrizeColor(request.color)}
              displayStatus={(statusKey) => t(`fortune.requestStatus.${statusKey}`)}
            />
          ))}
        </div>
      )}

      {colorDialogOpen && status && shouldOfferColorSelection(status) && (
        <div className="fortune-wheel-modal-backdrop" role="presentation">
          <section className="fortune-wheel-modal" role="dialog" aria-modal="true" aria-labelledby="fortune-color-title">
            <h2 id="fortune-color-title">{t('fortune.colorTitle')}</h2>
            <p>{t('fortune.colorText')}</p>
            <div className="fortune-wheel-colors">
              {colors.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={selectedColor === color ? 'is-selected' : ''}
                  disabled={colorError && selectedColor !== color}
                  onClick={() => setSelectedColor(color)}
                >
                  {formatPrizeColor(color)}
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
            <p>{t('fortune.confirmColorText', { color: formatPrizeColor(selectedColor) })}</p>
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

      {rulesOpen && weeklyStatus && (
        <div className="fortune-wheel-modal-backdrop" role="presentation">
          <section className="fortune-wheel-modal fortune-rules-modal" role="dialog" aria-modal="true" aria-labelledby="fortune-rules-title">
            <h2 id="fortune-rules-title">{t('fortune.rulesTitle')}</h2>
            <p>{t('fortune.rulesText')}</p>
            {weeklyStatus.inventory && <p>{t('fortune.iphoneRemaining', { count: weeklyStatus.inventory.remaining })}</p>}
            <button type="button" className="fortune-wheel-primary" onClick={() => setRulesOpen(false)}>{t('fortune.close')}</button>
          </section>
        </div>
      )}
    </main>
  );
}
