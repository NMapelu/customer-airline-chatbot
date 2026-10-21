// The QR code is an SVG data URL made by Supabase Auth; the key is for typing in by hand.
export function QrCode({ qr, secret }: { qr: string; secret: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">Scan this QR code with the app:</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
      <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="mx-auto bg-white" />
      <p className="text-sm">
        Or enter this key by hand:{' '}
        <code className="break-all rounded bg-gray-100 px-1 font-mono text-xs">{secret}</code>
      </p>
    </div>
  );
}
