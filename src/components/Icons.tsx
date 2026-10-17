// Icon set (verbatim from the Figma design prototype).
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    tank: <><path d="M6 21V5c0-2 12-2 12 0v16" /><ellipse cx="12" cy="5" rx="6" ry="2" /><path d="M6 16h12M9 9h6" /></>,
    truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    fuel: <><path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M4 21h13M8 7h5v5H8zM16 8h2l2 3v6a1.5 1.5 0 0 1-3 0v-3" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v2" /></>,
    box: <><path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10" /></>,
    wallet: <><path d="M3 6a2 2 0 0 1 2-2h14v16H5a2 2 0 0 1-2-2z" /><path d="M3 8h16M15 13h3" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    file: <><path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
    device: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 5h6M11 19h2" /></>,
    sync: <><path d="M20 7h-5V2M4 17h5v5M19 12a7 7 0 0 0-12-5L4 10M5 12a7 7 0 0 0 12 5l3-3" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="M9 12l2 2 4-5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    chevron: <path d="M9 18l6-6-6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
    alert: <><path d="M12 3L2 21h20z" /><path d="M12 9v5M12 18h.01" /></>,
    print: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.file}
    </svg>
  );
}
