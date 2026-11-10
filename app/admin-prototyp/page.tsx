import AdminPrototype from '../../src/admin-prototype/AdminPrototype';
import '../../src/admin-prototype/admin-prototype.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Lokal prototyp' };

export default function AdminPrototypePage() {
  return <AdminPrototype />;
}
