'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, X } from 'lucide-react';
import hero from '@/public/brand/renewable-hero.png';

export default function Landing({ startWithLogin = false }: { startWithLogin?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { if (startWithLogin && !dialog.current?.open) dialog.current?.showModal(); }, [startWithLogin]);
  // With cacheComponents, Next.js keeps this page mounted but hidden (React <Activity>) after navigating to the
  // workspace. A modal dialog left open there keeps the whole document inert, so the workspace ignores the mouse
  // until a full reload. Close it, and release the busy state, whenever this page is hidden or unmounted.
  useEffect(() => {
    const element = dialog.current;
    return () => { if (element?.open) element.close(); setBusy(false); };
  }, []);
  function openLogin() { setError(''); dialog.current?.showModal(); }
  function closeLogin() { dialog.current?.close(); }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fields.get('username'), password: fields.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Нэвтрэх хүсэлт амжилтгүй.');
      router.replace('/workspace');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Холболт тасарлаа. Дахин оролдоно уу.');
      setBusy(false);
    } finally { if (password.current) password.current.value = ''; }
  }
  return <main className="landing">
    <Image className="landing-image" src={hero} alt="Монгол орны хээр тал дахь нар, салхины эрчим хүчний паркийн концепц дүрслэл" fill sizes="100vw" preload placeholder="blur" />
    <div className="landing-shade" />
    <header className="landing-header">
      <Link className="landing-brand" href="/" aria-label="ДСЦТС · Нүүр хуудас">
        <Image src="/brand/dsedn-logo.png" alt="" width={72} height={72} />
        <span><strong>ДСЦТС ХК</strong><small>ДАРХАН СЭЛЭНГИЙН ЦАХИЛГААН<br />ТҮГЭЭХ СҮЛЖЭЭ</small></span>
      </Link>
      <button ref={opener} className="landing-enter" onClick={openLogin}>Нэвтрэх <ArrowRight size={18} aria-hidden="true" /></button>
    </header>
    <section className="landing-content" aria-labelledby="landing-title">
      <div className="landing-eyebrow"><span />ДАРХАН · СЭЛЭНГЭ</div>
      <h1 id="landing-title">СЭРГЭЭГДЭХ<br />ЭРЧИМ ХҮЧ</h1>
      <p className="landing-subtitle">БАЙРШЛЫН ҮНЭЛГЭЭ, ТӨЛӨВЛӨЛТИЙН ПЛАТФОРМ</p>    </section>
    <footer className="landing-footer">
      <span>Дархан Сэлэнгийн Цахилгаан Түгээх Сүлжээ ХК</span>
      <span className="landing-footer-caption">НАР · САЛХИ · ЦАХИЛГААН СҮЛЖЭЭ<small>Концепц дүрслэл</small></span>
    </footer>
    <dialog ref={dialog} className="login-dialog" aria-labelledby="login-title" onClose={() => { if (password.current) password.current.value = ''; setShowPassword(false); opener.current?.focus(); }} onClick={event => { if (event.target === dialog.current && !busy) closeLogin(); }} onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="login-card">
        <button className="login-close" type="button" aria-label="Нэвтрэх цонх хаах" disabled={busy} onClick={closeLogin}><X size={20} /></button>        <span className="login-eyebrow">ДСЦТС · GIS ПЛАТФОРМ</span>
        <h2 id="login-title">Тавтай морил</h2>        <form onSubmit={login} aria-busy={busy}>
          <label htmlFor="login-username">Хэрэглэгчийн нэр</label>
          <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Хэрэглэгчийн нэрээ оруулна уу" required maxLength={128} disabled={busy} autoFocus />
          <label htmlFor="login-password">Нууц үг</label>
          <div className="login-password-field">
            <input ref={password} id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Нууц үгээ оруулна уу" required maxLength={1024} disabled={busy} />
            <button type="button" aria-label={showPassword ? 'Нууц үг нуух' : 'Нууц үг харуулах'} aria-pressed={showPassword} aria-controls="login-password" onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={18} className="spin" />Нэвтэрч байна…</> : <>Нэвтрэх<ArrowRight size={18} /></>}</button>
        </form>      </div>
    </dialog>
  </main>;
}
