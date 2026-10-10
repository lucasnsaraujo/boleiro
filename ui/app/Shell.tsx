import { Link, Outlet } from "react-router";
import "./shell.css";

export function Shell() {
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">
          Boleiro
        </Link>
      </header>
      <main className="screen">
        <Outlet />
      </main>
    </div>
  );
}
