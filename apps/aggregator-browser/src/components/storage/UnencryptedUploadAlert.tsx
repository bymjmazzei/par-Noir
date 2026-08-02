import { createPortal } from 'react-dom';

export interface UnencryptedUploadAlertProps {
  limitMb: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function UnencryptedUploadAlert({ limitMb, onConfirm, onCancel }: UnencryptedUploadAlertProps) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-semibold text-white mb-2">Encryption limit exceeded</h3>
        <p className="text-neutral-400 text-sm mb-4">
          This file exceeds your encryption limit ({limitMb} MB). It will be stored unencrypted. Only your Google account will have access. Upgrade to a paid tier to encrypt larger files.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Upload unencrypted
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
