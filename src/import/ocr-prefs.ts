// "Scan a photo" (in-app OCR) preference. OCR loads a multi-MB on-device model
// on first use, so it's a real cost on weaker phones — the cook can turn it off
// (Settings → Import). Stored in localStorage with the same defensive posture as
// the other prefs: storage failure (private mode) degrades to the default.
//
// Default ON: the feature is available out of the box; disabling is the opt-out.
// When off, "Scan a photo" shows the zero-dependency on-device guidance instead
// (use the phone's own text-from-photo and share/paste it).

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const OCR_ENABLED_KEY = 'ocr-enabled';
const OCR_MODEL_KEY = 'ocr-model';

/** Which recognition model to load. `fast` (~2 MB) is quicker + smaller; `standard`
 *  (~11 MB) is more accurate, notably on harder images. Switchable for testing. */
export type OcrModel = 'fast' | 'standard';

export type OcrPrefs = {
  /** Whether in-app photo OCR is enabled. Default ON (absence ⇒ enabled). */
  isEnabled: () => boolean;
  setEnabled: (on: boolean) => void;
  /** The chosen model. Default 'fast'. */
  model: () => OcrModel;
  setModel: (m: OcrModel) => void;
};

export const createOcrPrefs = (opts: { storage?: StorageLike } = {}): OcrPrefs => {
  const storage = opts.storage ?? window.localStorage;
  return {
    isEnabled: () => {
      try {
        return storage.getItem(OCR_ENABLED_KEY) !== '0';
      } catch {
        return true;
      }
    },
    setEnabled: (on) => {
      try {
        if (on) storage.removeItem(OCR_ENABLED_KEY);
        else storage.setItem(OCR_ENABLED_KEY, '0');
      } catch {
        /* private mode: the choice lives for this page only */
      }
    },
    model: () => {
      try {
        return storage.getItem(OCR_MODEL_KEY) === 'standard' ? 'standard' : 'fast';
      } catch {
        return 'fast';
      }
    },
    setModel: (m) => {
      try {
        if (m === 'standard') storage.setItem(OCR_MODEL_KEY, 'standard');
        else storage.removeItem(OCR_MODEL_KEY);
      } catch {
        /* private mode: the choice lives for this page only */
      }
    },
  };
};
