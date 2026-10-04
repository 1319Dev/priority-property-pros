import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyPublicMeta, isContractorDetailPath, resolvePublicMeta } from "../../data/publicSeo";

export function PublicPageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (isContractorDetailPath(pathname)) return;
    applyPublicMeta(resolvePublicMeta(pathname));
  }, [pathname]);

  return null;
}
