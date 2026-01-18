import { api } from '../../services/api';

interface TwitchLoginButtonProps {
  returnTo?: string;
  variant?: 'link' | 'unlink';
  onUnlink?: () => void;
}

export function TwitchLoginButton({ returnTo, variant = 'link', onUnlink }: TwitchLoginButtonProps) {
  const handleClick = async () => {
    if (variant === 'unlink' && onUnlink) {
      try {
        await api.unlinkTwitch();
        onUnlink();
      } catch (error) {
        console.error('Failed to unlink Twitch:', error);
      }
    } else {
      window.location.href = api.getTwitchLoginUrl(returnTo);
    }
  };

  if (variant === 'unlink') {
    return (
      <button
        onClick={handleClick}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 px-6 py-3 bg-[#9146FF] hover:bg-[#7B2FFF] text-white rounded-lg transition-colors"
    >
      <TwitchIcon />
      <span className="font-medium">Link Twitch Account</span>
    </button>
  );
}

function TwitchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="currentColor"
    >
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}
