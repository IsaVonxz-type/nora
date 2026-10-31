import { useEffect } from "react";

let activeLocks = 0;
let savedCssText = "";
let savedScrollY = 0;

export function useBodyScrollLock() {
  useEffect(() => {
    if (activeLocks === 0) {
      savedScrollY = window.scrollY;
      savedCssText = document.body.style.cssText;
      document.body.style.cssText = `${savedCssText};overflow:hidden;position:fixed;top:-${savedScrollY}px;width:100%`;
    }
    activeLocks += 1;
    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) {
        document.body.style.cssText = savedCssText;
        window.scrollTo(0, savedScrollY);
      }
    };
  }, []);
}
