// components/organisms/ChessBoard.tsx
// Wraps react-chessboard v5 with squareRenderer badge overlay support (Chess.com Game Review style)

import { Chessboard } from 'react-chessboard';
import { useRef } from 'react';

export interface SquareBadge {
  square: string;
  symbol: string;
  color: string;
}

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  onPieceDrop: (source: string, target: string, piece?: string) => boolean;
  onSquareClick?: (square: string) => void;
  squareBadge?: SquareBadge | null;
  boardWidth?: number;
  interactive?: boolean;
  /** Set to false to disable drag entirely (e.g. when palette tool is active) */
  allowDragging?: boolean;
}

export function ChessBoard({
  fen,
  orientation = 'white',
  onPieceDrop,
  onSquareClick,
  squareBadge,
  boardWidth,
  interactive = true,
  allowDragging = true,
}: ChessBoardProps) {
  const outerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={outerRef}
      className="rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,173,181,0.15)]"
      style={{ width: boardWidth !== undefined ? boardWidth : '100%' }}
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          onPieceDrop: interactive && allowDragging
            ? ({ sourceSquare, targetSquare, piece }) => {
                if (!targetSquare) return false;
                return onPieceDrop(sourceSquare, targetSquare, piece?.pieceType);
              }
            : undefined,
          onSquareClick: onSquareClick ? ({ square }) => onSquareClick(square) : undefined,
          allowDragging: interactive && allowDragging,
          squareRenderer: squareBadge
            ? ({ square, children }) => {
                const isTarget = square === squareBadge.square;
                return (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {children}
                    {isTarget && (
                      <div
                        className="
                          absolute -top-1 -right-1 w-6 h-6 rounded-full
                          flex items-center justify-center text-[12px] font-black
                          shadow-[0_2px_8px_rgba(0,0,0,0.6)] z-20 pointer-events-none
                          border-2 border-white/40 animate-[fadeIn_0.2s_ease-out]
                        "
                        style={{ background: squareBadge.color, color: '#ffffff' }}
                      >
                        {squareBadge.symbol}
                      </div>
                    )}
                  </div>
                );
              }
            : undefined,
          boardStyle: {
            borderRadius: '10px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          },
          darkSquareStyle: { backgroundColor: '#2d4a6e' },
          lightSquareStyle: { backgroundColor: '#8ab4d4' },
        }}
      />
    </div>
  );
}
