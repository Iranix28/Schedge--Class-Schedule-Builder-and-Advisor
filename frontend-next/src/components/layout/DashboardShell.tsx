"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getCurrentUser,
  logoutUser,
} from "@/features/auth/services/auth.service";
import Sidebar from "@/features/sidebar/components/Sidebar";

interface DashboardUser {
  id: number | string;
  username?: string;
  role?: string;
}

interface DashboardShellContextValue {
  userData: DashboardUser;
  onLogout: () => Promise<void>;
  sidebarRefreshKey: number;
  refreshSidebar: () => void;
}

const DashboardShellContext = createContext<DashboardShellContextValue | null>(
  null,
);

export function useDashboardShell() {
  const context = useContext(DashboardShellContext);

  if (!context) {
    throw new Error("useDashboardShell must be used inside DashboardShell");
  }

  return context;
}

export default function DashboardShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<DashboardUser | null>(null);

  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        setUserData({
          id: user.id,
          username: user.username,
          role: user.role,
        });
        setIsAuthenticated(true);
      } catch {
        router.replace("/login");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [router]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // ignore logout failure
    }

    setIsAuthenticated(false);
    setUserData(null);
    router.replace("/login");
  }, [router]);

  const handleSidebarPlanDeleted = useCallback(
    (deletedPlanId: number | string) => {
      refreshSidebar();

      const deletedId = String(deletedPlanId);

      if (
        pathname === `/plans/${deletedId}` ||
        pathname.startsWith(`/plans/${deletedId}/semester/`)
      ) {
        router.push("/plans/saved");
      }
    },
    [pathname, refreshSidebar, router],
  );

  const contextValue = useMemo(() => {
    if (!userData) return null;

    return {
      userData,
      onLogout: handleLogout,
      sidebarRefreshKey,
      refreshSidebar,
    };
  }, [userData, handleLogout, sidebarRefreshKey, refreshSidebar]);

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-600">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !userData || !contextValue) {
    return null;
  }

  return (
    <DashboardShellContext.Provider value={contextValue}>
      <div className="h-screen">
        <Sidebar
          userData={userData}
          refreshKey={sidebarRefreshKey}
          onLogout={handleLogout}
          onPlanDeleted={handleSidebarPlanDeleted}
        />

        <div style={{ marginLeft: "260px", height: "100%" }}>{children}</div>
      </div>
    </DashboardShellContext.Provider>
  );
}
