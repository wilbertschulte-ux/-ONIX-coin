import { Clock3, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../i18n';
import { PhysicalPrizeCard } from './components/PhysicalPrizeCard';
import { PremiumWheel } from './components/PremiumWheel';
import { RewardResultScreen } from './components/RewardResultScreen';
import { getLandingRotationByRewardCode, type FortuneWheelClaim, type FortuneWheelRewardCode } from './fortuneWheelTypes';
import './fortuneWheel.css';
import './fortuneWheelPreview.css';

type PreviewState = 'spins-3' | 'spins-2' | 'spins-1' | 'spins-0' | 'result-5k' | 'result-10k' | 'result-25k' | 'result-50k' | 'result-250k' | 'result-iphone' | 'color' | 'request' | 'iphone-unavailable' | 'new-week' | 'loading' | 'error';
const PREVIEW_STATES: PreviewState[] = ['spins-3', 'spins-2', 'spins-1', 'spins-0', 'result-5k', 'result-10k', 'result-25k', 'result-50k', 'result-250k', 'result-iphone', 'color', 'request', 'iphone-unavailable', 'new-week', 'loading', 'error'];
const CLAIMS: Partial<Record<PreviewState, FortuneWheelClaim>> = {
  'result-5k': { spin: 1, rewardType: 'onix', amount: 5000, prizeCode: '', rewardCode: 'onix_5000', claimedAt: '2026-11-02T12:00:00Z' },
  'result-10k': { spin: 1, rewardType: 'onix', amount: 10000, prizeCode: '', rewardCode: 'onix_10000', claimedAt: '2026-11-02T12:00:00Z' },
  'result-25k': { spin: 1, rewardType: 'onix', amount: 25000, prizeCode: '', rewardCode: 'onix_25000', claimedAt: '2026-11-02T12:00:00Z' },
  'result-50k': { spin: 1, rewardType: 'onix', amount: 50000, prizeCode: '', rewardCode: 'onix_50000', claimedAt: '2026-11-02T12:00:00Z' },
  'result-250k': { spin: 1, rewardType: 'onix', amount: 250000, prizeCode: '', rewardCode: 'onix_250000', claimedAt: '2026-11-02T12:00:00Z' },
  'result-iphone': { spin: 1, rewardType: 'physical_prize', amount: 0, prizeCode: 'iphone_duo', rewardCode: 'iphone_duo', claimedAt: '2026-11-02T12:00:00Z' },
};
const LABELS = {
  onix_5000: { top: '5 000', bottom: 'ONIX' }, onix_10000: { top: '10 000', bottom: 'ONIX' },
  onix_25000: { top: '25 000', bottom: 'ONIX' }, onix_50000: { top: '50 000', bottom: 'ONIX' },
  onix_250000: { top: '250 000', bottom: 'ONIX' }, iphone_duo: { top: 'iPhone', bottom: 'Duo' },
};

export function FortuneWheelPreview() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('state') as PreviewState | null;
  const [state, setState] = useState<PreviewState>(PREVIEW_STATES.includes(requested || 'spins-3') ? requested || 'spins-3' : 'spins-3');
  const [language, setLanguage] = useState<AppLanguage>(params.get('lang') === 'ru' ? 'ru' : 'de');
  const t = createTranslator(language);
  const locale = getLanguageLocale(language);
  const claim = CLAIMS[state] || null;
  const remaining = state === 'spins-2' ? 2 : state === 'spins-1' ? 1 : state === 'spins-0' ? 0 : 3;
  const used = 3 - remaining;
  const selectState = (next: PreviewState) => {
    setState(next); const url = new URL(window.location.href); url.searchParams.set('state', next); url.searchParams.set('lang', language); window.history.replaceState({}, '', url);
  };
  const highlighted = claim?.rewardCode as FortuneWheelRewardCode | undefined;
  const rotation = highlighted ? getLandingRotationByRewardCode(highlighted, 0) : 0;

  return <main className="fortune-wheel-screen fortune-wheel-preview-screen" data-mock-only="true">
    <nav className="fortune-preview-toolbar" aria-label={t('fortune.preview.title')}>
      <div><strong>{t('fortune.preview.title')}</strong><small>{t('fortune.preview.safe')}</small></div>
      <div className="fortune-preview-language">{(['de', 'ru'] as AppLanguage[]).map((item) => <button type="button" key={item} className={language === item ? 'is-active' : ''} onClick={() => setLanguage(item)}>{item.toUpperCase()}</button>)}</div>
      <div className="fortune-preview-states">{PREVIEW_STATES.map((item) => <button type="button" key={item} className={state === item ? 'is-active' : ''} onClick={() => selectState(item)}>{t(`fortune.preview.state.${item}`)}</button>)}</div>
    </nav>
    <header className="fortune-wheel-header fortune-preview-header"><div><span className="fortune-wheel-kicker">$ONIX COIN</span><h1>{t('fortune.title')}</h1></div></header>
    {state === 'loading' && <section className="fortune-wheel-state" aria-busy="true"><div className="fortune-wheel-loader" /><h2>{t('fortune.loading')}</h2></section>}
    {state === 'error' && <section className="fortune-wheel-state"><h2>{t('fortune.errorTitle')}</h2><p>{t('fortune.errorText')}</p><button type="button" className="fortune-wheel-secondary" onClick={() => selectState('spins-3')}><RefreshCw />{t('fortune.retry')}</button></section>}
    {state !== 'loading' && state !== 'error' && <div className={`fortune-wheel-content${claim ? ' has-result' : ''}`}>
      {claim ? <RewardResultScreen claim={claim} locale={locale} confirmedLabel={t('fortune.confirmed')} onixTitle={t('fortune.resultOnixTitleWeekly')} physicalTitle={t('fortune.resultPhysicalTitle')} physicalText={t('fortune.resultPhysicalText')} continueLabel={t('fortune.resultContinue')} chooseColorLabel={t('fortune.chooseColor')} canChooseColor={claim.rewardType === 'physical_prize'} onContinue={() => selectState('spins-2')} onChooseColor={() => selectState('color')} /> : <>
        <section className="fortune-weekly-status"><div><strong>{remaining}</strong><span>{t('fortune.spinsRemaining', { total: 3 })}</span></div><div><Clock3 /><span>{t('fortune.resetIn')}<strong>2d 08:41:12</strong></span></div></section>
        <PremiumWheel rotation={rotation} spinning={false} reducedMotion={false} highlightedRewardCode={null} labels={LABELS} spinLabel={remaining ? t('fortune.spin') : t('fortune.completed')} spinDetail={t('fortune.serverDraw')} disabled onSpin={() => undefined} />
        <section className="fortune-weekly-dots" aria-label={t('fortune.weeklyProgress')}>{[0, 1, 2].map((item) => <span key={item} className={item < used ? 'is-used' : ''}>{item + 1}</span>)}</section>
      </>}
      {state === 'color' && <section className="fortune-wheel-modal fortune-preview-inline"><h2>{t('fortune.colorTitle')}</h2><p>{t('fortune.colorText')}</p><div className="fortune-wheel-colors"><button type="button" className="is-selected">{t('fortune.colorOption', { number: 1 })}</button><button type="button">{t('fortune.colorOption', { number: 2 })}</button></div></section>}
      {state === 'request' && <PhysicalPrizeCard request={{ requestId: 'FW-MOCK-0001', campaignKey: 'mock-weekly', prizeCode: 'iphone_duo', color: 'mock-color', status: 'pending', createdAt: '2026-11-02T12:00:00Z', statusHistory: [] }} title={t('fortune.requestTitle')} prizeName="iPhone Duo" colorLabel={t('fortune.color')} requestIdLabel={t('fortune.requestId')} displayColor={t('fortune.colorOption', { number: 1 })} displayStatus={(key) => t(`fortune.requestStatus.${key}`)} />}
      {state === 'iphone-unavailable' && <section className="fortune-wheel-closed-notice"><span>{t('fortune.iphoneUnavailable')}</span></section>}
      {state === 'new-week' && <section className="fortune-wheel-guarantee"><strong>{t('fortune.newWeek')}</strong></section>}
    </div>}
  </main>;
}
