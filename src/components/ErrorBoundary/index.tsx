import { Component, type ReactNode } from "react";
import styles from "./index.module.scss";

interface Props { children: ReactNode }
interface State { hasError: boolean }

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return <section className={styles.state} role="alert">
      <span className={styles.code}>Ошибка загрузки</span>
      <h1>Раздел временно недоступен</h1>
      <p>Попробуйте перейти в другой раздел или обновить страницу. При обновлении несохранённые изменения могут быть потеряны.</p>
      <button onClick={() => window.location.reload()}>Обновить страницу</button>
    </section>;
  }
}

export default ErrorBoundary;
