export interface SidebarUser {
  id: number | string;
  username?: string;
  role?: string;
}

export interface SidebarPlan {
  id: number | string;
  name: string;
  mode: string;
  term_season?: string;
  term_year?: string | number;
  [key: string]: unknown;
}

export interface SidebarProps {
  userData: SidebarUser | null;
  onNewChat?: () => void;
  onSelectSavedPlan: (plan: Record<string, unknown>) => void;
  onNavigate: (mode: string | null) => void;
  refreshKey: number;
  onLogout: () => void;
  onPlanDeleted?: (deletedPlanId: number | string) => void;
}