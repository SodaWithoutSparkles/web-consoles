import { useEffect, useRef, useState, type ReactNode } from 'react';

/** One tab inside a settings section. */
export interface SettingsTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** One sidebar entry. Sections without tabs render `content` directly. */
export interface SettingsSection {
  id: string;
  label: string;
  icon: ReactNode;
  content?: ReactNode;
  tabs?: SettingsTab[];
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  sections: SettingsSection[];
}

/**
 * Centered settings dialog: icon sidebar on the left, optional scrollable tab
 * row on the right. Native <dialog> gives focus trap, Escape and focus restore.
 */
export function SettingsModal({ open, onClose, sections }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id);
  const [activeTabId, setActiveTabId] = useState<string>();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Idempotent guards: StrictMode runs effects twice.
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const tab = section?.tabs?.find((t) => t.id === activeTabId) ?? section?.tabs?.[0];

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      // Native Escape handling is unreliable here (and unfocused-input cases
      // vary by browser), so close explicitly on any Escape inside the dialog.
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      // Clicks land on the dialog itself only when they hit the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label="Settings"
      className="w-[75vw] h-[80vh] overflow-hidden rounded-lg bg-gray-900 text-gray-100 shadow-2xl"
    >
      <div className="flex h-full">
        <nav className="w-1/5 max-[850px]:w-14 shrink-0 overflow-y-auto border-r border-gray-800 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSectionId(s.id);
                setActiveTabId(undefined); // fall back to the section's first tab
              }}
              title={s.label}
              aria-current={s.id === section?.id ? 'true' : undefined}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                s.id === section?.id
                  ? 'bg-gray-800 text-emerald-400'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <span className="shrink-0">{s.icon}</span>
              <span className="truncate max-[850px]:hidden">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-2">
            <h2 className="text-sm font-semibold text-gray-300">{section?.label}</h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
              title="Close"
            >
              ✕
            </button>
          </div>

          {section?.tabs && (
            <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-800 px-4">
              {section.tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={t.id === tab?.id}
                  onClick={() => setActiveTabId(t.id)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    t.id === tab?.id
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">{tab?.content ?? section?.content}</div>
        </div>
      </div>
    </dialog>
  );
}
