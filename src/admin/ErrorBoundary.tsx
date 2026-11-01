/**
 * שומר שתקלה במסך אחד לא תלבין את כל מערכת הניהול.
 * אחרי עדכון גרסה, מסך שעוד לא נטען עלול לא להימצא בשרת - במקרה כזה הדף מתרענן לבד פעם אחת.
 */
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

const CHUNK_RE = /dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (CHUNK_RE.test(String(error?.message || ""))) {
      try {
        if (!sessionStorage.getItem("tb-chunk-reload")) {
          sessionStorage.setItem("tb-chunk-reload", "1");
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
    console.error(error);
  }

  componentDidUpdate(prev: Props) {
    // מעבר למסך אחר - מנסים שוב
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = CHUNK_RE.test(String(this.state.error.message || ""));
    return (
      <div className="adm-panel" role="alert" style={{ textAlign: "center", padding: "32px 16px" }}>
        <p style={{ marginBottom: 12 }}>{chunk ? "יש גרסה חדשה של המערכת." : "משהו השתבש בהצגת המסך."}</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            try {
              sessionStorage.removeItem("tb-chunk-reload");
            } catch {
              /* */
            }
            window.location.reload();
          }}
        >
          רענון
        </button>
      </div>
    );
  }
}
