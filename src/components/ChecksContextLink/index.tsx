import type { ComponentProps } from "react";
import { Link, useLocation } from "react-router-dom";
import { inheritChecksReturn } from "../../domain/administrationChecksNavigation";

export default function ChecksContextLink({ to, ...props }: ComponentProps<typeof Link>) {
  const location = useLocation();
  const target = typeof to === "string" ? inheritChecksReturn(to, location.pathname, location.search) : to;
  return <Link {...props} to={target} />;
}
