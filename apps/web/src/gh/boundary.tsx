"use client";

import { Button } from "@great-hall-pr/ui/components/button";
import { Component, type ReactNode } from "react";

/** If one screen hits bad data, show a small message instead of blanking the whole app. */
export class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Screen error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-xl border bg-card p-5 text-center">
        <p className="font-semibold">This screen couldn&apos;t load.</p>
        <p className="text-sm text-muted-foreground">Other tabs still work. Try again, or call the Team Leader if it keeps happening.</p>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
