import { Link } from "react-router";

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="screen-title">{title}</h1>
      <p className="status">
        <Link to="/hub" className="btn-quiet">
          Voltar ao clube
        </Link>
      </p>
    </>
  );
}
