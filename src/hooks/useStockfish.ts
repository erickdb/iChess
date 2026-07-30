// hooks/useStockfish.ts
// Manages Stockfish Web Worker lifecycle — init, postMessage, receive, cleanup.

import { useRef, useCallback, useEffect } from 'react';

export type StockfishMessageHandler = (line: string) => void;

export interface UseStockfishReturn {
  sendCommand: (cmd: string) => void;
  setMessageHandler: (handler: StockfishMessageHandler) => void;
  isReady: boolean;
}

export function useStockfish(): UseStockfishReturn {
  const workerRef         = useRef<Worker | null>(null);
  const handlerRef        = useRef<StockfishMessageHandler | null>(null);
  const isReadyRef        = useRef(false);

  useEffect(() => {
    const worker = new Worker('/engine/stockfish.js');

    worker.onmessage = (e: MessageEvent<string | { toString(): string }>) => {
      const line = typeof e.data === 'string' ? e.data : e.data.toString();
      if (line === 'readyok') isReadyRef.current = true;
      if (handlerRef.current) handlerRef.current(line);
    };

    worker.postMessage('uci');
    worker.postMessage('setoption name Hash value 32');
    worker.postMessage('setoption name MultiPV value 2');
    worker.postMessage('isready');

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const sendCommand = useCallback((cmd: string) => {
    workerRef.current?.postMessage(cmd);
  }, []);

  const setMessageHandler = useCallback((handler: StockfishMessageHandler) => {
    handlerRef.current = handler;
  }, []);

  return { sendCommand, setMessageHandler, isReady: isReadyRef.current };
}
