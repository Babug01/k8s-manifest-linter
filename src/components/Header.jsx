import { useEffect, useState } from "react";

export default function Header({ title, repoUrl }) {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // localStorage can throw in private-browsing/blocked-storage contexts — theme just won't persist.
    }
  }, [dark]);

  return (
    <header style={styles.header}>
      <span style={styles.title}>{title}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {repoUrl && (
          <a href={repoUrl} target="_blank" rel="noreferrer" style={styles.link} aria-label="View source on GitHub">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.17c-3.2.7-3.88-1.35-3.88-1.35-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.8 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15v3.19c0 .3.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
            </svg>
          </a>
        )}
        <button style={styles.toggle} onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode" title="Toggle dark mode">
          {dark ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}

const styles = {
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    padding: "0 20px", height: 48, borderBottom: "1px solid var(--border, #e5e7eb)",
    background: "var(--bg, #fff)", flexShrink: 0, boxSizing: "border-box",
  },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text, #1a1a1a)", fontFamily: "system-ui, sans-serif" },
  link: { display: "flex", color: "var(--text, #1a1a1a)", opacity: 0.7 },
  toggle: {
    background: "none", border: "1px solid var(--border, #e5e7eb)", borderRadius: 6, width: 28, height: 28,
    cursor: "pointer", fontSize: 13, color: "var(--text, #1a1a1a)", display: "flex", alignItems: "center", justifyContent: "center",
  },
};
