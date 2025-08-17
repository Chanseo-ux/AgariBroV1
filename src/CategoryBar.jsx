import { useState } from "react";

const LINKS = [
  { label: "Dashboard", href: "#" },
  { label: "Notes", href: "#" },
  { label: "Videos", href: "#" },
  { label: "Practice", href: "#" },
  { label: "Tools", href: "#" },
  { label: "Resources", href: "#" },
  { label: "Favorites", href: "#" },
];

export default function CategoryBar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full border-b bg-white">
      {/* row matches navbar padding */}
      <div className="w-full h-12 pl-9 md:pl-7 pr-4 md:pr-6 flex items-center justify-between">
        {/* Left: All Categories */}
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-medium ml-14"
          aria-expanded={open}
          aria-controls="all-categories-panel"
          onClick={() => setOpen(v => !v)}
        >
          <span>All Categories</span>
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>

        {/* Right: links (desktop) */}
        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-700">
          {LINKS.map(item => (
            <a
              key={item.label}
              href={item.href}
              className="hover:text-gray-400 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Mobile collapsible panel */}
      {open && (
        <div id="all-categories-panel" className="md:hidden border-t bg-white">
          <div className="pl-6 md:pl-8 pr-4 md:pr-6 py-3">
            <nav className="grid grid-cols-2 gap-3 text-sm text-gray-700">
              {LINKS.map(item => (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-md px-2 py-2 hover:text-gray-400 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
