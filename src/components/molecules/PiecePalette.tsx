// components/molecules/PiecePalette.tsx
// Molecule: Spare Piece Selector & Board Setup Toolbar

export interface SelectedPieceTool {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'erase' | null;
  color: 'w' | 'b';
}

interface PiecePaletteProps {
  selectedTool: SelectedPieceTool;
  onSelectTool: (tool: SelectedPieceTool) => void;
  onClearBoard: () => void;
  onResetBoard: () => void;
}

const WHITE_PIECES = [
  { type: 'k', symbol: '♔', label: 'Raja Putih' },
  { type: 'q', symbol: '♕', label: 'Menteri Putih' },
  { type: 'r', symbol: '♖', label: 'Benteng Putih' },
  { type: 'b', symbol: '♗', label: 'Gajah Putih' },
  { type: 'n', symbol: '♘', label: 'Kuda Putih' },
  { type: 'p', symbol: '♙', label: 'Pion Putih' },
] as const;

const BLACK_PIECES = [
  { type: 'k', symbol: '♚', label: 'Raja Hitam' },
  { type: 'q', symbol: '♛', label: 'Menteri Hitam' },
  { type: 'r', symbol: '♜', label: 'Benteng Hitam' },
  { type: 'b', symbol: '♝', label: 'Gajah Hitam' },
  { type: 'n', symbol: '♞', label: 'Kuda Hitam' },
  { type: 'p', symbol: '♟', label: 'Pion Hitam' },
] as const;

export function PiecePalette({
  selectedTool,
  onSelectTool,
  onClearBoard,
  onResetBoard,
}: PiecePaletteProps) {
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="text-[12px] font-bold text-[#00adb5] uppercase tracking-wider">
        🛠️ Palette Bidak &amp; Edit Board Setup
      </div>
      <p className="text-[12px] text-[#94a3b8] m-0">
        Pilih bidak di bawah, lalu klik petak papan untuk menambah / menghapus bidak secara bebas.
      </p>

      {/* White pieces */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-[#64748b] w-12">Putih:</span>
        {WHITE_PIECES.map(({ type, symbol, label }) => {
          const isSelected = selectedTool.color === 'w' && selectedTool.type === type;
          return (
            <button
              key={`w-${type}`}
              type="button"
              title={label}
              onClick={() => onSelectTool({ type: isSelected ? null : (type as any), color: 'w' })}
              className={`
                w-9 h-9 rounded-lg text-xl flex items-center justify-center cursor-pointer transition-all border
                ${isSelected
                  ? 'bg-[rgba(0,173,181,0.25)] border-[#00adb5] text-white shadow-[0_0_12px_rgba(0,173,181,0.3)] scale-105'
                  : 'bg-[#1a2033] border-[#232c45] text-white hover:border-[#00adb5]'
                }
              `}
            >
              {symbol}
            </button>
          );
        })}
      </div>

      {/* Black pieces */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-[#64748b] w-12">Hitam:</span>
        {BLACK_PIECES.map(({ type, symbol, label }) => {
          const isSelected = selectedTool.color === 'b' && selectedTool.type === type;
          return (
            <button
              key={`b-${type}`}
              type="button"
              title={label}
              onClick={() => onSelectTool({ type: isSelected ? null : (type as any), color: 'b' })}
              className={`
                w-9 h-9 rounded-lg text-xl flex items-center justify-center cursor-pointer transition-all border
                ${isSelected
                  ? 'bg-[rgba(0,173,181,0.25)] border-[#00adb5] text-white shadow-[0_0_12px_rgba(0,173,181,0.3)] scale-105'
                  : 'bg-[#1a2033] border-[#232c45] text-white hover:border-[#00adb5]'
                }
              `}
            >
              {symbol}
            </button>
          );
        })}
      </div>

      {/* Eraser & Tools */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#232c45]">
        <button
          type="button"
          onClick={() => onSelectTool({ type: selectedTool.type === 'erase' ? null : 'erase', color: 'w' })}
          className={`
            flex-1 py-1.5 px-3 rounded-lg text-[12px] font-bold border cursor-pointer transition-all flex items-center justify-center gap-1.5
            ${selectedTool.type === 'erase'
              ? 'bg-[rgba(239,68,68,0.2)] border-[#ef4444] text-[#ef4444]'
              : 'bg-[#1a2033] border-[#232c45] text-[#94a3b8] hover:text-white'
            }
          `}
        >
          🗑️ Eraser (Hapus Petak)
        </button>

        <button
          type="button"
          onClick={onClearBoard}
          className="py-1.5 px-3 rounded-lg text-[12px] font-semibold bg-[#1a2033] border border-[#232c45] text-[#94a3b8] hover:text-white hover:border-[#ef4444] transition-all cursor-pointer"
        >
          🧹 Kosongkan Papan
        </button>

        <button
          type="button"
          onClick={onResetBoard}
          className="py-1.5 px-3 rounded-lg text-[12px] font-semibold bg-[#1a2033] border border-[#232c45] text-[#94a3b8] hover:text-white hover:border-[#00adb5] transition-all cursor-pointer"
        >
          🔄 Posisi Awal
        </button>
      </div>
    </div>
  );
}
