import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { musicFor, useSound } from "../sound/SoundProvider.js";
import { screenDirection } from "./screenDirection.js";
import { BAR_SCREENS } from "./screens.js";
import "./shell.css";

export function Shell() {
  const { pathname } = useLocation();
  const { engine: sound } = useSound();
  useEffect(() => sound.playMusic(musicFor(pathname)), [sound, pathname]);
  const showsBar = BAR_SCREENS.some((screen) => screen.path === pathname);

  // The screen transition reads the direction from the root, after the new screen is in the DOM and before it animates.
  // The game opens as if coming from the start menu.
  const lastPathname = useRef("/");
  useLayoutEffect(() => {
    document.documentElement.dataset.screenDirection = screenDirection(lastPathname.current, pathname);
    lastPathname.current = pathname;
  }, [pathname]);

  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">
          Boleiro
        </Link>
        {showsBar && (
          <nav className="bar" aria-label="Telas">
            {BAR_SCREENS.map((screen) => (
              <NavLink key={screen.path} to={screen.path} className="bar-link">
                {({ isActive }) => (
                  <>
                    {screen.title}
                    {isActive && <i className="shell-bar-mark" aria-hidden="true" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main key={pathname} className="screen">
        <Outlet />
      </main>
    </div>
  );
}
