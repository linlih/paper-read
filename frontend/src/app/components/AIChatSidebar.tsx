import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Sparkles, MessageSquare } from 'lucide-react';
import type { ChatMessage } from './types';
import type { T } from './i18n';

interface AIChatSidebarProps {
  messages: ChatMessage[];
  onSend: (text: string, selectedText?: string) => void;
  pendingSelectedText: string | null;
  onClearPending: () => void;
  onClose: () => void;
  t: T;
}

export function AIChatSidebar({ messages, onSend, pendingSelectedText, onClearPending, onClose, t }: AIChatSidebarProps) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onSend(text, pendingSelectedText || undefined);
    setInput('');
    onClearPending();
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 1500);
  }

  return (
    <div className="flex flex-col h-full bg-[#FDFAF6]" style={{ fontFamily: 'var(--ui-font)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1C1A]/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#3B3094] flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-medium text-[#1E1C1A]">{t.aiAssistant}</div>
            <div className="text-xs text-[#7A7165]">{t.aiSubtitle}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#EDE8E0] text-[#7A7165] transition-colors"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4" style={{ scrollbarWidth: 'thin' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-[#7A7165] gap-3 px-4">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-sm leading-relaxed">{t.noMessages}</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${msg.role === 'assistant' ? 'bg-[#3B3094]' : 'bg-[#EDE8E0]'}`}>
              {msg.role === 'assistant' ? <Bot size={12} className="text-white" /> : <User size={12} className="text-[#7A7165]" />}
            </div>
            <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {msg.selectedText && (
                <div className="text-xs px-2.5 py-1.5 rounded-lg bg-yellow-50 border border-yellow-200 text-[#7A7165] italic line-clamp-2">
                  "{msg.selectedText}"
                </div>
              )}
              <div className={`px-3 py-2.5 rounded-xl text-sm leading-relaxed ${msg.role === 'assistant' ? 'bg-[#EDE8E0] text-[#1E1C1A]' : 'bg-[#3B3094] text-white'}`}>
                {msg.content}
              </div>
              <div className="text-xs text-[#7A7165]/60">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-6 h-6 rounded-full bg-[#3B3094] flex items-center justify-center"><Bot size={12} className="text-white" /></div>
            <div className="px-3 py-2.5 rounded-xl bg-[#EDE8E0] flex items-center gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#7A7165] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingSelectedText && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 flex items-start gap-2">
          <div className="flex-1 text-xs text-[#7A7165] italic line-clamp-2">"{pendingSelectedText}"</div>
          <button onClick={onClearPending} className="text-[#7A7165] hover:text-[#1E1C1A]"><X size={12} /></button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-[#1E1C1A]/10">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t.inputPlaceholder}
            rows={2}
            className="flex-1 px-3 py-2.5 rounded-lg bg-[#EDE8E0] border border-transparent focus:border-[#3B3094] focus:outline-none text-[#1E1C1A] placeholder:text-[#7A7165] resize-none text-sm transition-colors"
            style={{ lineHeight: 1.5 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 rounded-lg bg-[#3B3094] text-white hover:bg-[#2d2470] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-[#7A7165] mt-1.5">{t.enterSend}</p>
      </div>
    </div>
  );
}
