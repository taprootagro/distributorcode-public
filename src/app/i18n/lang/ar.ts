import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryAr } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryAr,
};

export default translations;
