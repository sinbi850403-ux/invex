type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="react-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <article className="react-modal-card">
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="react-modal-actions">
          <button type="button" className="react-secondary-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'react-auth-submit is-danger' : 'react-auth-submit'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </article>
    </div>
  );
}
