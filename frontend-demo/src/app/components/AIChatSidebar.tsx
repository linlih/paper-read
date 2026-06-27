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

const MOCK_RESPONSES_ZH: Record<string, string> = {
  attention: '注意力机制（Attention Mechanism）通过计算查询（Query）与键（Key）之间的相似度来为值（Value）分配权重，公式为 Attention(Q,K,V) = softmax(QKᵀ/√dₖ)V。缩放因子 √dₖ 防止点积在高维空间中过大，避免 softmax 梯度消失。',
  transformer: 'Transformer 架构完全抛弃了 RNN 的顺序计算方式，改用自注意力机制并行处理所有 token。这使得训练效率大幅提升，因为 GPU 可以同时计算所有位置的注意力，而不必按时间步顺序展开。',
  bert: 'BERT 采用双向 Transformer 编码器，通过"掩码语言模型"（MLM）预训练——随机遮住 15% 的 token，要求模型利用左右双侧上下文来预测被遮住的词。这与 GPT 的单向（从左到右）生成不同，使 BERT 在理解类任务上更出色。',
  pretraining: '预训练是指先在海量无标注语料上训练一个通用语言模型，再针对具体下游任务进行微调（Fine-tuning）。核心思想是迁移学习：预训练阶段习得的语言规律、语法、世界知识，可以高效迁移到数据量更少的专项任务。',
  default: '这段文字是论文的核心论点之一。作者在此建立了方法论基础——相比于依赖顺序计算的 RNN，所提出的方法允许模型在所有位置之间建立直接依赖，从而大幅提升了并行训练能力，并在长程依赖建模上具有天然优势。',
};

const MOCK_RESPONSES_EN: Record<string, string> = {
  attention: "The attention mechanism works by computing a weighted sum of values, where the weights are determined by the compatibility between a query and a set of keys. The formula is: Attention(Q, K, V) = softmax(QK^T / √d_k)V. The scaling factor √d_k prevents the dot products from becoming too large in high dimensions, which would push softmax into regions with very small gradients.",
  transformer: "The Transformer architecture introduced in 'Attention Is All You Need' relies entirely on self-attention mechanisms, abandoning recurrence and convolutions. This was a paradigm shift because recurrent models process tokens sequentially, while the Transformer processes all tokens simultaneously, making it far more efficient to train on modern GPUs.",
  bert: "BERT differs from GPT in that it is pre-trained to predict masked tokens using context from both left AND right. This bidirectional context makes BERT especially effective for understanding tasks (classification, NER, QA). GPT, by contrast, is unidirectional (left-to-right) and excels at generation tasks.",
  pretraining: "Pre-training refers to training a model on a large, general corpus of text before fine-tuning it on a specific downstream task. The model learns general language patterns and world knowledge during pre-training that can then be efficiently adapted to specific tasks with far less labeled data.",
  default: "That's an interesting passage. In context, the authors are establishing a key methodological claim — rather than relying on sequential computation (as in RNNs), the proposed mechanism allows all positions to attend to each other simultaneously, enabling much better parallelization and stronger long-range dependency modeling.",
};

export function mockResponse(text: string, selectedText: string | undefined, lang: string): string {
  const combined = ((selectedText || '') + ' ' + text).toLowerCase();
  const responses = lang === 'zh' ? MOCK_RESPONSES_ZH : MOCK_RESPONSES_EN;
  if (combined.includes('attention') || combined.includes('softmax') || combined.includes('注意力')) return responses.attention;
  if (combined.includes('transformer') || combined.includes('encoder') || combined.includes('编码器')) return responses.transformer;
  if (combined.includes('bert') || combined.includes('bidirectional') || combined.includes('双向')) return responses.bert;
  if (combined.includes('pre-train') || combined.includes('fine-tun') || combined.includes('预训练')) return responses.pretraining;
  return responses.default;
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
