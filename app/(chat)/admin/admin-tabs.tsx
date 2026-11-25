import Link from 'next/link';

const TABS = [
  { href: '/admin', label: 'Insights' },
  { href: '/admin/agents', label: 'Agents' },
  { href: '/admin/passengers', label: 'Passenger accounts' },
  { href: '/admin/audit', label: 'Audit log' },
] as const;

// The administrator's pages, side by side under the page title.
export function AdminTabs({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Administrator pages" className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          prefetch={false}
          aria-current={tab.href === current ? 'page' : undefined}
          className={`btn btn-sm ${tab.href === current ? 'btn-primary' : 'btn-outline'}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
