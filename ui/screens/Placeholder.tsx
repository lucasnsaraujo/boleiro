import { Link } from "react-router";

type Back = { to: string; label: string };

const TO_HUB: Back = { to: "/hub", label: "Voltar ao clube" };

export function Placeholder({ title, back = TO_HUB }: { title: string; back?: Back }) {
  return (
    <>
      <h1 className="screen-title">{title}</h1>
      <p className="status">
        <Link to={back.to} className="btn-quiet">
          {back.label}
        </Link>
      </p>
    </>
  );
}
