"use client";
import { useState } from "react";
import { Button, NumberTickDemo } from "./demo-parts";

export function InteractiveDemos() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
      <Button
        loading={loading}
        onClick={() => {
          setLoading(true);
          setTimeout(() => setLoading(false), 1200);
        }}
      >
        {loading ? "Working" : "Click for loading"}
      </Button>
      <NumberTickDemo />
    </div>
  );
}
