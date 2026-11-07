import { Navigate, Route, Routes } from 'react-router-dom';
import { CreditCard, FileText, Home, Layers, LayoutDashboard, MoreHorizontal, Ruler, Settings as Cog, ShoppingBag, Store, Users, Wallet, CalendarDays } from 'lucide-react';
import { useAuth } from './lib/auth';
import { accessOf } from './lib/types';
import { Loading } from './components/ui';
import { Shell, type NavItem } from './layouts/Shell';
import Notifications from './pages/Notifications';
import { Invitation, Login, Pending, Signup, Suspended } from './pages/auth/AuthPages';
import TailorHome, { SubscriptionBanner } from './pages/tailor/Home';
import { ClientDetail, ClientMeasures as TailorMeasures, ClientNew, ClientsList } from './pages/tailor/Clients';
import { OrderDetail, OrderNew, OrdersList, QuoteNew } from './pages/tailor/Orders';
import { Agenda, More, Reports, Staff, Subscription, WorkshopProfile } from './pages/tailor/More';
import { ClientHome, ClientMeasures, ClientOrder, ClientOrders, ClientPayments, ClientQuote, ClientQuotes } from './pages/client/ClientPages';
import { AdminHome, AdminLogs, AdminPayment, AdminPayments, AdminPlans, AdminSettings, AdminWorkshop, AdminWorkshops } from './pages/admin/AdminPages';

const tailorNav: NavItem[] = [
  { to: '/accueil', label: 'Accueil', icon: Home },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/commandes', label: 'Commandes', icon: ShoppingBag },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/plus', label: 'Plus', icon: MoreHorizontal }
];
const clientNav: NavItem[] = [
  { to: '/espace', label: 'Accueil', icon: Home, end: true },
  { to: '/espace/devis', label: 'Devis', icon: FileText },
  { to: '/espace/commandes', label: 'Commandes', icon: ShoppingBag },
  { to: '/espace/mesures', label: 'Mesures', icon: Ruler },
  { to: '/espace/paiements', label: 'Paiements', icon: Wallet }
];
const adminNav: NavItem[] = [
  { to: '/admin', label: 'Tableau', icon: LayoutDashboard, end: true },
  { to: '/admin/paiements', label: 'Paiements', icon: CreditCard },
  { to: '/admin/ateliers', label: 'Ateliers', icon: Store },
  { to: '/admin/forfaits', label: 'Forfaits', icon: Layers },
  { to: '/admin/reglages', label: 'Réglages', icon: Cog }
];


function Home0() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/connexion" replace />;
  switch (profile?.role) {
    case 'superadmin': return <Navigate to="/admin" replace />;
    case 'tailor_owner': case 'tailor_staff': return <Navigate to="/accueil" replace />;
    case 'client': return <Navigate to="/espace" replace />;
    default: return <Navigate to="/en-attente" replace />;
  }
}

function TailorArea() {
  const { session, profile, workshop, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/connexion" replace />;
  if (profile?.role !== 'tailor_owner' && profile?.role !== 'tailor_staff') return <Navigate to="/" replace />;
  if (!workshop) return <Loading />;
  if (accessOf(workshop) === 'suspended') return <Suspended />;
  const expired = accessOf(workshop) === 'expired';
  return <Shell items={tailorNav} notifPath="/notifications" subtitle={workshop.name}
    banner={expired ? <div className="px-4 pt-3 md:px-8"><SubscriptionBanner /></div> : undefined} />;
}
function ClientArea() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/connexion" replace />;
  if (profile?.role !== 'client') return <Navigate to="/" replace />;
  return <Shell items={clientNav} notifPath="/espace/notifications" subtitle="Mon espace client" />;
}
function AdminArea() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/connexion" replace />;
  if (profile?.role !== 'superadmin') return <Navigate to="/" replace />;
  return <Shell items={adminNav} notifPath="/admin/notifications" subtitle="Superadministration" />;
}
function PublicOnly({ children }: { children: JSX.Element }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (session && profile && profile.role !== 'pending') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home0 />} />
      <Route path="/connexion" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/inscription" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/invitation/:token" element={<Invitation />} />
      <Route path="/en-attente" element={<Pending />} />

      <Route element={<TailorArea />}>
        <Route path="/accueil" element={<TailorHome />} />
        <Route path="/clients" element={<ClientsList />} />
        <Route path="/clients/nouveau" element={<ClientNew />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/clients/:id/mesures" element={<TailorMeasures />} />
        <Route path="/commandes" element={<OrdersList />} />
        <Route path="/commandes/nouvelle" element={<OrderNew />} />
        <Route path="/commandes/:id" element={<OrderDetail />} />
        <Route path="/devis/nouveau" element={<QuoteNew />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/plus" element={<More />} />
        <Route path="/plus/abonnement" element={<Subscription />} />
        <Route path="/plus/rapports" element={<Reports />} />
        <Route path="/plus/employes" element={<Staff />} />
        <Route path="/plus/atelier" element={<WorkshopProfile />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route element={<ClientArea />}>
        <Route path="/espace" element={<ClientHome />} />
        <Route path="/espace/devis" element={<ClientQuotes />} />
        <Route path="/espace/devis/:id" element={<ClientQuote />} />
        <Route path="/espace/commandes" element={<ClientOrders />} />
        <Route path="/espace/commandes/:id" element={<ClientOrder />} />
        <Route path="/espace/mesures" element={<ClientMeasures />} />
        <Route path="/espace/paiements" element={<ClientPayments />} />
        <Route path="/espace/notifications" element={<Notifications />} />
      </Route>

      <Route element={<AdminArea />}>
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/paiements" element={<AdminPayments />} />
        <Route path="/admin/paiements/:id" element={<AdminPayment />} />
        <Route path="/admin/ateliers" element={<AdminWorkshops />} />
        <Route path="/admin/ateliers/:id" element={<AdminWorkshop />} />
        <Route path="/admin/forfaits" element={<AdminPlans />} />
        <Route path="/admin/reglages" element={<AdminSettings />} />
        <Route path="/admin/journal" element={<AdminLogs />} />
        <Route path="/admin/notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

