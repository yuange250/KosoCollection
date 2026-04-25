type DiagnosticEntry = {
  type: 'event' | 'error';
  message: string;
  detail?: string;
  timestamp: string;
};

const STORAGE_KEY = 'worldscene-diagnostics';

function readEntries(): DiagnosticEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: DiagnosticEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-80)));
  } catch {
    // ignore storage failures
  }
}

export function pushWorldSceneDiagnostic(entry: Omit<DiagnosticEntry, 'timestamp'>) {
  const nextEntry: DiagnosticEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  const entries = readEntries();
  entries.push(nextEntry);
  writeEntries(entries);
  if (entry.type === 'error') {
    console.error('[worldscene-diagnostic]', nextEntry);
  } else {
    console.info('[worldscene-diagnostic]', nextEntry);
  }
}

export function installWorldSceneDiagnostics() {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    pushWorldSceneDiagnostic({
      type: 'error',
      message: event.message || 'window error',
      detail: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason =
      typeof event.reason === 'string'
        ? event.reason
        : event.reason?.stack || event.reason?.message || JSON.stringify(event.reason);
    pushWorldSceneDiagnostic({
      type: 'error',
      message: 'unhandledrejection',
      detail: reason,
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}

export function getLatestWorldSceneDiagnostic() {
  const entries = readEntries();
  return entries.length > 0 ? entries[entries.length - 1] : null;
}
