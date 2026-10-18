import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

type Props = { href: string; className?: string; title?: string; children: ReactNode };

/** A link to a page on the web: a browser tab opens it in a new tab, and the desktop app, whose window is no browser, in the system's. */
export function ExternalLink({ href, className, title, children }: Props) {
  return (
    <a
      className={className}
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        if (!isTauri()) return;
        event.preventDefault();
        void openUrl(href);
      }}
    >
      {children}
    </a>
  );
}
