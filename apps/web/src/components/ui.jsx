// Small, accessible UI kit in the platform's visual language.
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const BUTTON = {
  primary: 'bg-forest-700 text-paper hover:bg-forest-800 shadow-sm',
  secondary: 'bg-paper text-forest-800 border border-line hover:border-forest-300 hover:bg-forest-50',
  ghost: 'text-forest-800 hover:bg-forest-50',
  danger: 'bg-clay-600 text-white hover:bg-clay-700',
  accent: 'bg-turmeric-500 text-forest-950 hover:bg-turmeric-600',
};

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...props }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3 text-lg' };
  return (
    <button
      type="button"
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed', BUTTON[variant], sizes[size], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, as: Tag = 'div', ...props }) {
  return <Tag className={cx('rounded-2xl border border-line bg-white/70 shadow-[0_1px_0_rgba(0,0,0,0.03)]', className)} {...props}>{children}</Tag>;
}

const BADGE = {
  green: 'bg-forest-100 text-forest-800', clay: 'bg-clay-100 text-clay-700', gold: 'bg-turmeric-100 text-turmeric-600',
  river: 'bg-river-100 text-river-600', gray: 'bg-paper-200 text-muted',
};
export function Badge({ tone = 'gray', className, children }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', BADGE[tone], className)}>{children}</span>;
}

export function Spinner({ label }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-forest-600" aria-hidden />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ title, text, icon: Icon = Inbox, action }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <Icon className="mb-3 h-8 w-8 text-forest-300" aria-hidden />
      <p className="font-medium text-ink">{title ?? t('common.empty')}</p>
      {text && <p className="mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Maps API error codes to translated messages. */
export function useErrorMessage() {
  const { t, i18n } = useTranslation();
  return (error) => {
    if (!error) return '';
    if (error instanceof TypeError) return t('errors.network');
    const key = `errors.${error.code}`;
    return i18n.exists(key) ? t(key) : error.message || t('common.error');
  };
}

export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-clay-100 bg-clay-100/40 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="mb-2 h-7 w-7 text-clay-600" aria-hidden />
      <p className="font-medium text-clay-700">{message(error)}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

export function InlineError({ error }) {
  const message = useErrorMessage();
  if (!error) return null;
  return <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-700" role="alert">{message(error)}</p>;
}

/** Renders loading / error / empty states for a react-query result. */
export function QueryState({ query, empty, isEmpty, children }) {
  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (isEmpty?.(query.data)) return empty ?? <EmptyState />;
  return children(query.data);
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <header className="border-b border-line bg-paper-200/60 nakshi">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="animate-rise">
            <h1 className="text-3xl font-semibold text-forest-900 sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </header>
  );
}

export function Section({ title, action, children, className }) {
  return (
    <section className={cx('space-y-4', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-forest-900">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mt-6 flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cx('whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 font-medium transition-colors',
            value === tab.value ? 'border-turmeric-500 text-forest-900' : 'border-transparent text-muted hover:text-forest-800')}
        >
          {tab.label}
          {tab.count > 0 && <span className="ml-2 rounded-full bg-clay-600 px-1.5 text-xs text-white">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, className }) {
  const id = useId();
  return (
    <div className={cx('space-y-1', className)}>
      {label && <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>}
      {typeof children === 'function' ? children(id) : children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-clay-700">{error}</p>}
    </div>
  );
}

const INPUT = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-ink placeholder:text-muted/70 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-100';
export const Input = (props) => <input className={INPUT} {...props} />;
export const Textarea = (props) => <textarea className={cx(INPUT, 'min-h-24')} {...props} />;
export function Select({ options, ...props }) {
  return (
    <select className={INPUT} {...props}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-paper p-0 shadow-2xl backdrop:bg-forest-950/40', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold text-forest-900">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-paper-200" aria-label="close">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Stat({ value, label }) {
  return (
    <div className="rounded-2xl border border-line bg-white/60 px-4 py-4 text-center">
      <div className="font-display text-3xl font-semibold text-forest-800">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}
