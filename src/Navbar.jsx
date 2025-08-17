import { useState } from "react";

export default function Navbar() {
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
      {/* Top row */}
      <div className="w-full h-16 pl-10 md:pl-10 pr-10 md:pr-6 flex items-center gap-6">
        {/* Logo */}
        <div className="ml-8">
          <a href="#" className="select-none">
            <span className="font-raleway font-bold text-2xl md:text-3xl tracking-wide text-black">
              AgariBro
            </span>
          </a>
        </div>

        {/* Desktop Search */}
        <form
          className="hidden md:flex flex-1 items-center ml-20"
          role="search"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="relative w-full max-w-2xl">
            <input
              type="search"
              placeholder="Search…"
              className="w-full rounded-full border border-gray-300 bg-white/90 px-5 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100"
            >
              🔍
            </button>
          </div>
        </form>

        {/* Profile / Sign In */}
        <div className="hidden md:flex items-center mr-8">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100 transition-colors"
          >
            <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
              Bro
            </span>
            Sign in
          </button>
        </div>
      </div>
    </header>
  );
}



