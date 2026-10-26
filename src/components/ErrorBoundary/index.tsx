import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getInterfaceErrorKind } from "../../domain/interfaceError";
import styles from "./index.module.scss";

interface Props { children: ReactNode }
interface State { hasError: boolean; error: unknown }

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  private heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Не удалось открыть раздел портала:", error, info.componentStack);
    this.heading.current?.focus({ preventScroll: true });
  }

  private retry = () => this.setState({ hasError: false, error: null }, () => {
    if (!this.state.hasError) document.getElementById("main-content")?.focus({ preventScroll: true });
  });

  render() {
    if (!this.state.hasError) return this.props.children;

    const moduleFailed = getInterfaceErrorKind(this.state.error) === "module";
    return <section className={styles.state} role="alert">
      <span className={styles.code}>Ошибка загрузки</span>
      <h1 ref={this.heading} tabIndex={-1}>Раздел временно недоступен</h1>
      <p>{moduleFailed ? "Не удалось загрузить файлы раздела. Проверьте подключение и обновите страницу." : "Попробуйте открыть раздел ещё раз. Если ошибка повторится, обновите страницу или перейдите на главную."}</p>
      <div className={styles.actions}>
        {!moduleFailed && <button type="button" onClick={this.retry}>Попробовать снова</button>}
        <button type="button" className={moduleFailed ? undefined : styles.secondary} onClick={() => window.location.reload()}>Обновить страницу</button>
        <Link to="/">На главную</Link>
      </div>
      <p className={styles.note}>Сохранённые данные останутся в браузере. Несохранённые изменения в этом разделе могли быть потеряны.</p>
    </section>;
  }
}

export default ErrorBoundary;
