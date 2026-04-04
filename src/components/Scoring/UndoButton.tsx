import { useState } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

interface UndoButtonProps {
  canUndo: boolean;
  onUndo: () => void;
}

export function UndoButton({ canUndo, onUndo }: UndoButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <button
        disabled={!canUndo}
        onClick={() => setShowConfirm(true)}
        style={{ fontSize: 13 }}
      >
        ↩ Undo
      </button>
      {showConfirm && (
        <ConfirmDialog
          title="Undo Last Play"
          message="Remove the last recorded play? This cannot be re-done."
          confirmLabel="Undo"
          onConfirm={() => {
            setShowConfirm(false);
            onUndo();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
