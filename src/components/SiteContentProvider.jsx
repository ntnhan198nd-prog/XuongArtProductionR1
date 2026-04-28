"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const SiteContentContext = createContext(DEFAULT_SITE_CONTENT);

export function SiteContentProvider({ value, children }) {
  return (
    <SiteContentContext.Provider value={value || DEFAULT_SITE_CONTENT}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContent() {
  return useContext(SiteContentContext);
}
