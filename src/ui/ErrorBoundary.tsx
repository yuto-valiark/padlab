import { Component, type ReactNode } from 'react';

/** If something in the UI crashes, show a way out instead of a blank screen. Your project is autosaved. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>PADLAB</h1>
        <p>画面でエラーが起きました。作ったものは自動保存されているので、再読み込みで戻れます。</p>
        <pre>{this.state.error.message}</pre>
        <button className="pbtn pbtn--go" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }
}
