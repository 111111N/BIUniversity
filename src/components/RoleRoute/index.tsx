import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useRole, UserRole } from "../RoleContext";

interface RoleRouteProps {
  allow: UserRole;
  children: ReactNode;
}

const RoleRoute = ({ allow, children }: RoleRouteProps) => {
  const { role } = useRole();
  const location = useLocation();

  if (role !== allow) {
    return <Navigate to={role === "student" ? "/journal" : "/"} replace state={{ deniedPath: location.pathname }} />;
  }

  return children;
};

export default RoleRoute;
