import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useRole, UserRole } from "../RoleContext";

interface RoleRouteProps {
  allow: UserRole | readonly UserRole[];
  children: ReactNode;
}

const RoleRoute = ({ allow, children }: RoleRouteProps) => {
  const { role } = useRole();
  const location = useLocation();

  if (!(Array.isArray(allow) ? allow.includes(role) : role === allow)) {
    return <Navigate to={role === "configurator" ? "/admin/schedule" : role === "student" ? "/journal" : "/"} replace state={{ deniedPath: location.pathname }} />;
  }

  return children;
};

export default RoleRoute;
