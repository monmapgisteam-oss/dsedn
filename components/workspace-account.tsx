'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function WorkspaceAccount({ username, expiresAt }: { username: string; expiresAt: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => { router.replace('/login'); router.refresh(); }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, router]);
  return <form className="workspace-account" action="/api/auth/logout" method="post">
    <span title={username}>{username}</span><button type="submit" title="Гарах" aria-label="Системээс гарах"><LogOut size={16} /></button>
  </form>;
}
