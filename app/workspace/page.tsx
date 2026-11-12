import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import Workspace from '@/components/site-workspace';
import { currentSession } from '@/lib/server/auth';

async function AuthenticatedWorkspace() {
  // Session validity depends on the current time, so this must render per request, never during prerender.
  await connection();
  const session = await currentSession();
  if (!session) redirect('/login');
  return <Workspace user={{ username: session.username, expiresAt: session.expiresAt }} />;
}

export default function WorkspacePage() {
  return <Suspense fallback={<div className="auth-loading" role="status">Нэвтрэх эрхийг шалгаж байна…</div>}>
    <AuthenticatedWorkspace />
  </Suspense>;
}
