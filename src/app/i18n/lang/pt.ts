import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryPt } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryPt,
};

export default translations;
