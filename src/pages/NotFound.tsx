import { Link } from "../router/Router";

export default function NotFound() {
  return (
    <section className="section">
      <div className="container center" style={{ maxWidth: 560 }}>
        <div className="eyebrow" style={{ justifyContent: "center" }}>404</div>
        <h1>העמוד לא נמצא</h1>
        <p className="muted">ייתכן שהקישור שגוי או שהעמוד הועבר.</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link to="/" className="btn">
            לדף הבית
          </Link>
          <Link to="/contact" className="btn btn--ghost">
            צור קשר
          </Link>
        </div>
      </div>
    </section>
  );
}
