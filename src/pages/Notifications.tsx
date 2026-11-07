import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { must, useLoad } from '../lib/auth';
import { dateTimeFr } from '../lib/format';
import type { Notification } from '../lib/types';
import { Button, Empty, List, Loading, Row, TopBar } from '../components/ui';

export default function Notifications() {
  const nav = useNavigate();
  const { data, loading, reload } = useLoad(async () =>
    must(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) as Notification[]);

  const markAll = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    reload();
  };
  const open = async (n: Notification) => {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    if (n.link) nav(n.link); else reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <TopBar title="Notifications" back right={data?.some((n) => !n.read_at) ? <Button size="sm" variant="ghost" onClick={markAll}>Tout marquer lu</Button> : undefined} />
      {loading ? <Loading /> : !data?.length ? <Empty>Aucune notification pour le moment.</Empty> : (
        <List>
          {data.map((n) => (
            <Row key={n.id} onClick={() => open(n)}
              left={<span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${n.read_at ? 'bg-slate-100 text-slate-500' : 'bg-brand-100 text-brand-700'}`}><Bell className="h-5 w-5" /></span>}
              title={<span className={n.read_at ? 'font-medium text-muted' : ''}>{n.title}</span>} subtitle={dateTimeFr(n.created_at)}
              right={!n.read_at ? <span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> : undefined} />
          ))}
        </List>
      )}
    </div>
  );
}
