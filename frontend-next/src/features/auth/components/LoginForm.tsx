"use client";

import { useState, type KeyboardEvent } from "react";
import { loginUser } from "../services/auth.service";
import { useRouter } from "next/navigation";
import type { LoginPageProps } from "../types/auth.types";

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async () => {
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }

    try {
      const user = await loginUser({
        username: username.trim(),
        password: password,
        remember_me: rememberMe,
      });

      if (typeof onLoginSuccess === "function") {
        onLoginSuccess(user, rememberMe); // Pass entire user object
      } else {
        router.push("/plans/new");
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message || "Could not reach server. Is FastAPI running?");
      } else {
        setError("Could not reach server. Is FastAPI running?");
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleSubmit();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div
            className="px-10 pt-10 pb-8 text-center"
            style={{ backgroundColor: "#BE0000" }}
          >
            <div
              className="w-25 h-25 bg-white rounded-full mx-auto mb-5 flex items-center justify-center shadow-lg"
              style={{ width: "100px", height: "100px" }}
            >
              <div className="text-5xl font-bold" style={{ color: "#BE0000" }}>
                S
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Schedge</h1>
            <p className="text-white/90 text-base">Login</p>
          </div>

          <div className="px-10 py-10">
            <div className="space-y-7">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-lg text-base">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="username"
                  className="block text-base font-medium text-slate-700 mb-2"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-5 py-4 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BE0000]/50 transition-all"
                  placeholder="Enter your username"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-base font-medium text-slate-700 mb-2"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-5 py-4 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BE0000]/50 transition-all"
                  placeholder="Enter your password"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 cursor-pointer"
                    style={{ accentColor: "#BE0000" }}
                  />
                  <span className="ml-2 text-base text-slate-600">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    alert("Password reset functionality coming soon!")
                  }
                  className="text-base font-medium hover:underline"
                  style={{ color: "#BE0000" }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                className="w-full py-4 px-5 text-white text-lg font-semibold rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg"
                style={{ backgroundColor: "#BE0000" }}
              >
                Sign In
              </button>
            </div>

            <div className="mt-7 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-base">
                <span className="px-2 bg-white text-slate-500">
                  Don't have an account?
                </span>
              </div>
            </div>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => alert("Registration functionality coming soon!")}
                className="text-base font-medium hover:underline"
                style={{ color: "#BE0000" }}
              >
                Create an account
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center text-base text-slate-600">
          <p>© 2025 University Advisor Chat. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
