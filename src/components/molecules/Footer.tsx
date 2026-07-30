// components/molecules/Footer.tsx
// Atom-level footer component

export function Footer() {
  return (
    <footer className="w-full bg-[#07090f] border-t border-[#232c45] px-8 py-5 mt-auto z-10">
      <div className="max-w-[1150px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-[13px] text-[#64748b]">
        <span>iChess Platform</span>
        <span>&copy; 2026 iChess. All rights reserved.</span>
      </div>
    </footer>
  );
}
