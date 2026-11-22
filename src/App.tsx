import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CreditCard, FileText, Home, Layers, LayoutDashboard, LayoutGrid, Ruler, Settings as Cog, ShoppingBag, Store, Users, Wallet, CalendarDays } from 'lucide-react';
import { useAuth } from './lib/auth';
import { accessOf } from './lib/types';
import { Loading } from './components/ui';
import { Shell, type NavItem } from './layouts/Shell';
import { lazy, Suspense, type ComponentType } from 'react';
import { Invitation, Login, Pending, Signup, Suspended } from './pages/auth/AuthPages';
import TailorHome, { SubscriptionBanner } from './pages/tailor/Home';
import { ClientDetail, ClientMeasures as TailorMeasures, ClientNew, ClientsList } from './pages/tailor/Clients';
import { OrderDetail, OrderNew, OrdersList, QuoteDetail, QuoteNew } from './pages/tailor/Orders';
import { Agenda, More, Reports, Staff, Subscription, WorkshopProfile } from './pages/tailor/More';
import Notifications from './pages/Notifications';

// Les espaces Client et Superadmin ne sont téléchargés que par ceux qui les utilisent :
// l'appli du tailleur démarre plus vite sur téléphone.
function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType })));
}
const clientPages = () => import('./pages/client/ClientPages');
const adminPages = () => import('./pages/admin/AdminPages');
const ClientHome = lazyNamed(clientPages, 'ClientHome');
const ClientMeasures = lazyNamed(clientPages, 'ClientMeasures');
const ClientOrder = lazyNamed(clientPages, 'ClientOrder');
const ClientOrders = lazyNamed(clientPages, 'ClientOrders');
const ClientPayments = lazyNamed(clientPages, 'ClientPayments');
const ClientQuote = lazyNamed(clientPages, 'ClientQuote');
const ClientQuotes = lazyNamed(clientPages, 'ClientQuotes');
const AdminHome = lazyNamed(adminPages, 'AdminHome');
const AdminLogs = lazyNamed(adminPages, 'AdminLogs');
const AdminPayment = lazyNamed(adminPages, 'AdminPayment');
const AdminPayments = lazyNamed(adminPages, 'AdminPayments');
const AdminPlans = lazyNamed(adminPages, 'AdminPlans');
const AdminSettings = lazyNamed(adminPages, 'AdminSettings');
const AdminWorkshop = lazyNamed(adminPages, 'AdminWorkshop');
const AdminWorkshops = lazyNamed(adminPages, 'AdminWorkshops');

const tailorNav: NavItem[] = [
  { to: '/accueil', label: 'Accueil', icon: Home, tone: 'blue' },
  { to: '/clients', label: 'Clients', icon: Users, tone: 'green' },
  { to: '/commandes', label: 'Commandes', icon: ShoppingBag, tone: 'violet' },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, tone: 'orange' },
  { to: '/plus', label: 'Plus', icon: LayoutGrid, tone: 'slate' }
];
const clientNav: NavItem[] = [
  { to: '/espace', label: 'Accueil', icon: Home, tone: 'blue', end: true },
  { to: '/espace/devis', label: 'Devis', icon: FileText, tone: 'violet' },
  { to: '/espace/commandes', label: 'Commandes', icon: ShoppingBag, tone: 'indigo' },
  { to: '/espace/mesures', label: 'Mesures', icon: Ruler, tone: 'teal' },
  { to: '/espace/paiements', label: 'Paiements', icon: Wallet, tone: 'green' }
];
const adminNav: NavItem[] = [
  { to: '/admin', label: 'Tableau', icon: LayoutDashboard, tone: 'blue', end: true },
  { to: '/admin/paiements', label: 'Paiements', icon: CreditCard, tone: 'green' },
  { to: '/admin/ateliers', label: 'Ateliers', icon: Store, tone: 'violet' },
  { to: '/admin/forfaits', label: 'Forfaits', icon: Layers, tone: 'gold' },
  { to: '/admin/reglages', label: 'Réglages', icon: Cog, tone: 'slate' }
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

/** Plus de comptes que le forfait n'en permet (ex. après l'essai) : on le dit clairement. */
function OverLimitBanner() {
  const { profile } = useAuth();
  const owner = profile?.role === 'tailor_owner';
  return (
    <div className="px-4 pt-3 md:px-8">
      <Link to={owner ? '/plus/employes' : '/accueil'} className="block rounded-2xl bg-amber-100 p-4 text-sm text-amber-900">
        <div className="font-bold">Trop de comptes pour votre forfait</div>
        {owner ? 'Vos employés sont en lecture seule. Retirez des employés ou passez à un forfait supérieur ›' : "Votre accès est en lecture seule : l'atelier a plus de comptes que son forfait ne le permet. Prévenez le propriétaire."}
      </Link>
    </div>
  );
}

function TailorArea() {
  const { session, profile, workshop, overLimit, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/connexion" replace />;
  if (profile?.role !== 'tailor_owner' && profile?.role !== 'tailor_staff') return <Navigate to="/" replace />;
  if (!workshop) return <Loading />;
  if (accessOf(workshop) === 'suspended') return <Suspended />;
  const expired = accessOf(workshop) === 'expired';
  return <Shell items={tailorNav} notifPath="/notifications" subtitle={workshop.name}
    banner={expired ? <div className="px-4 pt-3 md:px-8"><SubscriptionBanner /></div> : overLimit ? <OverLimitBanner /> : undefined} />;
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
    <Suspense fallback={<Loading />}>
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
        <Route path="/devis/:id" element={<QuoteDetail />} />
        <Route path="/devis/:id/modifier" element={<QuoteNew />} />
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
    </Suspense>
  );
}

