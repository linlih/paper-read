import { useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, ShieldCheck, Globe2, Bot, Languages } from 'lucide-react';
import type { AppSettings, UiLangPref, AIProvider } from './types';
import type { T, Lang } from './i18n';

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
  t: T;
  lang: Lang;
}

const AI_PROVIDERS: { id: AIProvider; label: string; keyPrefix: string; docsUrl: string }[] = [
  { id: 'deepseek',  label: 'DeepSeek',  keyPrefix: 'sk-',      docsUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'openai',    label: 'OpenAI',    keyPrefix: 'sk-',      docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', keyPrefix: 'sk-ant-',  docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'grok',      label: 'Grok',      keyPrefix: 'xai-',     docsUrl: 'https://console.x.ai/' },
];

const LANG_OPTIONS: { id: UiLangPref; labelZh: string; labelEn: string }[] = [
  { id: 'system', labelZh: '跟随系统', labelEn: 'Follow System' },
  { id: 'zh',     labelZh: '中文',     labelEn: 'Chinese' },
  { id: 'en',     labelZh: 'English',  labelEn: 'English' },
];

export function SettingsPage({ settings, onSave, onBack, t, lang }: SettingsPageProps) {
  const [uiLang, setUiLang] = useState<UiLangPref>(settings.uiLang);
  const [aiProvider, setAiProvider] = useState<AIProvider>(settings.aiProvider);
  const [apiKeys, setApiKeys] = useState<Partial<Record<AIProvider, string>>>(settings.apiKeys);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  function handleSaveKey() {
    onSave({ ...settings, uiLang, aiProvider, apiKeys });
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  function handleLangChange(val: UiLangPref) {
    setUiLang(val);
    onSave({ ...settings, uiLang: val, aiProvider, apiKeys });
  }

  function handleProviderChange(val: AIProvider) {
    setAiProvider(val);
    onSave({ ...settings, uiLang, aiProvider: val, apiKeys });
  }

  const isZh = lang === 'zh';

  return (
    <div className="h-screen flex flex-col bg-[#F7F3EE] overflow-hidden" style={{ fontFamily: 'var(--ui-font)' }}>
      {/* Header */}
      <header className="shrink-0 bg-[#1E1C1A] text-[#F7F3EE] px-5 h-12 flex items-center gap-3 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#F7F3EE]/60 hover:text-[#F7F3EE] transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          {isZh ? '返回' : 'Back'}
        </button>
        <div className="w-px h-4 bg-[#F7F3EE]/20" />
        <span className="text-[#F7F3EE]/90 text-sm font-medium">{t.settingsTitle}</span>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="max-w-xl mx-auto px-6 py-10 flex flex-col gap-8">

          {/* ── Section: Interface Language ── */}
          <section>
            <SectionHeader icon={<Languages size={15} />} title={t.interfaceLanguage} />
            <p className="text-xs text-[#7A7165] mb-4 leading-relaxed">{t.interfaceLanguageDesc}</p>
            <div className="flex gap-2 flex-wrap">
              {LANG_OPTIONS.map(opt => {
                const active = uiLang === opt.id;
                const label = isZh ? opt.labelZh : opt.labelEn;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleLangChange(opt.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-all ${
                      active
                        ? 'bg-[#3B3094] border-[#3B3094] text-white shadow-sm'
                        : 'bg-[#FDFAF6] border-[#1E1C1A]/12 text-[#1E1C1A] hover:border-[#3B3094]/40 hover:bg-white'
                    }`}
                  >
                    {active && <Check size={12} className="shrink-0" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <Divider />

          {/* ── Section: Translation ── */}
          <section>
            <SectionHeader icon={<Globe2 size={15} />} title={t.translationSettings} />
            <p className="text-xs text-[#7A7165] mb-4 leading-relaxed">{t.translationProviderDesc}</p>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm bg-[#3B3094] border-[#3B3094] text-white shadow-sm"
              >
                <Check size={12} />
                {t.googleTranslate}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-[#7A7165]/70 italic">
              {isZh ? '更多翻译引擎将在后续版本中添加。' : 'More engines will be added in future versions.'}
            </p>
          </section>

          <Divider />

          {/* ── Section: AI Chat ── */}
          <section>
            <SectionHeader icon={<Bot size={15} />} title={t.aiSettings} />
            <p className="text-xs text-[#7A7165] mb-5 leading-relaxed">{t.aiSettingsDesc}</p>

            {/* Provider + Key in one row group */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1E1C1A] mb-2">{t.aiProvider}</label>
                <select
                  value={aiProvider}
                  onChange={e => handleProviderChange(e.target.value as AIProvider)}
                  className="w-full px-3 py-2 rounded-lg border border-[#1E1C1A]/12 bg-[#F7F3EE] focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] text-sm appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A7165' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  {AI_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1E1C1A] mb-2">{t.apiKey}</label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input
                      type={keyVisible ? 'text' : 'password'}
                      value={apiKeys[aiProvider] ?? ''}
                      onChange={e => setApiKeys(prev => ({ ...prev, [aiProvider]: e.target.value }))}
                      placeholder={`${AI_PROVIDERS.find(p => p.id === aiProvider)?.keyPrefix}… ${t.apiKeyPlaceholder}`}
                      className="w-full px-3 py-2 pr-9 rounded-lg border border-[#1E1C1A]/12 bg-[#F7F3EE] focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165]/60 text-sm"
                      style={{ fontFamily: 'var(--mono-font)', fontSize: '0.8125rem' }}
                    />
                    <button
                      onClick={() => setKeyVisible(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7165] hover:text-[#1E1C1A] transition-colors"
                      tabIndex={-1}
                    >
                      {keyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button
                    onClick={handleSaveKey}
                    disabled={!(apiKeys[aiProvider] ?? '').trim()}
                    className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      keySaved
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : (apiKeys[aiProvider] ?? '').trim()
                          ? 'bg-[#3B3094] text-white hover:bg-[#2d2470]'
                          : 'bg-[#EDE8E0] text-[#7A7165]/50 cursor-not-allowed'
                    }`}
                  >
                    {keySaved ? <><Check size={12} />{t.apiKeySaved}</> : t.saveApiKey}
                  </button>
                </div>
              </div>
            </div>

            {/* Security note */}
            <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-[#EDE8E0]/60 border border-[#1E1C1A]/6">
              <ShieldCheck size={13} className="text-[#7A7165] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[#7A7165] leading-relaxed">{t.apiKeyHint}</p>
            </div>
          </section>

          {/* Bottom spacer */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[#3B3094]">{icon}</span>
      <h2 className="text-sm font-semibold text-[#1E1C1A] tracking-wide">{title}</h2>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[#1E1C1A]/8" />;
}
