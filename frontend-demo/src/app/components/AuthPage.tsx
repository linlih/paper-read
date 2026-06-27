import { useState } from 'react';
import { BookOpen, Mail, Lock, User, ArrowRight, AlertCircle, Languages } from 'lucide-react';
import type { User as UserType } from './types';
import type { T, Lang } from './i18n';

interface AuthPageProps {
  users: UserType[];
  onLogin: (user: UserType) => void;
  onRegister: (name: string, email: string, password: string) => void;
  t: T;
  lang: Lang;
  onToggleLang: () => void;
}

export function AuthPage({ users, onLogin, onRegister, t, lang, onToggleLang }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'login') {
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) { setError(t.invalidCredentials); return; }
      onLogin(user);
    } else {
      if (!name.trim()) { setError(t.nameRequired); return; }
      if (password.length < 6) { setError(t.passwordTooShort); return; }
      if (users.find(u => u.email === email)) { setError(t.emailInUse); return; }
      onRegister(name, email, password);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ fontFamily: 'var(--ui-font)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#1E1C1A] text-[#F7F3EE] p-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen size={28} className="text-[#C9580A]" />
            <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em' }}>{t.appName}</span>
          </div>
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7F3EE]/10 hover:bg-[#F7F3EE]/20 text-[#F7F3EE]/70 hover:text-[#F7F3EE] transition-colors text-sm"
          >
            <Languages size={14} />
            {t.language}
          </button>
        </div>
        <div>
          <p className="text-[#F7F3EE]/40 mb-8" style={{ fontFamily: 'var(--mono-font)', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Academic Reading Platform
          </p>
          <h1 className="text-[#F7F3EE] mb-6" style={{ fontFamily: 'var(--paper-font)', fontSize: '2.25rem', fontWeight: 300, lineHeight: 1.35 }}>
            {t.appSlogan}
          </h1>
          <p className="text-[#F7F3EE]/60" style={{ fontSize: '1rem', lineHeight: 1.75 }}>
            {t.appDesc}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { label: t.demoLogin, email: 'alice@example.com', pwd: 'password123' },
            { label: t.adminLogin, email: 'admin@paperread.io', pwd: 'admin123' },
          ].map(hint => (
            <button
              key={hint.email}
              onClick={() => { setEmail(hint.email); setPassword(hint.pwd); setMode('login'); }}
              className="text-left p-3 rounded-lg border border-[#F7F3EE]/10 hover:border-[#C9580A]/50 hover:bg-[#F7F3EE]/5 transition-all"
            >
              <div className="text-[#F7F3EE]/50 text-xs mb-1" style={{ fontFamily: 'var(--mono-font)' }}>{hint.label}</div>
              <div className="text-[#F7F3EE]/80 text-sm">{hint.email}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#F7F3EE]">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-10 lg:hidden">
            <div className="flex items-center gap-2">
              <BookOpen size={22} className="text-[#C9580A]" />
              <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{t.appName}</span>
            </div>
            <button onClick={onToggleLang} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EDE8E0] text-[#7A7165] text-sm hover:bg-[#d9d3c9] transition-colors">
              <Languages size={14} />
              {t.language}
            </button>
          </div>

          <h2 className="text-[#1E1C1A] mb-2" style={{ fontFamily: 'var(--paper-font)', fontSize: '1.75rem', fontWeight: 400 }}>
            {mode === 'login' ? t.welcomeBack : t.createAccount}
          </h2>
          <p className="text-[#7A7165] mb-8 text-sm">
            {mode === 'login' ? t.signInContinue : t.startReading}
          </p>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7165]" />
                <input
                  type="text"
                  placeholder={t.fullName}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] transition-colors"
                  style={{ fontSize: '0.9375rem' }}
                />
              </div>
            )}
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7165]" />
              <input
                type="email"
                placeholder={t.email}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] transition-colors"
                style={{ fontSize: '0.9375rem' }}
                required
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7165]" />
              <input
                type="password"
                placeholder={t.password}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] transition-colors"
                style={{ fontSize: '0.9375rem' }}
                required
              />
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors mt-2"
              style={{ fontSize: '0.9375rem', fontWeight: 500 }}
            >
              {mode === 'login' ? t.signIn : t.register}
              <ArrowRight size={16} />
            </button>
          </form>

          <p className="text-center mt-6 text-[#7A7165] text-sm">
            {mode === 'login' ? t.noAccount : t.hasAccount}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-[#3B3094] hover:underline font-medium"
            >
              {mode === 'login' ? t.register : t.signIn}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
