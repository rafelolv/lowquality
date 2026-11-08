import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import type { NoticeMessage } from '../types';

interface ToastStackProps {
  notices: NoticeMessage[];
  onDismiss: (id: number) => void;
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

export function ToastStack({ notices, onDismiss }: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({
  notice,
  onDismiss,
}: {
  notice: NoticeMessage;
  onDismiss: (id: number) => void;
}) {
  const Icon = ICONS[notice.kind];

  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(notice.id),
      notice.kind === 'error' ? 9000 : 5200,
    );
    return () => window.clearTimeout(timer);
  }, [notice.id, notice.kind, onDismiss]);

  return (
    <div className={`toast toast--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <Icon size={17} aria-hidden="true" />
      <p>{notice.message}</p>
      <button
        type="button"
        className="toast__close"
        onClick={() => onDismiss(notice.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
