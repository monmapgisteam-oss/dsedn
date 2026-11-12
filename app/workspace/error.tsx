'use client';
import Link from 'next/link';

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="auth-loading"><h1>GIS сервертэй холбогдсонгүй</h1>
    <p>Нэвтрэх эрхийг баталгаажуулж чадсангүй. Түр хүлээгээд дахин оролдоно уу.</p>
    <button className="button primary" onClick={reset}>Дахин оролдох</button><Link href="/login">Нэвтрэх хуудас</Link>
  </main>;
}
