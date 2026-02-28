import { useState } from 'react';
import { Bot } from 'lucide-react';
import AlfChatPanel from './AlfChatPanel';

export default function AskAlfButton({ pageContext }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 w-12 h-12 bg-alf-orange hover:bg-alf-orange text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
        title="Ask Alf"
      >
        <Bot size={22} />
      </button>

      <AlfChatPanel
        open={open}
        onClose={() => setOpen(false)}
        pageContext={pageContext}
      />
    </>
  );
}
