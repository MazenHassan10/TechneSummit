"use client";

/** Last-resort screen if the whole app fails to load. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <div>
        <p style={{ fontWeight: 600, fontSize: 18 }}>Something went wrong.</p>
        <p style={{ color: "#667", margin: "8px 0 16px" }}>Your data is safe on the server.</p>
        <button type="button" onClick={() => { reset(); location.reload(); }} style={{ background: "#105ca8", color: "#fff", border: 0, borderRadius: 10, padding: "12px 20px", fontSize: 16 }}>Reload</button>
      </div>
    </div>
  );
}
