import { Outlet } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { MobileNav } from '../components/common/MobileNav';

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
