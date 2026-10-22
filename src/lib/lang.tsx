import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ur, en, type Dict } from "./i18n";

export type Lang = "ur" | "en";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
  dir: "rtl" | "ltr";
}

const Ctx = createContext<LangCtx | null>(null);

const STORAGE_KEY = "pd_lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "en" ? "en" : "ur";
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "en" ? "en" : "ur";
      document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    }
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);

  const value: LangCtx = {
    lang,
    setLang,
    t: lang === "en" ? en : ur,
    dir: lang === "en" ? "ltr" : "rtl",
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}

export function useT(): Dict {
  return useLang().t;
}