import React, { useState, useId } from "react";
import { useAuth } from "../../context/AuthContext.js";
import { USERNAME_CHANGE_COOLDOWN_MS } from "@pageshooter/shared";

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "login" | "register";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = "login"
}) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    loginWithGoogle,
    linkGoogle,
    changeUsername,
    logout,
    clearError
  } = useAuth();

  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [showGoogleTokenInput, setShowGoogleTokenInput] = useState(false);
  const [googleIdToken, setGoogleIdToken] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const identifierId = useId();
  const passwordId = useId();
  const regEmailId = useId();
  const regUsernameId = useId();
  const regPasswordId = useId();
  const newUsernameId = useId();
  const googleTokenId = useId();

  if (!isOpen) return null;

  const handleTabChange = (tab: "login" | "register") => {
    setActiveTab(tab);
    clearError();
    setSuccessMessage(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage(null);
    try {
      await login({ identifier, password });
      setPassword("");
      onClose();
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage(null);
    try {
      await register({
        email: regEmail,
        username: regUsername,
        password: regPassword
      });
      setRegPassword("");
      onClose();
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleIdToken.trim()) return;
    clearError();
    setSuccessMessage(null);
    try {
      if (isAuthenticated) {
        await linkGoogle(googleIdToken.trim());
        setSuccessMessage("Google account successfully linked!");
        setGoogleIdToken("");
        setShowGoogleTokenInput(false);
      } else {
        await loginWithGoogle({ idToken: googleIdToken.trim() });
        setGoogleIdToken("");
        onClose();
      }
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleChangeUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    clearError();
    setSuccessMessage(null);
    try {
      await changeUsername(newUsername.trim());
      setSuccessMessage("Username updated successfully!");
      setNewUsername("");
    } catch {
      // Error handled by AuthContext
    }
  };

  // Cooldown calculation
  const getUsernameCooldownRemainingDays = (): number => {
    if (!user?.usernameUpdatedAt) return 0;
    const updatedAt = new Date(user.usernameUpdatedAt).getTime();
    const elapsed = Date.now() - updatedAt;
    const remainingMs = USERNAME_CHANGE_COOLDOWN_MS - elapsed;
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  };

  const cooldownDays = getUsernameCooldownRemainingDays();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="cartoon-card-lg relative w-full max-w-md bg-[#241938] p-6 text-[#FFFDF7] font-sans overflow-hidden">
        {/* Header & Close Button */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[#1E1410] mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-2xl drop-shadow-[2px_2px_0_#1E1410]">📜</span>
            <h2 id="auth-modal-title" className="text-xl font-bold font-fredoka text-[#FFB703] tracking-wide drop-shadow-[1px_1px_0_#1E1410]">
              {isAuthenticated ? "Player Folio Profile" : "Storybook Gate"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="cartoon-btn w-8 h-8 flex items-center justify-center rounded-xl bg-[#34264D] hover:bg-[#433163] text-[#FFFDF7] font-bold"
          >
            ✕
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-950/80 border border-red-500/50 rounded-lg text-red-200 text-xs flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Global Success Banner */}
        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-lg text-emerald-200 text-xs flex items-center space-x-2">
            <span className="text-base">✨</span>
            <span className="flex-1">{successMessage}</span>
          </div>
        )}

        {isAuthenticated && user ? (
          /* Profile & Account Management View */
          <div className="space-y-4">
            <div className="bg-[#1f1927] p-4 rounded-xl border border-[#362944] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#a394b3]">Scribe Username:</span>
                <span className="font-bold text-[#f5ede0]">{user.username}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#a394b3]">Registered Email:</span>
                <span className="text-xs text-[#d1c7dc]">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#a394b3]">Folio Inscription:</span>
                <span className="text-xs text-[#a394b3]">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Change Username Section */}
            <div className="bg-[#1f1927] p-4 rounded-xl border border-[#362944] space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f59e0b]">
                Change Username
              </h3>
              {cooldownDays > 0 ? (
                <div className="text-xs text-[#c4b58a] bg-[#2b2518] p-2.5 rounded-lg border border-[#6b582b]">
                  ⏳ Username changed recently. You can change it again in <strong>{cooldownDays} days</strong>.
                </div>
              ) : (
                <form onSubmit={handleChangeUsernameSubmit} className="space-y-2">
                  <div className="flex space-x-2">
                    <input
                      id={newUsernameId}
                      type="text"
                      placeholder="New username (3-20 chars)"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      disabled={isLoading}
                      className="flex-1 bg-[#131018] border border-[#443355] rounded-lg px-3 py-1.5 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !newUsername.trim()}
                      className="px-3 py-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold text-xs rounded-lg disabled:opacity-50 transition-colors"
                    >
                      Update
                    </button>
                  </div>
                  <p className="text-[10px] text-[#8e819e]">30-day cooldown between username modifications.</p>
                </form>
              )}
            </div>

            {/* Google Account Linking Section */}
            <div className="bg-[#1f1927] p-4 rounded-xl border border-[#362944] space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f59e0b]">
                Google Account Connection
              </h3>
              <button
                type="button"
                onClick={() => setShowGoogleTokenInput(!showGoogleTokenInput)}
                className="w-full py-2 px-3 bg-[#261f30] hover:bg-[#342a42] border border-[#4b3a5e] rounded-lg text-xs font-semibold text-[#f5ede0] flex items-center justify-center space-x-2 transition-colors"
              >
                <span>🌐</span>
                <span>Link Google Identity</span>
              </button>

              {showGoogleTokenInput && (
                <form onSubmit={handleGoogleSubmit} className="mt-2 space-y-2 animate-fadeIn">
                  <input
                    id={googleTokenId}
                    type="password"
                    placeholder="Enter Google ID Token"
                    value={googleIdToken}
                    onChange={(e) => setGoogleIdToken(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#131018] border border-[#443355] rounded-lg px-3 py-1.5 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !googleIdToken.trim()}
                    className="w-full py-1.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-black font-bold text-xs rounded-lg disabled:opacity-50 transition-colors"
                  >
                    Confirm Account Link
                  </button>
                </form>
              )}
            </div>

            {/* Log Out Button */}
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="w-full py-2.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-200 font-bold text-xs rounded-xl transition-colors"
            >
              Sign Out of Storybook
            </button>
          </div>
        ) : (
          /* Authentication Form Tabs (Login / Register) */
          <div>
            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#1c1724] rounded-xl border border-[#31253e] mb-4">
              <button
                type="button"
                onClick={() => handleTabChange("login")}
                className={`py-2 text-xs font-bold rounded-lg transition-colors ${
                  activeTab === "login"
                    ? "bg-[#f59e0b] text-black shadow-md"
                    : "text-[#a394b3] hover:text-[#f5ede0]"
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("register")}
                className={`py-2 text-xs font-bold rounded-lg transition-colors ${
                  activeTab === "register"
                    ? "bg-[#f59e0b] text-black shadow-md"
                    : "text-[#a394b3] hover:text-[#f5ede0]"
                }`}
              >
                Create Account
              </button>
            </div>

            {activeTab === "login" ? (
              /* Login Form */
              <form onSubmit={handleLoginSubmit} className="space-y-3">
                <div>
                  <label htmlFor={identifierId} className="block text-xs font-semibold text-[#a394b3] mb-1">
                    Email or Username
                  </label>
                  <input
                    id={identifierId}
                    type="text"
                    required
                    placeholder="e.g. Barnaby or scribe@example.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#1c1724] border border-[#3a2c4a] rounded-xl px-3 py-2 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>

                <div>
                  <label htmlFor={passwordId} className="block text-xs font-semibold text-[#a394b3] mb-1">
                    Password
                  </label>
                  <input
                    id={passwordId}
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#1c1724] border border-[#3a2c4a] rounded-xl px-3 py-2 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !identifier.trim() || !password}
                  className="cartoon-btn w-full py-2.5 mt-2 bg-[#FFB703] hover:bg-[#FFC933] text-[#1E1410] font-bold text-xs uppercase tracking-wider rounded-2xl disabled:opacity-50"
                >
                  {isLoading ? "Consulting Archives..." : "Enter Storybook"}
                </button>
              </form>
            ) : (
              /* Register Form */
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div>
                  <label htmlFor={regEmailId} className="block text-xs font-semibold text-[#a394b3] mb-1">
                    Email Address
                  </label>
                  <input
                    id={regEmailId}
                    type="email"
                    required
                    placeholder="scribe@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#1c1724] border border-[#3a2c4a] rounded-xl px-3 py-2 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>

                <div>
                  <label htmlFor={regUsernameId} className="block text-xs font-semibold text-[#a394b3] mb-1">
                    Username
                  </label>
                  <input
                    id={regUsernameId}
                    type="text"
                    required
                    minLength={3}
                    maxLength={20}
                    placeholder="3-20 characters, alphanumeric & _"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#1c1724] border border-[#3a2c4a] rounded-xl px-3 py-2 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>

                <div>
                  <label htmlFor={regPasswordId} className="block text-xs font-semibold text-[#a394b3] mb-1">
                    Password
                  </label>
                  <input
                    id={regPasswordId}
                    type="password"
                    required
                    minLength={8}
                    placeholder="Min 8 chars, 1 uppercase, 1 lowercase, 1 number"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#1c1724] border border-[#3a2c4a] rounded-xl px-3 py-2 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                  <p className="text-[10px] text-[#7a6d88] mt-1">
                    Must contain at least 8 characters with upper, lower, and numeric symbols.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !regEmail.trim() || !regUsername.trim() || !regPassword}
                  className="cartoon-btn w-full py-2.5 mt-2 bg-[#FFB703] hover:bg-[#FFC933] text-[#1E1410] font-bold text-xs uppercase tracking-wider rounded-2xl disabled:opacity-50"
                >
                  {isLoading ? "Inscribing Account..." : "Create Folio Account"}
                </button>
              </form>
            )}

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#31253e]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#16131c] px-3 text-[#7a6d88]">or continue with</span>
              </div>
            </div>

            {/* Google OAuth Section */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowGoogleTokenInput(!showGoogleTokenInput)}
                className="w-full py-2.5 px-4 bg-[#1f1927] hover:bg-[#2c2238] border border-[#443355] text-xs font-bold text-[#f5ede0] rounded-xl flex items-center justify-center space-x-2 transition-colors shadow-sm"
              >
                <span>🌐</span>
                <span>Sign In with Google</span>
              </button>

              {showGoogleTokenInput && (
                <form onSubmit={handleGoogleSubmit} className="mt-2 space-y-2 animate-fadeIn bg-[#1f1927] p-3 rounded-xl border border-[#3a2c4a]">
                  <p className="text-[11px] text-[#b3a4c4]">
                    Enter Google ID Token (direct or verification testing):
                  </p>
                  <input
                    id={`google-login-${googleTokenId}`}
                    type="password"
                    placeholder="eyJhbGciOiJSUzI1NiIs..."
                    value={googleIdToken}
                    onChange={(e) => setGoogleIdToken(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#131018] border border-[#443355] rounded-lg px-3 py-1.5 text-xs text-[#f5ede0] focus:outline-none focus:border-[#f59e0b]"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !googleIdToken.trim()}
                    className="w-full py-1.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-black font-bold text-xs rounded-lg disabled:opacity-50 transition-colors"
                  >
                    Authenticate with Google ID Token
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
