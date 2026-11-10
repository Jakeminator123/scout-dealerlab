'use client';
import { useEffect } from 'react';

export default function LocalSession() {
  useEffect(() => {
    let channel: EventSource | undefined;
    const connect = () => { if (!channel) channel = new EventSource('/api/session'); };
    const disconnect = () => { channel?.close(); channel = undefined; };
    connect();
    window.addEventListener('pagehide', disconnect);
    window.addEventListener('pageshow', connect);
    return () => {
      disconnect();
      window.removeEventListener('pagehide', disconnect);
      window.removeEventListener('pageshow', connect);
    };
  }, []);
  return null;
}
