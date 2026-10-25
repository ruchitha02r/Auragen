import React, { useState, useEffect } from "react";
import * as Babel from "@babel/standalone";
import LLMFallbackBoundary from "../LLMFallbackBoundary";

const API = "http://localhost:8000/generate";

// The backend reads the score as 0-100. The telemetry server's raw score uses a different
// scale (overload threshold 7.0) and changes on every event, so we send two fixed values.
// Fixed values also keep the backend cache key stable: only two entries exist.
const SCORE_NORMAL = 20;
const SCORE_OVERLOADED = 85;

// Demo only: generated code uses Tailwind classes, so load the Tailwind CDN.
function useTailwindCdn() {
  useEffect(() => {
    if (document.getElementById("tw-cdn")) return;
    const s = document.createElement("script");
    s.id = "tw-cdn";
    s.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(s);
  }, []);
}

function compileTsx(tsx) {
  const { code } = Babel.transform(tsx, {
    filename: "Generated.tsx",
    presets: ["typescript", ["react", { runtime: "classic" }]],
    plugins: ["transform-modules-commonjs"],
  });
  const module = { exports: {} };
  const requireShim = (name) => {
    if (name === "react") return React;
    throw new Error(`Import not allowed: ${name}`);
  };
  new Function("React", "require", "module", "exports", code)(
    React, requireShim, module, module.exports
  );
  if (typeof module.exports.default !== "function") {
    throw new Error("Generated code has no default component export");
  }
  return module.exports.default;
}

export default function GeneratedPanel({ isOverloaded, fieldName = "email", originalFieldType = "text" }) {
  useTailwindCdn();
  const [status, setStatus] = useState("idle");
  const [Comp, setComp] = useState(null);
  const [genId, setGenId] = useState(0);
  const [error, setError] = useState(null);
  const [times, setTimes] = useState({});
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    if (Comp && times.compiled && !times.rendered) {
      requestAnimationFrame(() =>
        setTimes((t) => ({ ...t, rendered: performance.now() - t.t0 }))
      );
    }
  }, [Comp]);

  async function generate() {
    const t0 = performance.now();
    let t = { t0 };
    setStatus("generating");
    setError(null);
    setComp(null);
    setSubmitted(null);
    setTimes({ t0 });
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cognitive_load_score: isOverloaded ? SCORE_OVERLOADED : SCORE_NORMAL,
          field_name: fieldName,
          signal_summary: isOverloaded
            ? `high cognitive load on ${fieldName}, long hesitation`
            : `normal activity on ${fieldName}`,
          original_field_type: originalFieldType,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let final = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const ev = JSON.parse(part.slice(6));
          if (ev.type === "chunk" && t.firstChunk === undefined) {
            t.firstChunk = performance.now() - t0;
          } else if (ev.type === "final") {
            final = ev;
          }
        }
      }
      if (!final) throw new Error("Stream ended without a final event");
      t.final = performance.now() - t0;
      if (final.status !== "valid") {
        throw new Error(`${final.reason}: ${final.message}`);
      }
      const C = compileTsx(final.tsx);
      t.compiled = performance.now() - t0;
      setTimes({ ...t });
      setGenId((n) => n + 1);
      setComp(() => C);
      setStatus("done");
    } catch (e) {
      setError(String(e.message || e));
      setTimes({ ...t });
      setStatus("error");
    }
  }

  const f = (v) => (v === undefined ? "-" : `${(v / 1000).toFixed(2)}s`);

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={generate} disabled={status === "generating"}>
        {status === "generating" ? "Generating..." : "Generate redesign"}
      </button>
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      <p style={{ fontSize: 12 }}>
        first chunk {f(times.firstChunk)} | validated final {f(times.final)} |
        compiled {f(times.compiled)} | rendered {f(times.rendered)}
      </p>
      {Comp && (
        <LLMFallbackBoundary key={genId}>
          <Comp initialValues={{}} onNext={setSubmitted} onBack={() => {}} />
        </LLMFallbackBoundary>
      )}
      {submitted && <p>onNext received: {String(submitted)}</p>}
    </div>
  );
}