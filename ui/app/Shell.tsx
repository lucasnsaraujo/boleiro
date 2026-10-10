import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { musicFor, useSound } from "../sound/SoundProvider.js";
import { BAR_SCREENS } from "./screens.js";
import "./shell.css";

export function Shell() {
  const { pathname } = useLocation();
  const { engine: sound } = useSound();
  useEffect(() => sound.playMusic(musicFor(pathname)), [sound, pathname]);
  const showsBar = BAR_SCREENS.some((screen) => screen.path === pathname);
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
                {screen.title}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="screen">
        <Outlet />
      </main>
    </div>
  );
}
