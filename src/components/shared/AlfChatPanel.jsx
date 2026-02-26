import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Copy, Check } from 'lucide-react';
import { chatWithAgent } from '../../agents/api';

export default function AlfChatPanel({ open, onClose, pageContext }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMessages([{
        role: 'assistant',
        content: `I'm Alf, your platform assistant. I can help with tenants, agent configs, usage, settings, and more. What do you need?`,
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = updated
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(1) // skip the initial greeting
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await chatWithAgent('alfPlatform', apiMessages, { pageContext });
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-screen w-full md:w-[420px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 rounded">
              <Bot size={16} className="text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-dark-text">Alf</div>
              <div className="text-[11px] text-secondary-text">{pageContext || 'Platform Assistant'}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={14} className="text-amber-600" />
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                <div
                  className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-500 text-white ml-auto'
                      : 'bg-gray-50 text-dark-text'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                {msg.role === 'assistant' && i > 0 && (
                  <button
                    onClick={() => handleCopy(msg.content, i)}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-secondary-text hover:text-dark-text transition-colors"
                  >
                    {copiedIdx === i ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={14} className="text-secondary-text" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <Bot size={14} className="text-amber-600" />
              </div>
              <div className="bg-gray-50 rounded-lg px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask Alf..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
