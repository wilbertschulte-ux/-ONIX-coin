type AdminStateViewProps = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'error';
};

export function AdminStateView({ icon = '◇', title, description, actionLabel, onAction, tone = 'default' }: AdminStateViewProps) {
  return (
    <section className={`admin-state-view${tone === 'error' ? ' is-error' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="admin-state-icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {actionLabel && onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </section>
  );
}
