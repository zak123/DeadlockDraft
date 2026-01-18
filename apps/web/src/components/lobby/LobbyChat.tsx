import { useState, useRef, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import type { ChatMessage } from '../../hooks/useChat';
import type { ChatChannel, Team } from '@deadlock-draft/shared';

interface LobbyChatProps {
  currentUserId?: string;
  currentSessionToken?: string;
  messages: ChatMessage[];
  sendMessage: (message: string, channel?: ChatChannel) => void;
  isDraftActive?: boolean;
  currentTeam?: Team;
}

export function LobbyChat({
  currentUserId,
  currentSessionToken,
  messages,
  sendMessage,
  isDraftActive = false,
  currentTeam,
}: LobbyChatProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel>('team');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter messages based on selected channel during draft
  const filteredMessages = useMemo(() => {
    if (!isDraftActive) {
      // Not in draft, show all messages
      return messages;
    }

    return messages.filter((msg) => {
      // System messages always show
      if (msg.isSystem) return true;

      // During draft with team chat selected, show only team messages
      if (selectedChannel === 'team') {
        return msg.channel === 'team' && msg.senderTeam === currentTeam;
      }

      // All chat - show all channel messages
      return msg.channel === 'all';
    });
  }, [messages, isDraftActive, selectedChannel, currentTeam]);

  // Check if user is on a team (can use team chat)
  const canUseTeamChat = currentTeam === 'amber' || currentTeam === 'sapphire';

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      // During draft, use selected channel; otherwise use 'all'
      const channel = isDraftActive && canUseTeamChat ? selectedChannel : 'all';
      sendMessage(input, channel);
      setInput('');
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isOwnMessage = (msg: ChatMessage) => {
    if (currentUserId && msg.senderId === currentUserId) return true;
    if (currentSessionToken && msg.senderId.includes(currentSessionToken)) return true;
    return false;
  };

  // Get chat title based on context
  const getChatTitle = () => {
    if (!isDraftActive || !canUseTeamChat) return 'Chat';
    return selectedChannel === 'team' ? 'Team Chat' : 'All Chat';
  };

  // Collapsed state - just show header bar
  if (!isExpanded) {
    return (
      <div
        className="card px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-deadlock-card/80 transition-colors"
        onClick={() => setIsExpanded(true)}
      >
        <span className="font-medium text-sm">{getChatTitle()}</span>
        <div className="flex items-center gap-2">
          {filteredMessages.length > 0 && (
            <span className="text-xs bg-amber text-black px-2 py-0.5 rounded-full">
              {filteredMessages.length}
            </span>
          )}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="card flex flex-col h-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-deadlock-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="hover:bg-deadlock-border/30 p-1 rounded transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <span className="font-medium text-sm">{getChatTitle()}</span>
        </div>

        {/* Channel toggle - only show during draft when on a team */}
        {isDraftActive && canUseTeamChat && (
          <div className="flex rounded-lg overflow-hidden border border-deadlock-border">
            <button
              onClick={() => setSelectedChannel('team')}
              className={clsx(
                'px-2 py-1 text-xs transition-colors',
                selectedChannel === 'team'
                  ? 'bg-amber text-black font-medium'
                  : 'bg-deadlock-bg text-deadlock-muted hover:text-white'
              )}
            >
              Team
            </button>
            <button
              onClick={() => setSelectedChannel('all')}
              className={clsx(
                'px-2 py-1 text-xs transition-colors',
                selectedChannel === 'all'
                  ? 'bg-amber text-black font-medium'
                  : 'bg-deadlock-bg text-deadlock-muted hover:text-white'
              )}
            >
              All
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {filteredMessages.length === 0 ? (
          <div className="text-center text-deadlock-muted text-sm py-4">
            {isDraftActive && selectedChannel === 'team'
              ? 'No team messages yet'
              : 'No messages yet'}
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className={clsx(
                'text-sm',
                msg.isSystem && 'text-center'
              )}
            >
              {msg.isSystem ? (
                <span className="text-amber/80 italic text-xs">
                  {msg.message}
                </span>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-deadlock-muted text-xs shrink-0">
                    {formatTime(msg.timestamp)}
                  </span>
                  <div>
                    <span
                      className={clsx(
                        'font-medium',
                        isOwnMessage(msg) ? 'text-amber' : 'text-white'
                      )}
                    >
                      {msg.senderName}:
                    </span>{' '}
                    <span className="text-gray-300 break-words">{msg.message}</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2 border-t border-deadlock-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 px-3 py-1.5 bg-deadlock-bg border border-deadlock-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-amber"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 py-1.5 bg-amber hover:bg-amber/80 text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
