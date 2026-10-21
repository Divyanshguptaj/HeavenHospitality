import { createContext, useContext } from 'react'
import { siteData, whatsappLink } from '../data/siteData'

export const SiteDataContext = createContext({ siteData, whatsappLink })

export function useSiteData() {
  return useContext(SiteDataContext)
}