import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollViewToTop } from "./scrollViewToTop";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    scrollViewToTop(hash);
  }, [pathname, hash]);

  return null;
}
