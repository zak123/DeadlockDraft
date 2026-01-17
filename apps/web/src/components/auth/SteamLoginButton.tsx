import { useAuth } from '../../hooks/useAuth';

export function SteamLoginButton() {
  const { login } = useAuth();

  return (
    <button
      onClick={() => login()}
      className="flex items-center gap-3 px-6 py-3 bg-[#171A21] hover:bg-[#1B2838] text-white rounded-lg transition-colors border border-[#2A475E]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 259"
        className="w-6 h-6"
        fill="currentColor"
      >
        <path d="M127.778 0C60.404 0 5.24 52.412.392 118.608l68.14 28.2c5.79-3.97 12.778-6.296 20.32-6.296 1.047 0 2.082.047 3.107.125l30.398-44.064v-.618c0-28.12 22.876-50.996 50.996-50.996s50.996 22.876 50.996 50.996-22.876 50.995-50.996 50.995h-1.148l-43.34 30.93c0 .846.06 1.693.06 2.564 0 21.112-17.17 38.282-38.283 38.282-18.907 0-34.626-13.747-37.74-31.792L4.1 166.018C22.016 217.728 70.494 255.272 127.778 255.272c70.574 0 127.778-57.204 127.778-127.778S198.352 0 127.778 0" />
      </svg>
      <span className="font-medium">Sign in with Steam</span>
    </button>
  );
}
