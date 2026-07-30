// App.tsx — React Router SPA entry with layout wrapper

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from '@components/molecules/Navbar';
import { Footer } from '@components/molecules/Footer';
import { HomePage } from '@pages/HomePage';
import { PlayPage } from '@pages/PlayPage';
import { AnalysisPage } from '@pages/AnalysisPage';
import { StatsPage } from '@pages/StatsPage';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col w-full">
      <Navbar />
      <main className="flex-1 flex flex-col w-full relative z-[1]">
        {children}
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<Layout><HomePage /></Layout>} />
        <Route path="/play"     element={<Layout><PlayPage /></Layout>} />
        <Route path="/analysis" element={<Layout><AnalysisPage /></Layout>} />
        <Route path="/stats"    element={<Layout><StatsPage /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}
