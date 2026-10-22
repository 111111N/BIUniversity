import { Link, useLocation, useNavigate, type LinkProps } from "react-router-dom";
import { getProfileOrigin, profileOriginLabel } from "../../domain/profileNavigation";

const ProfileLink = ({ state, returnTo, onClick, to, replace, relative, preventScrollReset, target, download, ...props }: LinkProps & { returnTo?: string }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const captureOrigin = () => ({ to: returnTo ?? `${location.pathname}${location.search}${location.hash}`, label: profileOriginLabel(location.pathname), scrollY: typeof window === "undefined" ? 0 : window.scrollY, scrollAreas: typeof document === "undefined" ? [] : [...document.querySelectorAll<HTMLElement>("[data-profile-scroll]")].map((element) => ({ key: element.dataset.profileScroll!, top: element.scrollTop, left: element.scrollLeft })) });
  return <Link {...props} to={to} target={target} download={download} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || target && target !== "_self" || download) return;
    event.preventDefault();
    void navigate(to, { replace, relative, preventScrollReset, state: { ...(state && typeof state === "object" ? state : {}), profileOrigin: captureOrigin() } });
  }} />;
};

export const ProfileBackLink = ({ fallback, className }: { fallback: string; className?: string }) => {
  const location = useLocation();
  const origin = getProfileOrigin(location.state, fallback);
  return <Link className={className} to={origin.to} state={{ restoreScroll: origin.scrollY, restoreAreas: origin.scrollAreas }}>← {origin.label}</Link>;
};

export default ProfileLink;
