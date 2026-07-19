import React, { useState, useRef, useEffect } from 'react';
import { streamChat } from '../services/chat.api.js';

export const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { sender: 'USER', content: input };
    const currentHistory = [...messages];
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    let aiResponse = { sender: 'AI', content: '' };
    setMessages(prev => [...prev, aiResponse]);

    await streamChat(
      userMessage.content,
      currentHistory,
      (chunk) => {
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content += chunk;
          return newMessages;
        });
      },
      (err) => {
        console.error('Chat error:', err);
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = `[Error: ${err.message}]`;
          return newMessages;
        });
      }
    );
    
    setIsTyping(false);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden">
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${msg.sender === 'USER' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-200 border border-neutral-700'}`}>
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-neutral-800 text-neutral-400 p-3 rounded-lg border border-neutral-700 text-sm">
              AI is typing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 bg-neutral-800 border-t border-neutral-700">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-neutral-700 text-white border border-neutral-600 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={isTyping || !input.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
