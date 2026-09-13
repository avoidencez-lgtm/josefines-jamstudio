import { Component, Fragment, type ReactNode } from "react";
import { useWriting } from "../lib/originals";
import { Button } from "./Button";

type Props = { children: ReactNode };
type State = { error: Error | null; nonce: number };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, nonce: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, "error"> {
    return { error };
  }

  private copySong = () => {
    const song = useWriting.getState().song;
    void navigator.clipboard.writeText(
      song ? JSON.stringify(song) : "No unsaved song.",
    );
  };

  private retry = () =>
    this.setState((s) => ({ error: null, nonce: s.nonce + 1 }));

  render() {
    if (this.state.error) {
      return (
        <section role="alert">
          <p className="workspace-note">
            This room could not render. Copy the unsaved song JSON, then Retry.
          </p>
          <div className="flex gap-3 mt-4">
            <Button type="button" onClick={this.copySong}>
              Copy this unsaved song JSON
            </Button>
            <Button type="button" variant="primary" onClick={this.retry}>
              Retry
            </Button>
          </div>
        </section>
      );
    }
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>;
  }
}
