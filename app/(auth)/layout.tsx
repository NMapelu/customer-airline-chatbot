// Sign-in, sign-up and MFA pages: one narrow card, centred.
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-300 bg-white p-6 text-black shadow">
        <p className="mb-4 text-sm font-semibold text-blue-700">KQ Policy Assistant</p>
        {children}
      </div>
    </main>
  );
}
