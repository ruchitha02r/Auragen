import React, { useState, useEffect, useRef } from 'react';
import AuraContainer from "./AuraGenContainer";
import LLMFallbackBoundary from "./LLMFallbackBoundary";
import GeneratedPanel from "./src/GeneratedPanel";

const WS_URL = 'ws://localhost:8080';

export default function AuraGenApp() {
  const [telemetry, setTelemetry] = useState({
    score: 0,
    isOverloaded: false,
    status: 'Connecting...',
  });
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCount = useRef(0);
  const unmountedRef = useRef(false);

  const sendEvent = (event) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

  const connectWebSocket = () => {
    if (unmountedRef.current) return;
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected to telemetry server');
      setTelemetry((prev) => ({ ...prev, status: 'Connected' }));
      retryCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const incoming =
          data.cognitiveLoadScore !== undefined ? data.cognitiveLoadScore : data.score;
        if (incoming !== undefined) {
          setTelemetry((prev) => ({
            ...prev,
            score: incoming,
            isOverloaded: Boolean(data.isOverloaded),
          }));
        }
      } catch (err) {
        console.error('Error parsing telemetry packet:', err);
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setTelemetry((prev) => ({ ...prev, status: 'Disconnected (Retrying...)' }));
      const delay = Math.min(1000 * Math.pow(2, retryCount.current), 10000);
      retryCount.current += 1;
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      ws.close();
    };
  };

  useEffect(() => {
    unmountedRef.current = false;
    connectWebSocket();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  // Real signal: each Backspace press is sent as a telemetry event (type only, never the text).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Backspace') sendEvent({ type: 'backspace' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h2>AuraGen Live Telemetry Dashboard</h2>
      <p>
        Status: <strong>{telemetry.status}</strong> | Live Score: <strong>{telemetry.score}</strong>
      </p>

      {/* Demo controls: remove once the real Friction Engine sends events */}
      <p style={{ fontSize: 12 }}>
        Demo controls:{' '}
        <button onClick={() => sendEvent({ type: 'hesitation', durationMs: 4000 })}>
          Simulate hesitation (4s)
        </button>{' '}
        <button onClick={() => sendEvent({ type: 'reset_session' })}>Reset session</button>
      </p>

      <LLMFallbackBoundary>
        <AuraContainer score={telemetry.score}>
          <h3>Current Workspace State</h3>
          <p>
            Cognitive Threshold Level:{' '}
            <strong>{telemetry.isOverloaded ? 'High Load (Focused Mode)' : 'Normal Operations'}</strong>
          </p>
          <GeneratedPanel 
            isOverloaded={telemetry.isOverloaded} 
            fieldName="email" 
            originalFieldType="text" 
          />
        </AuraContainer>
      </LLMFallbackBoundary>
    </div>
  );
}