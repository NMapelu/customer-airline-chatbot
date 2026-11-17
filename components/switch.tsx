// An on/off switch. With `locked`, it shows its state but can't be changed, and `lockedReason`
// is read out to screen readers and shown under the label.
export function Switch({
  label,
  checked,
  locked = false,
  lockedReason,
  onChange,
}: {
  label: string;
  checked: boolean;
  locked?: boolean;
  lockedReason?: string;
  onChange?: (checked: boolean) => void;
}) {
  const reasonId = lockedReason ? `${label.replace(/\W+/g, '-').toLowerCase()}-reason` : undefined;
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {lockedReason && (
          <p id={reasonId} className="mt-0.5 text-xs text-muted">
            {lockedReason}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={reasonId}
        aria-disabled={locked || undefined}
        onClick={locked || !onChange ? undefined : () => onChange(!checked)}
        className={`switch ${checked ? 'switch-on' : ''} ${locked ? 'switch-locked' : ''}`}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
