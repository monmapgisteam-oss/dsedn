import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Workspace from '@/components/site-workspace';
import { currentSession } from '@/lib/server/auth';

async function AuthenticatedWorkspace() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return <Workspace user={{ username: session.username, expiresAt: session.expiresAt }} />;
}

export default function WorkspacePage() {
  return <Suspense fallback={<div className="auth-loading" role="status">Нэвтрэх эрхийг шалгаж байна…</div>}>
    <AuthenticatedWorkspace />
  </Suspense>;
}
